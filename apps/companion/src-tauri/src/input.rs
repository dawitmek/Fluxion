// OS-level keyboard input and window inspection. Windows only for now; other platforms refuse actions.

use serde::Serialize;

#[derive(Serialize, Clone)]
pub struct GameWindow {
    pub title: String,
    pub process: String, // executable file name, lowercase, e.g. "gta5.exe"
}

#[cfg(windows)]
mod imp {
    use super::GameWindow;
    use crate::keys::ScanCode;
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

    pub fn send_key(scan: &ScanCode, up: bool) -> Result<(), String> {
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

#[cfg(not(windows))]
mod imp {
    use super::GameWindow;
    use crate::keys::ScanCode;

    pub fn send_key(_scan: &ScanCode, _up: bool) -> Result<(), String> {
        Err("Key input is only supported on Windows so far".into())
    }

    pub fn foreground_process() -> Option<String> {
        None
    }

    pub fn list_windows() -> Vec<GameWindow> {
        Vec::new()
    }
}

pub use imp::{foreground_process, list_windows, send_key};
