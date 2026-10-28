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
}

#[derive(Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum CompanionMessage<'a> {
    Hello { token: &'a str, protocol: u32 },
    Ack { id: &'a str, status: &'a str, #[serde(skip_serializing_if = "Option::is_none")] reason: Option<&'a str> },
}
