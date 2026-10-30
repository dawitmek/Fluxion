// Mirrors the companion messages in packages/shared/src/index.ts.

use serde::{Deserialize, Serialize};

/// One of the dashboard's commands, as the server describes it.
#[derive(Deserialize, Serialize, Clone, Debug, PartialEq)]
pub struct CommandInfo {
    pub keyword: String,
    pub key: String,
    pub enabled: bool,
}

pub const PROTOCOL_VERSION: u32 = 1;

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct KeyAction {
    pub id: String,
    pub key: String,
    pub hold_ms: u64,
}

#[derive(Deserialize, Debug)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ServerMessage {
    Ready {},
    Error { reason: String },
    Action { action: KeyAction },
    // The host's active profile. A game process, when set, becomes this PC's target.
    #[serde(rename_all = "camelCase")]
    Profile { name: String, game_process: Option<String> },
    // The active profile's commands. Key combinations among them still need this PC's own approval.
    Commands { commands: Vec<CommandInfo> },
    // The dashboard's look, which this window follows: a theme ("default", "solar-dusk"…) in "full" or "colors"
    // style, and "light", "dark" or "system". Servers from before light or dark was a choice don't send a mode.
    Theme {
        theme: String,
        style: String,
        #[serde(default)]
        mode: Option<String>,
    },
}

#[derive(Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum CompanionMessage<'a> {
    Hello {
        token: &'a str,
        protocol: u32,
        #[serde(skip_serializing_if = "Option::is_none")]
        hostname: Option<&'a str>,
        platform: &'a str,
    },
    Ack { id: &'a str, status: &'a str, #[serde(skip_serializing_if = "Option::is_none")] reason: Option<&'a str> },
}

#[cfg(test)]
mod tests {
    use super::ServerMessage;

    #[test]
    fn parses_theme_messages() {
        let theme: ServerMessage = serde_json::from_str(r#"{"type":"theme","theme":"solar-dusk","style":"colors","mode":"dark"}"#).unwrap();
        assert!(matches!(theme, ServerMessage::Theme { ref theme, ref style, mode: Some(ref mode) } if theme == "solar-dusk" && style == "colors" && mode == "dark"));
        let older: ServerMessage = serde_json::from_str(r#"{"type":"theme","theme":"default","style":"full"}"#).unwrap();
        assert!(matches!(older, ServerMessage::Theme { mode: None, .. }));
    }

    #[test]
    fn parses_profile_messages() {
        let with_game: ServerMessage = serde_json::from_str(r#"{"type":"profile","name":"GTA V","gameProcess":"gta5.exe"}"#).unwrap();
        assert!(matches!(with_game, ServerMessage::Profile { ref name, game_process: Some(ref p) } if name == "GTA V" && p == "gta5.exe"));
        let without: ServerMessage = serde_json::from_str(r#"{"type":"profile","name":"Default","gameProcess":null}"#).unwrap();
        assert!(matches!(without, ServerMessage::Profile { game_process: None, .. }));
    }

    #[test]
    fn parses_command_lists() {
        let message: ServerMessage =
            serde_json::from_str(r#"{"type":"commands","commands":[{"keyword":"emote","key":"Control+Shift+KeyE","enabled":true}]}"#).unwrap();
        assert!(matches!(message, ServerMessage::Commands { ref commands } if commands[0].key == "Control+Shift+KeyE"));
    }
}
