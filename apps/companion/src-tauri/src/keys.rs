// The only keys the companion can ever press, mapped to PS/2 set-1 scan codes.
// DirectX games read scan codes, not virtual keys, so this is what makes input land in games like GTA5.
// Must stay in sync with ALLOWED_KEYS in packages/shared/src/keys.ts.

#[cfg_attr(not(windows), allow(dead_code))] // read only by the Windows input code
pub struct ScanCode {
    pub code: u16,
    pub extended: bool, // E0-prefixed keys (arrows)
}

const fn sc(code: u16) -> ScanCode {
    ScanCode { code, extended: false }
}

const fn ext(code: u16) -> ScanCode {
    ScanCode { code, extended: true }
}

pub fn scan_code(key: &str) -> Option<ScanCode> {
    Some(match key {
        "KeyA" => sc(0x1E), "KeyB" => sc(0x30), "KeyC" => sc(0x2E), "KeyD" => sc(0x20),
        "KeyE" => sc(0x12), "KeyF" => sc(0x21), "KeyG" => sc(0x22), "KeyH" => sc(0x23),
        "KeyI" => sc(0x17), "KeyJ" => sc(0x24), "KeyK" => sc(0x25), "KeyL" => sc(0x26),
        "KeyM" => sc(0x32), "KeyN" => sc(0x31), "KeyO" => sc(0x18), "KeyP" => sc(0x19),
        "KeyQ" => sc(0x10), "KeyR" => sc(0x13), "KeyS" => sc(0x1F), "KeyT" => sc(0x14),
        "KeyU" => sc(0x16), "KeyV" => sc(0x2F), "KeyW" => sc(0x11), "KeyX" => sc(0x2D),
        "KeyY" => sc(0x15), "KeyZ" => sc(0x2C),
        "Digit1" => sc(0x02), "Digit2" => sc(0x03), "Digit3" => sc(0x04), "Digit4" => sc(0x05),
        "Digit5" => sc(0x06), "Digit6" => sc(0x07), "Digit7" => sc(0x08), "Digit8" => sc(0x09),
        "Digit9" => sc(0x0A), "Digit0" => sc(0x0B),
        "Space" => sc(0x39),
        "Enter" => sc(0x1C),
        "ShiftLeft" => sc(0x2A),
        "ShiftRight" => sc(0x36),
        "ArrowUp" => ext(0x48),
        "ArrowDown" => ext(0x50),
        "ArrowLeft" => ext(0x4B),
        "ArrowRight" => ext(0x4D),
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
    fn system_keys_are_unmapped() {
        for key in ["MetaLeft", "AltLeft", "ControlLeft", "Tab", "Escape", "F4", "Delete", ""] {
            assert!(scan_code(key).is_none(), "{key} must not be pressable");
        }
    }
}
