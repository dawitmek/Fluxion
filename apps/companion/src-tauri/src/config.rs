use serde::{Deserialize, Serialize};
use std::path::Path;

// Saved in the app's config directory. The device token never leaves the Rust side.
#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    pub server_url: Option<String>,
    pub device_token: Option<String>,
    pub device_name: Option<String>,
    pub target_process: Option<String>,
    /// Keys this PC allows. None means every key in keys::ALL_KEYS.
    pub allowed_keys: Option<Vec<String>>,
    /// Key combinations this PC has approved, exactly as commands name them ("Control+Shift+KeyE").
    /// None until the first command list arrives, when approvals carry over from the old Ctrl/Alt toggles.
    pub approved_combos: Option<Vec<String>>,
    /// The account's dashboard theme, as the server last sent it, so the window opens in it before connecting.
    pub theme: Option<String>,
    pub theme_style: Option<String>,
    pub theme_mode: Option<String>, // "light", "dark" or "system"
}

impl Config {
    pub fn load(path: &Path) -> Config {
        std::fs::read_to_string(path)
            .ok()
            .and_then(|text| serde_json::from_str(&text).ok())
            .unwrap_or_default()
    }

    pub fn save(&self, path: &Path) -> Result<(), String> {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        }
        let text = serde_json::to_string_pretty(self).map_err(|e| e.to_string())?;
        std::fs::write(path, text).map_err(|e| e.to_string())
    }
}
