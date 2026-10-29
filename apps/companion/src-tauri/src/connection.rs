// Keeps a WebSocket open to the Fluxion server and turns its actions into key presses.

use crate::controller::Controller;
use crate::protocol::{CompanionMessage, PROTOCOL_VERSION, ServerMessage};
use futures_util::{SinkExt, StreamExt};
use std::sync::Arc;
use std::time::Duration;
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message;

/// Close codes the server uses when this device must pair again; retrying won't help.
const UNAUTHORIZED: u16 = 4001;
const REVOKED: u16 = 4003;

pub fn ws_url(server_url: &str) -> String {
    let base = server_url.trim_end_matches('/');
    let base = if let Some(rest) = base.strip_prefix("https://") {
        format!("wss://{rest}")
    } else if let Some(rest) = base.strip_prefix("http://") {
        format!("ws://{rest}")
    } else {
        base.to_string()
    };
    format!("{base}/ws/companion")
}

pub fn restart(controller: &Arc<Controller>) {
    stop(controller);
    let task = tauri::async_runtime::spawn(run(controller.clone()));
    *controller.connection_task.lock().unwrap() = Some(task);
}

pub fn stop(controller: &Arc<Controller>) {
    if let Some(task) = controller.connection_task.lock().unwrap().take() {
        task.abort();
    }
    controller.release_all();
    controller.set_connection("disconnected");
}

async fn run(controller: Arc<Controller>) {
    let mut backoff = Duration::from_secs(1);
    loop {
        let config = controller.config();
        let (Some(server_url), Some(token)) = (config.server_url, config.device_token) else {
            return controller.set_connection("not paired");
        };
        controller.set_connection("connecting");

        match session(&controller, &server_url, &token, &mut backoff).await {
            Ok(()) => controller.set_connection("disconnected"),
            Err(Stop(reason)) => return controller.set_connection(reason),
            Err(Retry(reason)) => controller.set_connection(format!("retrying: {reason}")),
        }
        controller.release_all();
        tokio::time::sleep(backoff).await;
        backoff = (backoff * 2).min(Duration::from_secs(30));
    }
}

enum Failure {
    Retry(String),
    Stop(String),
}
use Failure::{Retry, Stop};

async fn session(
    controller: &Arc<Controller>,
    server_url: &str,
    token: &str,
    backoff: &mut Duration,
) -> Result<(), Failure> {
    let (ws, _) = connect_async(ws_url(server_url)).await.map_err(|e| Retry(e.to_string()))?;
    let (mut tx, mut rx) = ws.split();
    let hostname = crate::device::name();
    let hello = CompanionMessage::Hello { token, protocol: PROTOCOL_VERSION, hostname: hostname.as_deref(), platform: crate::device::platform() };
    let hello = serde_json::to_string(&hello).unwrap();
    tx.send(Message::text(hello)).await.map_err(|e| Retry(e.to_string()))?;

    while let Some(message) = rx.next().await {
        match message.map_err(|e| Retry(e.to_string()))? {
            Message::Text(text) => match serde_json::from_str::<ServerMessage>(&text) {
                Ok(ServerMessage::Ready {}) => {
                    *backoff = Duration::from_secs(1);
                    controller.set_connection("connected");
                }
                Ok(ServerMessage::Profile { name, game_process }) => {
                    let _ = controller.apply_profile(name, game_process);
                }
                Ok(ServerMessage::Commands { commands }) => {
                    let _ = controller.set_commands(commands);
                }
                Ok(ServerMessage::Error { reason }) => controller.set_connection(format!("server error: {reason}")),
                Ok(ServerMessage::Action { action }) => {
                    let result = controller.perform(&action.key, action.hold_ms);
                    let ack = CompanionMessage::Ack {
                        id: &action.id,
                        status: if result.is_ok() { "done" } else { "rejected" },
                        reason: result.as_ref().err().map(String::as_str),
                    };
                    let _ = tx.send(Message::text(serde_json::to_string(&ack).unwrap())).await;
                }
                Err(_) => {} // newer message types from a newer server are ignored
            },
            Message::Close(Some(frame)) if [UNAUTHORIZED, REVOKED].contains(&u16::from(frame.code)) => {
                return Err(Stop(format!("rejected by server ({}): pair this PC again", frame.reason)));
            }
            Message::Close(_) => return Ok(()),
            _ => {}
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::ws_url;

    #[test]
    fn builds_websocket_urls() {
        assert_eq!(ws_url("http://127.0.0.1:3000"), "ws://127.0.0.1:3000/ws/companion");
        assert_eq!(ws_url("https://fluxion.example.com/"), "wss://fluxion.example.com/ws/companion");
    }
}
