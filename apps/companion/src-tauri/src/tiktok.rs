// Signs the host in to TikTok in a separate window and hands the session to the Fluxion server, which uses it
// for TikTok's text-to-speech voices. The window shows plain tiktok.com and gets no access to the app's commands
// (capabilities only cover the main window).

use crate::controller::Controller;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Manager, Url, WebviewUrl, WebviewWindowBuilder};

const WINDOW: &str = "tiktok-login";
const LOGIN_URL: &str = "https://www.tiktok.com/login";

/// Ok(true) once the server has the session, Ok(false) if the host closed the window first.
pub async fn sign_in(app: AppHandle, controller: Arc<Controller>) -> Result<bool, String> {
    let config = controller.config();
    let (Some(server_url), Some(token)) = (config.server_url, config.device_token) else {
        return Err("Pair this PC with Fluxion first".into());
    };
    if let Some(open) = app.get_webview_window(WINDOW) {
        let _ = open.set_focus();
        return Err("The TikTok sign-in window is already open".into());
    }

    let window = WebviewWindowBuilder::new(&app, WINDOW, WebviewUrl::External(LOGIN_URL.parse().unwrap()))
        .title("Sign in to TikTok")
        .inner_size(480.0, 760.0)
        .build()
        .map_err(|e| e.to_string())?;

    // TikTok sets the httpOnly sessionid cookie once sign-in completes. Cookies are read off the main thread:
    // on Windows, reading them from the main thread deadlocks.
    let tiktok: Url = "https://www.tiktok.com".parse().unwrap();
    let session = loop {
        tokio::time::sleep(Duration::from_secs(1)).await;
        if app.get_webview_window(WINDOW).is_none() {
            return Ok(false);
        }
        let Ok(cookies) = window.cookies_for_url(tiktok.clone()) else { continue };
        if let Some(cookie) = cookies.iter().find(|c| c.name() == "sessionid" && !c.value().is_empty()) {
            break cookie.value().to_string();
        }
    };
    let _ = window.close();

    let response = reqwest::Client::new()
        .post(format!("{server_url}/api/companions/tiktok-session"))
        .bearer_auth(token)
        .json(&serde_json::json!({ "sessionId": session }))
        .send()
        .await
        .map_err(|e| format!("Could not reach the server: {e}"))?;
    if !response.status().is_success() {
        let body: serde_json::Value = response.json().await.unwrap_or_default();
        return Err(body["error"].as_str().unwrap_or("The server did not accept the TikTok sign-in").to_string());
    }
    Ok(true)
}
