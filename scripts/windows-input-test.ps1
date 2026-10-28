<#
Sends viewer comments through Fluxion's test mode while a target window (Notepad by default) has focus,
so the companion presses real keys into it. Optionally reads back what was typed.

Example:
  .\scripts\windows-input-test.ps1 -Email you@example.com -Password 'your-password' -ReadBack
#>
param(
  [string]$Server = "http://127.0.0.1:3000",
  [Parameter(Mandatory)][string]$Email,
  [Parameter(Mandatory)][string]$Password,
  [string]$WindowTitle = "Notepad",
  [string[]]$Comments = @("left", "right", "up", "down", "jump"),
  [string]$Viewer = "tester",
  # If AppActivate can't take focus (Windows sometimes blocks it), wait this long so a human can click the window.
  [int]$ManualFocusSeconds = 0,
  [switch]$ReadBack
)
$ErrorActionPreference = "Stop"

function Post($path, $body) {
  Invoke-RestMethod -Method Post -Uri "$Server/api$path" -ContentType "application/json" `
    -Body ($body | ConvertTo-Json -Compress) -WebSession $script:session
}

$script:session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
Post "/auth/login" @{ email = $Email; password = $Password } | Out-Null

$status = Invoke-RestMethod -Uri "$Server/api/live/status" -WebSession $session
if (-not $status.live -or $status.source -ne "simulated") {
  $status = Post "/live/start" @{ source = "simulated" }
}
Write-Host "Test mode on. Companions online: $($status.companionsOnline)"
if ($status.companionsOnline -lt 1) { Write-Warning "No companion connected; keys will not be pressed." }

if ($ManualFocusSeconds -gt 0) {
  Write-Host "Click the '$WindowTitle' window now; sending in $ManualFocusSeconds s..."
  Start-Sleep -Seconds $ManualFocusSeconds
} else {
  $shell = New-Object -ComObject WScript.Shell
  if (-not $shell.AppActivate($WindowTitle)) { throw "Could not focus a window titled '$WindowTitle'. Is it open?" }
  Start-Sleep -Milliseconds 700
}

foreach ($comment in $Comments) {
  Post "/live/simulate" @{ viewer = $Viewer; text = $comment } | Out-Null
  Write-Host "sent: $comment"
  Start-Sleep -Milliseconds 600   # longer than the default 300 ms hold, so keys don't overlap
}

if ($ReadBack) {
  Add-Type -AssemblyName System.Windows.Forms
  Start-Sleep -Milliseconds 500
  [System.Windows.Forms.SendKeys]::SendWait("^a^c")
  Start-Sleep -Milliseconds 300
  Write-Host "Window text now: [$(Get-Clipboard -Raw)]"
}
