// OS-level keyboard input and window inspection on Windows and macOS; other platforms refuse actions.

use serde::Serialize;

#[derive(Serialize, Clone)]
pub struct GameWindow {
    pub title: String,
    pub process: String, // executable file name, lowercase, e.g. "gta5.exe" or "textedit"
    pub icon: Option<String>, // the program's icon as a PNG data URL, for the game picker
}

// Icons by program path, made once: the window list is refreshed often and icons don't change while a program runs.
fn cached_icon(path: &str, make: impl FnOnce() -> Option<Vec<u8>>) -> Option<String> {
    use base64::Engine;
    use std::collections::HashMap;
    use std::sync::{Mutex, OnceLock};
    static ICONS: OnceLock<Mutex<HashMap<String, Option<String>>>> = OnceLock::new();
    let icons = ICONS.get_or_init(Default::default);
    if let Some(icon) = icons.lock().unwrap().get(path) {
        return icon.clone();
    }
    let icon = make().map(|png| format!("data:image/png;base64,{}", base64::engine::general_purpose::STANDARD.encode(png)));
    icons.lock().unwrap().insert(path.to_string(), icon.clone());
    icon
}

#[cfg(windows)]
mod imp {
    use super::GameWindow;
    use crate::keys::{Modifier, ScanCode};
    use std::path::Path;
    use std::ffi::c_void;
    use windows::Win32::Foundation::{CloseHandle, HWND, LPARAM};
    use windows::Win32::Graphics::Gdi::{
        BI_RGB, BITMAP, BITMAPINFO, BITMAPINFOHEADER, CreateCompatibleDC, DIB_RGB_COLORS, DeleteDC, DeleteObject, GetDIBits,
        GetObjectW,
    };
    use windows::Win32::UI::Shell::ExtractIconExW;
    use windows::Win32::System::Threading::{
        OpenProcess, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION, QueryFullProcessImageNameW,
    };
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        INPUT, INPUT_0, INPUT_KEYBOARD, KEYBD_EVENT_FLAGS, KEYBDINPUT, KEYEVENTF_EXTENDEDKEY, KEYEVENTF_KEYUP,
        KEYEVENTF_SCANCODE, SendInput, VIRTUAL_KEY,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        DestroyIcon, EnumWindows, GetForegroundWindow, GetIconInfo, GetWindowTextLengthW, GetWindowTextW,
        GetWindowThreadProcessId, HICON, ICONINFO, IsWindowVisible,
    };
    use windows::core::{BOOL, PCWSTR, PWSTR};

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
        let path = process_path(hwnd)?;
        Path::new(&path).file_name().map(|n| n.to_string_lossy().to_lowercase())
    }

    fn process_path(hwnd: HWND) -> Option<String> {
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
        Some(String::from_utf16_lossy(&buf[..len as usize]))
    }

    // The large icon in the program's .exe, as a PNG.
    fn exe_icon(path: &str) -> Option<Vec<u8>> {
        let wide: Vec<u16> = path.encode_utf16().chain(Some(0)).collect();
        let mut icon = HICON::default();
        if unsafe { ExtractIconExW(PCWSTR(wide.as_ptr()), 0, Some(&mut icon), None, 1) } == 0 || icon.is_invalid() {
            return None;
        }
        let png = icon_png(icon);
        unsafe {
            let _ = DestroyIcon(icon);
        }
        png
    }

    fn icon_png(icon: HICON) -> Option<Vec<u8>> {
        let mut info = ICONINFO::default();
        unsafe { GetIconInfo(icon, &mut info) }.ok()?;
        let pixels = (|| {
            let mut bitmap = BITMAP::default();
            let size = std::mem::size_of::<BITMAP>() as i32;
            if unsafe { GetObjectW(info.hbmColor.into(), size, Some(&mut bitmap as *mut _ as *mut c_void)) } == 0 {
                return None;
            }
            let (width, height) = (bitmap.bmWidth, bitmap.bmHeight);
            let mut header = BITMAPINFO {
                bmiHeader: BITMAPINFOHEADER {
                    biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                    biWidth: width,
                    biHeight: -height, // top-down rows
                    biPlanes: 1,
                    biBitCount: 32,
                    biCompression: BI_RGB.0,
                    ..Default::default()
                },
                ..Default::default()
            };
            let mut bgra = vec![0u8; (width * height * 4) as usize];
            let dc = unsafe { CreateCompatibleDC(None) };
            let rows = unsafe {
                GetDIBits(dc, info.hbmColor, 0, height as u32, Some(bgra.as_mut_ptr() as *mut c_void), &mut header, DIB_RGB_COLORS)
            };
            unsafe {
                let _ = DeleteDC(dc);
            }
            (rows == height).then_some((width as u32, height as u32, bgra))
        })();
        unsafe {
            let _ = DeleteObject(info.hbmColor.into());
            let _ = DeleteObject(info.hbmMask.into());
        }
        let (width, height, mut rgba) = pixels?;
        // Old icons without an alpha channel are fully opaque.
        let opaque = rgba.chunks(4).all(|p| p[3] == 0);
        for p in rgba.chunks_mut(4) {
            p.swap(0, 2);
            if opaque {
                p[3] = 255;
            }
        }
        super::png(width, height, &rgba)
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
                    if let Some(path) = process_path(hwnd) {
                        let process = Path::new(&path).file_name().map(|n| n.to_string_lossy().to_lowercase()).unwrap_or_default();
                        let icon = super::cached_icon(&path, || exe_icon(&path));
                        windows.push(GameWindow { title, process, icon });
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

// RGBA pixels as a PNG.
#[cfg(windows)]
fn png(width: u32, height: u32, rgba: &[u8]) -> Option<Vec<u8>> {
    let mut out = Vec::new();
    let mut encoder = png::Encoder::new(&mut out, width, height);
    encoder.set_color(png::ColorType::Rgba);
    encoder.set_depth(png::BitDepth::Eight);
    encoder.write_header().ok()?.write_image_data(rgba).ok()?;
    Some(out)
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
    use objc2::AllocAnyThread;
    use objc2_app_kit::{NSApplicationActivationPolicy, NSBitmapImageFileType, NSBitmapImageRep, NSRunningApplication, NSWorkspace};
    use objc2_foundation::{NSDictionary, NSPoint, NSRect, NSSize};
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
        let path = process_path(pid)?;
        Path::new(&path).file_name().map(|n| n.to_string_lossy().to_lowercase())
    }

    fn process_path(pid: i32) -> Option<String> {
        let mut buf = vec![0u8; libc::PROC_PIDPATHINFO_MAXSIZE as usize];
        let len = unsafe { libc::proc_pidpath(pid, buf.as_mut_ptr().cast(), buf.len() as u32) };
        if len <= 0 {
            return None;
        }
        Some(String::from_utf8_lossy(&buf[..len as usize]).into_owned())
    }

    // The app's Dock icon, sized for a 64-point box (its 128-pixel image on a Retina Mac), as a PNG.
    fn app_icon(app: &NSRunningApplication) -> Option<Vec<u8>> {
        let icon = app.icon()?;
        let mut rect = NSRect::new(NSPoint::new(0.0, 0.0), NSSize::new(64.0, 64.0));
        let image = unsafe { icon.CGImageForProposedRect_context_hints(&mut rect, None, None) }?;
        let bitmap = NSBitmapImageRep::initWithCGImage(NSBitmapImageRep::alloc(), &image);
        let png = unsafe { bitmap.representationUsingType_properties(NSBitmapImageFileType::PNG, &NSDictionary::new()) }?;
        Some(png.to_vec())
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
                let path = process_path(app.processIdentifier())?;
                let process = Path::new(&path).file_name()?.to_string_lossy().to_lowercase();
                let title = app.localizedName().map(|n| n.to_string()).unwrap_or_else(|| process.clone());
                let icon = super::cached_icon(&path, || app_icon(&app));
                Some(GameWindow { title, process, icon })
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
