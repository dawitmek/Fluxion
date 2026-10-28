// Mirrors the companion messages in packages/shared/src/index.ts.

use serde::{Deserialize, Serialize};

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
}

#[derive(Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum CompanionMessage<'a> {
    Hello { token: &'a str, protocol: u32 },
    Ack { id: &'a str, status: &'a str, #[serde(skip_serializing_if = "Option::is_none")] reason: Option<&'a str> },
}

#[cfg(test)]
mod tests {
    use super::ServerMessage;

    #[test]
    fn parses_profile_messages() {
        let with_game: ServerMessage = serde_json::from_str(r#"{"type":"profile","name":"GTA V","gameProcess":"gta5.exe"}"#).unwrap();
        assert!(matches!(with_game, ServerMessage::Profile { ref name, game_process: Some(ref p) } if name == "GTA V" && p == "gta5.exe"));
        let without: ServerMessage = serde_json::from_str(r#"{"type":"profile","name":"Default","gameProcess":null}"#).unwrap();
        assert!(matches!(without, ServerMessage::Profile { game_process: None, .. }));
    }
}
