// The only keys the companion can ever press.
// Windows: PS/2 set-1 scan codes. DirectX games read scan codes, not virtual keys, so this is what makes
// input land in games like GTA5. macOS: virtual key codes (kVK_* in Carbon's Events.h).
// Must stay in sync with ALLOWED_KEYS in packages/shared/src/keys.ts.

#[allow(dead_code)] // each platform's input code reads only its own fields
pub struct ScanCode {
    pub code: u16,
    pub extended: bool, // E0-prefixed keys (arrows)
    pub mac: u16,
}

const fn sc(code: u16, mac: u16) -> ScanCode {
    ScanCode { code, extended: false, mac }
}

const fn ext(code: u16, mac: u16) -> ScanCode {
    ScanCode { code, extended: true, mac }
}

pub fn scan_code(key: &str) -> Option<ScanCode> {
    Some(match key {
        "KeyA" => sc(0x1E, 0x00), "KeyB" => sc(0x30, 0x0B), "KeyC" => sc(0x2E, 0x08), "KeyD" => sc(0x20, 0x02),
        "KeyE" => sc(0x12, 0x0E), "KeyF" => sc(0x21, 0x03), "KeyG" => sc(0x22, 0x05), "KeyH" => sc(0x23, 0x04),
        "KeyI" => sc(0x17, 0x22), "KeyJ" => sc(0x24, 0x26), "KeyK" => sc(0x25, 0x28), "KeyL" => sc(0x26, 0x25),
        "KeyM" => sc(0x32, 0x2E), "KeyN" => sc(0x31, 0x2D), "KeyO" => sc(0x18, 0x1F), "KeyP" => sc(0x19, 0x23),
        "KeyQ" => sc(0x10, 0x0C), "KeyR" => sc(0x13, 0x0F), "KeyS" => sc(0x1F, 0x01), "KeyT" => sc(0x14, 0x11),
        "KeyU" => sc(0x16, 0x20), "KeyV" => sc(0x2F, 0x09), "KeyW" => sc(0x11, 0x0D), "KeyX" => sc(0x2D, 0x07),
        "KeyY" => sc(0x15, 0x10), "KeyZ" => sc(0x2C, 0x06),
        "Digit1" => sc(0x02, 0x12), "Digit2" => sc(0x03, 0x13), "Digit3" => sc(0x04, 0x14), "Digit4" => sc(0x05, 0x15),
        "Digit5" => sc(0x06, 0x17), "Digit6" => sc(0x07, 0x16), "Digit7" => sc(0x08, 0x1A), "Digit8" => sc(0x09, 0x1C),
        "Digit9" => sc(0x0A, 0x19), "Digit0" => sc(0x0B, 0x1D),
        "Space" => sc(0x39, 0x31),
        "Enter" => sc(0x1C, 0x24),
        "ShiftLeft" => sc(0x2A, 0x38),
        "ShiftRight" => sc(0x36, 0x3C),
        "ArrowUp" => ext(0x48, 0x7E),
        "ArrowDown" => ext(0x50, 0x7D),
        "ArrowLeft" => ext(0x4B, 0x7B),
        "ArrowRight" => ext(0x4D, 0x7C),
        _ => return None,
    })
}

pub const ALL_KEYS: &[&str] = &[
    "KeyA", "KeyB", "KeyC", "KeyD", "KeyE", "KeyF", "KeyG", "KeyH", "KeyI", "KeyJ", "KeyK", "KeyL", "KeyM",
    "KeyN", "KeyO", "KeyP", "KeyQ", "KeyR", "KeyS", "KeyT", "KeyU", "KeyV", "KeyW", "KeyX", "KeyY", "KeyZ",
    "Digit0", "Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6", "Digit7", "Digit8", "Digit9",
    "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "Enter", "ShiftLeft", "ShiftRight",
];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_listed_key_has_a_scan_code() {
        for &key in ALL_KEYS {
            assert!(scan_code(key).is_some(), "{key} has no scan code");
        }
    }

    #[test]
    fn every_key_has_its_own_codes() {
        let mut windows: Vec<(u16, bool)> = ALL_KEYS.iter().map(|k| scan_code(k).map(|s| (s.code, s.extended)).unwrap()).collect();
        let mut mac: Vec<u16> = ALL_KEYS.iter().map(|k| scan_code(k).unwrap().mac).collect();
        windows.sort();
        windows.dedup();
        mac.sort();
        mac.dedup();
        assert_eq!(windows.len(), ALL_KEYS.len(), "two keys share a Windows scan code");
        assert_eq!(mac.len(), ALL_KEYS.len(), "two keys share a macOS key code");
    }

    #[test]
    fn system_keys_are_unmapped() {
        for key in ["MetaLeft", "AltLeft", "ControlLeft", "Tab", "Escape", "F4", "Delete", ""] {
            assert!(scan_code(key).is_none(), "{key} must not be pressable");
        }
    }
}
