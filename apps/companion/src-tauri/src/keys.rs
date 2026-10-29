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

/// Ctrl, Alt and Shift, held around a combination's key. Never Win/Cmd.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Modifier {
    Control,
    Alt,
    Shift,
}

impl Modifier {
    const ORDER: [Modifier; 3] = [Modifier::Control, Modifier::Alt, Modifier::Shift];

    fn parse(name: &str) -> Option<Modifier> {
        Some(match name {
            "Control" => Modifier::Control,
            "Alt" => Modifier::Alt,
            "Shift" => Modifier::Shift,
            _ => return None,
        })
    }

    /// The left-hand key for each.
    pub fn scan_code(self) -> ScanCode {
        match self {
            Modifier::Control => sc(0x1D, 0x3B),
            Modifier::Alt => sc(0x38, 0x3A),
            Modifier::Shift => sc(0x2A, 0x38),
        }
    }
}

/// A key, alone ("KeyE") or with modifiers ("Control+Shift+KeyE"), as in packages/shared/src/keys.ts.
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct Combo {
    pub modifiers: Vec<Modifier>,
    pub key: String,
}

impl Combo {
    /// None unless well formed: known modifiers, each once, in Control, Alt, Shift order.
    pub fn parse(value: &str) -> Option<Combo> {
        let mut parts: Vec<&str> = value.split('+').collect();
        let key = parts.pop()?.to_string();
        let modifiers = parts.into_iter().map(Modifier::parse).collect::<Option<Vec<_>>>()?;
        let order: Vec<usize> = modifiers.iter().map(|m| Modifier::ORDER.iter().position(|o| o == m).unwrap()).collect();
        if order.windows(2).any(|w| w[0] >= w[1]) {
            return None;
        }
        Some(Combo { modifiers, key })
    }

    /// Why this combination must not be pressed, if it mustn't. Mirrors BLOCKED_COMBOS in the shared package.
    pub fn blocked(&self) -> Option<&'static str> {
        use Modifier::{Alt, Control};
        const ARROWS: &[&str] = &["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
        const SHIFTS: &[&str] = &["ShiftLeft", "ShiftRight"];
        let rules: &[(&[Modifier], &[&str], &str)] = &[
            (&[Control, Alt], &["Delete"], "Ctrl+Alt+Del is blocked"),
            (&[Control, Modifier::Shift], &["Escape"], "Ctrl+Shift+Esc is blocked"),
            (&[Alt], &["F4"], "Alt+F4 is blocked"),
            (&[Alt], &["Tab"], "Alt+Tab is blocked"),
            (&[Control], &["KeyW"], "Ctrl+W is blocked"),
            (&[Control], &["KeyQ"], "Ctrl+Q is blocked"),
            (&[Alt], &["Space"], "Alt+Space is blocked"),
            (&[Alt], &["Enter"], "Alt+Enter is blocked"),
            (&[Control], &["Space"], "Ctrl+Space is blocked"),
            (&[Control], ARROWS, "Ctrl+arrow keys are blocked"),
            (&[Control], SHIFTS, "Ctrl+Shift is blocked"),
            (&[Alt], SHIFTS, "Alt+Shift is blocked"),
        ];
        if self.modifiers.contains(&Modifier::Shift) && SHIFTS.contains(&self.key.as_str()) {
            return Some("Shift is already the key");
        }
        rules
            .iter()
            .find(|(mods, keys, _)| keys.contains(&self.key.as_str()) && mods.iter().all(|m| self.modifiers.contains(m)))
            .map(|(_, _, reason)| *reason)
    }
}

/// Ctrl and Alt used to be toggles in the allowed-keys grid; a saved list may still name them. They now only
/// matter once, to carry approvals over to per-combination approval.
pub const OLD_MODIFIER_TOGGLES: &[&str] = &["Control", "Alt"];

/// How people write a key or combination: "Control+Shift+KeyE" -> "Ctrl+Shift+E".
pub fn label(value: &str) -> String {
    value
        .split('+')
        .map(|part| match part {
            "Control" => "Ctrl".to_string(),
            "ArrowUp" => "↑".to_string(),
            "ArrowDown" => "↓".to_string(),
            "ArrowLeft" => "←".to_string(),
            "ArrowRight" => "→".to_string(),
            _ => part.strip_prefix("Key").or_else(|| part.strip_prefix("Digit")).unwrap_or(part).to_string(),
        })
        .collect::<Vec<_>>()
        .join("+")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_combinations() {
        assert_eq!(Combo::parse("KeyE"), Some(Combo { modifiers: vec![], key: "KeyE".into() }));
        assert_eq!(
            Combo::parse("Control+Shift+KeyE"),
            Some(Combo { modifiers: vec![Modifier::Control, Modifier::Shift], key: "KeyE".into() })
        );
        for bad in ["Shift+Control+KeyE", "Control+Control+KeyE", "Meta+KeyR", "Win+KeyR"] {
            assert_eq!(Combo::parse(bad), None, "{bad}");
        }
    }

    #[test]
    fn blocks_dangerous_combinations_even_with_extra_modifiers() {
        for blocked in ["Control+Alt+Delete", "Control+KeyW", "Control+Shift+KeyW", "Alt+F4", "Alt+Enter", "Control+ArrowUp", "Alt+ShiftLeft", "Shift+ShiftLeft"] {
            assert!(Combo::parse(blocked).unwrap().blocked().is_some(), "{blocked}");
        }
        for fine in ["Control+KeyE", "Control+Shift+KeyE", "Shift+KeyW", "Alt+Digit1", "Enter"] {
            assert_eq!(Combo::parse(fine).unwrap().blocked(), None, "{fine}");
        }
    }

    #[test]
    fn labels_keys_as_people_write_them() {
        assert_eq!(label("Control+Shift+KeyE"), "Ctrl+Shift+E");
        assert_eq!(label("Alt+Digit1"), "Alt+1");
        assert_eq!(label("ArrowUp"), "↑");
    }

    #[test]
    fn modifiers_have_their_own_codes() {
        for m in Modifier::ORDER {
            let code = m.scan_code();
            assert!(ALL_KEYS.iter().all(|k| scan_code(k).unwrap().code != code.code || *k == "ShiftLeft"));
        }
    }

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
