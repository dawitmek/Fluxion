// OS-level keyboard input and window inspection on Windows and macOS; other platforms refuse actions.

use serde::Serialize;

#[derive(Serialize, Clone)]
pub struct GameWindow {
    pub title: String,
    pub process: String, // executable file name, lowercase, e.g. "gta5.exe" or "textedit"
}

#[cfg(windows)]
mod imp {
    use super::GameWindow;
    use crate::keys::{Modifier, ScanCode};
    use std::path::Path;
    use windows::Win32::Foundation::{CloseHandle, HWND, LPARAM};
    use windows::Win32::System::Threading::{
        OpenProcess, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION, QueryFullProcessImageNameW,
    };
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        INPUT, INPUT_0, INPUT_KEYBOARD, KEYBD_EVENT_FLAGS, KEYBDINPUT, KEYEVENTF_EXTENDEDKEY, KEYEVENTF_KEYUP,
        KEYEVENTF_SCANCODE, SendInput, VIRTUAL_KEY,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetForegroundWindow, GetWindowTextLengthW, GetWindowTextW, GetWindowThreadProcessId,
        IsWindowVisible,
    };
    use windows::core::{BOOL, PWSTR};

    // Windows tracks modifier state from the modifier key events themselves, so `_held` isn't needed here.
    pub fn send_key(scan: &ScanCode, up: bool, _held: &[Modifier]) -> Result<(), String> {
        let mut flags = KEYEVENTF_SCANCODE;
        if scan.extended {
            flags |= KEYEVENTF_EXTENDEDKEY;
        }
        if up {
            flags |= KEYEVENTF_KEYUP;
        }
        let input = INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: VIRTUAL_KEY(0),
                    wScan: scan.code,
                    dwFlags: KEYBD_EVENT_FLAGS(flags.0),
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        };
        let sent = unsafe { SendInput(&[input], std::mem::size_of::<INPUT>() as i32) };
        if sent == 1 { Ok(()) } else { Err("SendInput was blocked".into()) }
    }

    fn process_name(hwnd: HWND) -> Option<String> {
        let mut pid = 0u32;
        unsafe { GetWindowThreadProcessId(hwnd, Some(&mut pid)) };
        if pid == 0 {
            return None;
        }
        let handle = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) }.ok()?;
        let mut buf = [0u16; 1024];
        let mut len = buf.len() as u32;
        let ok = unsafe { QueryFullProcessImageNameW(handle, PROCESS_NAME_WIN32, PWSTR(buf.as_mut_ptr()), &mut len) };
        unsafe {
            let _ = CloseHandle(handle);
        }
        ok.ok()?;
        let path = String::from_utf16_lossy(&buf[..len as usize]);
        Path::new(&path).file_name().map(|n| n.to_string_lossy().to_lowercase())
    }

    fn window_title(hwnd: HWND) -> String {
        let len = unsafe { GetWindowTextLengthW(hwnd) };
        if len <= 0 {
            return String::new();
        }
        let mut buf = vec![0u16; len as usize + 1];
        let copied = unsafe { GetWindowTextW(hwnd, &mut buf) };
        String::from_utf16_lossy(&buf[..copied as usize])
    }

    pub fn foreground_process() -> Option<String> {
        let hwnd = unsafe { GetForegroundWindow() };
        if hwnd.is_invalid() { None } else { process_name(hwnd) }
    }

    pub fn list_windows() -> Vec<GameWindow> {
        unsafe extern "system" fn collect(hwnd: HWND, lparam: LPARAM) -> BOOL {
            let windows = unsafe { &mut *(lparam.0 as *mut Vec<GameWindow>) };
            if unsafe { IsWindowVisible(hwnd) }.as_bool() {
                let title = window_title(hwnd);
                if !title.is_empty() {
                    if let Some(process) = process_name(hwnd) {
                        windows.push(GameWindow { title, process });
                    }
                }
            }
            BOOL(1)
        }
        let mut windows: Vec<GameWindow> = Vec::new();
        unsafe {
            let _ = EnumWindows(Some(collect), LPARAM(&mut windows as *mut _ as isize));
        }
        windows.sort_by(|a, b| a.process.cmp(&b.process));
        windows.dedup_by(|a, b| a.process == b.process);
        windows
    }
}

#[cfg(target_os = "macos")]
mod imp {
    use super::GameWindow;
    use crate::keys::{Modifier, ScanCode};
    use core_foundation::base::TCFType;
    use core_foundation::boolean::CFBoolean;
    use core_foundation::dictionary::{CFDictionary, CFDictionaryRef};
    use core_foundation::string::CFString;
    use core_graphics::event::{CGEvent, CGEventFlags, CGEventTapLocation};
    use core_graphics::event_source::{CGEventSource, CGEventSourceStateID};
    use objc2_app_kit::{NSApplicationActivationPolicy, NSWorkspace};
    use std::path::Path;

    #[link(name = "ApplicationServices", kind = "framework")]
    unsafe extern "C" {
        fn AXIsProcessTrusted() -> bool;
        fn AXIsProcessTrustedWithOptions(options: CFDictionaryRef) -> bool;
    }

    // macOS drops synthetic key events from apps without Accessibility permission, silently.
    pub fn permission_problem() -> Option<&'static str> {
        if unsafe { AXIsProcessTrusted() } {
            None
        } else {
            Some("Fluxion Companion needs Accessibility permission to press keys")
        }
    }

    // Shows macOS's own prompt and opens the Accessibility settings pane.
    pub fn request_permission() {
        let options = CFDictionary::from_CFType_pairs(&[(
            CFString::new("AXTrustedCheckOptionPrompt").as_CFType(),
            CFBoolean::true_value().as_CFType(),
        )]);
        unsafe { AXIsProcessTrustedWithOptions(options.as_concrete_TypeRef()) };
        let _ = std::process::Command::new("open")
            .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")
            .spawn();
    }

    // macOS doesn't apply posted modifier key events to later events by itself, so each event carries the
    // modifiers held at that moment as flags.
    pub fn send_key(scan: &ScanCode, up: bool, held: &[Modifier]) -> Result<(), String> {
        if let Some(problem) = permission_problem() {
            return Err(problem.into());
        }
        let source = CGEventSource::new(CGEventSourceStateID::HIDSystemState).map_err(|()| "could not create an input source")?;
        let event = CGEvent::new_keyboard_event(source, scan.mac, !up).map_err(|()| "could not create a key event")?;
        let flags = held.iter().fold(CGEventFlags::CGEventFlagNull, |flags, m| {
            flags
                | match m {
                    Modifier::Control => CGEventFlags::CGEventFlagControl,
                    Modifier::Alt => CGEventFlags::CGEventFlagAlternate,
                    Modifier::Shift => CGEventFlags::CGEventFlagShift,
                }
        });
        event.set_flags(flags);
        event.post(CGEventTapLocation::HID);
        Ok(())
    }

    fn process_name(pid: i32) -> Option<String> {
        let mut buf = vec![0u8; libc::PROC_PIDPATHINFO_MAXSIZE as usize];
        let len = unsafe { libc::proc_pidpath(pid, buf.as_mut_ptr().cast(), buf.len() as u32) };
        if len <= 0 {
            return None;
        }
        let path = String::from_utf8_lossy(&buf[..len as usize]).into_owned();
        Path::new(&path).file_name().map(|n| n.to_string_lossy().to_lowercase())
    }

    pub fn foreground_process() -> Option<String> {
        let app = NSWorkspace::sharedWorkspace().frontmostApplication()?;
        process_name(app.processIdentifier())
    }

    // Apps with a Dock icon; macOS only shares window titles with Screen Recording permission, so use app names.
    pub fn list_windows() -> Vec<GameWindow> {
        let mut windows: Vec<GameWindow> = NSWorkspace::sharedWorkspace()
            .runningApplications()
            .iter()
            .filter(|app| app.activationPolicy() == NSApplicationActivationPolicy::Regular)
            .filter_map(|app| {
                let process = process_name(app.processIdentifier())?;
                let title = app.localizedName().map(|n| n.to_string()).unwrap_or_else(|| process.clone());
                Some(GameWindow { title, process })
            })
            .collect();
        windows.sort_by(|a, b| a.process.cmp(&b.process));
        windows.dedup_by(|a, b| a.process == b.process);
        windows
    }
}

#[cfg(not(any(windows, target_os = "macos")))]
mod imp {
    use super::GameWindow;
    use crate::keys::{Modifier, ScanCode};

    pub fn send_key(_scan: &ScanCode, _up: bool, _held: &[Modifier]) -> Result<(), String> {
        Err("Key input is only supported on Windows and macOS so far".into())
    }

    pub fn foreground_process() -> Option<String> {
        None
    }

    pub fn list_windows() -> Vec<GameWindow> {
        Vec::new()
    }
}

// Only macOS asks the user for permission before input works.
#[cfg(not(target_os = "macos"))]
mod permission {
    pub fn permission_problem() -> Option<&'static str> {
        None
    }

    pub fn request_permission() {}
}

#[cfg(target_os = "macos")]
use imp as permission;

pub use imp::{foreground_process, list_windows, send_key};
pub use permission::{permission_problem, request_permission};
