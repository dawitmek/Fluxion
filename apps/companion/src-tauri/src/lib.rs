mod config;
mod connection;
mod controller;
mod input;
mod keys;
mod protocol;

use controller::{Controller, Snapshot};
use input::GameWindow;
use serde::Deserialize;
use std::sync::Arc;
use tauri::{Manager, State};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

type Ctl<'a> = State<'a, Arc<Controller>>;

#[tauri::command]
fn get_state(ctl: Ctl) -> Snapshot {
    ctl.snapshot()
}

#[derive(Deserialize)]
struct PairResponse {
    token: String,
}

#[tauri::command]
async fn pair(ctl: Ctl<'_>, server_url: String, code: String, name: String) -> Result<(), String> {
    let server_url = server_url.trim().trim_end_matches('/').to_string();
    let response = reqwest::Client::new()
        .post(format!("{server_url}/api/companions/pair"))
        .json(&serde_json::json!({ "code": code.trim().to_uppercase(), "name": name }))
        .send()
        .await
        .map_err(|e| format!("Could not reach the server: {e}"))?;
    if !response.status().is_success() {
        let body: serde_json::Value = response.json().await.unwrap_or_default();
        return Err(body["error"].as_str().unwrap_or("Pairing failed").to_string());
    }
    let PairResponse { token } = response.json().await.map_err(|e| e.to_string())?;
    ctl.update_config(|c| {
        c.server_url = Some(server_url);
        c.device_token = Some(token);
        c.device_name = Some(name);
    })?;
    connection::restart(&ctl);
    Ok(())
}

#[tauri::command]
fn unpair(ctl: Ctl) -> Result<(), String> {
    connection::stop(&ctl);
    ctl.update_config(|c| c.device_token = None)
}

#[tauri::command]
fn reconnect(ctl: Ctl) {
    connection::restart(&ctl);
}

#[tauri::command]
fn list_windows(ctl: Ctl) -> Vec<GameWindow> {
    ctl.list_windows()
}

#[tauri::command]
fn set_target(ctl: Ctl, process: Option<String>) -> Result<(), String> {
    ctl.update_config(|c| c.target_process = process.map(|p| p.to_lowercase()))
}

#[tauri::command]
fn set_allowed_keys(ctl: Ctl, keys: Vec<String>) -> Result<(), String> {
    ctl.update_config(|c| c.allowed_keys = Some(keys))
}

#[tauri::command]
fn set_paused(ctl: Ctl, paused: bool) {
    ctl.set_paused(paused);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // The panic hotkey only ever pauses; resuming is a deliberate click in the app.
    let panic_key = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::Backspace);

    tauri::Builder::default()
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, shortcut, event| {
                    if shortcut == &panic_key && event.state() == ShortcutState::Pressed {
                        app.state::<Arc<Controller>>().set_paused(true);
                    }
                })
                .build(),
        )
        .setup(move |app| {
            let config_path = app.path().app_config_dir()?.join("config.json");
            let controller = Controller::new(app.handle().clone(), config_path);
            app.manage(controller.clone());
            app.global_shortcut().register(panic_key)?;
            if controller.config().device_token.is_some() {
                connection::restart(&controller);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_state,
            pair,
            unpair,
            reconnect,
            list_windows,
            set_target,
            set_allowed_keys,
            set_paused
        ])
        .run(tauri::generate_context!())
        .expect("error while running the Fluxion companion");
}
