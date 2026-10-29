// What the companion tells the server about its PC: the computer's own name and its OS.

/// The name the PC goes by: Windows' computer name, the Computer Name from macOS's Sharing settings, or the hostname.
pub fn name() -> Option<String> {
    let name = platform_name()?.trim().to_string();
    (!name.is_empty()).then_some(name)
}

#[cfg(windows)]
fn platform_name() -> Option<String> {
    std::env::var("COMPUTERNAME").ok()
}

#[cfg(target_os = "macos")]
fn platform_name() -> Option<String> {
    let output = std::process::Command::new("scutil").args(["--get", "ComputerName"]).output().ok()?;
    output.status.success().then(|| String::from_utf8_lossy(&output.stdout).into_owned())
}

#[cfg(not(any(windows, target_os = "macos")))]
fn platform_name() -> Option<String> {
    std::fs::read_to_string("/etc/hostname").ok()
}

/// "windows", "macos" or "linux".
pub fn platform() -> &'static str {
    std::env::consts::OS
}
