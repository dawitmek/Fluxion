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

Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class Fg {
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  public static string Title() { var s = new StringBuilder(512); GetWindowText(GetForegroundWindow(), s, 512); return s.ToString(); }
}
"@

# Only check the title when we know what it should be: AppActivate, or manual focus with an explicit -WindowTitle.
$checkTitle = $true
if ($ManualFocusSeconds -gt 0) {
  $checkTitle = $PSBoundParameters.ContainsKey("WindowTitle")
  $target = if ($checkTitle) { "the '$WindowTitle' window" } else { "the target window" }
  Write-Host "Click $target now; sending in $ManualFocusSeconds s..."
  Start-Sleep -Seconds $ManualFocusSeconds
} else {
  # AppActivate can return True while Windows' foreground lock keeps the old window in front; the check below catches that.
  $shell = New-Object -ComObject WScript.Shell
  if (-not $shell.AppActivate($WindowTitle)) { throw "Could not focus a window titled '$WindowTitle'. Is it open?" }
  Start-Sleep -Milliseconds 700
}
$foreground = [Fg]::Title()
if ($checkTitle -and $foreground -notlike "*$WindowTitle*") {
  throw "Foreground window is '$foreground', not '$WindowTitle'. Re-run with -ManualFocusSeconds 5 and click it."
}
Write-Host "Foreground window: $foreground"

foreach ($comment in $Comments) {
  Post "/live/simulate" @{ viewer = $Viewer; text = $comment } | Out-Null
  Write-Host "sent: $comment"
  Start-Sleep -Milliseconds 600   # longer than the default 300 ms hold, so keys don't overlap
}

if ($ReadBack) {
  Add-Type -AssemblyName System.Windows.Forms
  Start-Sleep -Milliseconds 500
  [System.Windows.Forms.SendKeys]::SendWait("^a^c^{END}")   # Ctrl+End deselects so the next key doesn't replace the text
  Start-Sleep -Milliseconds 300
  Write-Host "Window text now: [$(Get-Clipboard -Raw)]"
}
