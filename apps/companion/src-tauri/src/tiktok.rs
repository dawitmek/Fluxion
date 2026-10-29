// Signs the host in to TikTok in a separate window and hands the session to the Fluxion server, which uses it
// for TikTok's text-to-speech voices. The window shows plain tiktok.com and gets no access to the app's commands
// (capabilities only cover the main window).

use crate::controller::Controller;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

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
    let session = loop {
        tokio::time::sleep(Duration::from_secs(1)).await;
        if app.get_webview_window(WINDOW).is_none() {
            return Ok(false);
        }
        // All cookies rather than cookies_for_url: on macOS that one only matches the exact host
        // (www.tiktok.com), and TikTok sets sessionid on .tiktok.com.
        let Ok(cookies) = window.cookies() else { continue };
        if let Some(session) = find_session(&cookies) {
            break session;
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

#[derive(Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    signed_in: bool,
    /// False while the server's own TikTok account works: then there's nothing to sign in for.
    needed: bool,
}

/// Asks the server, which decides: the dashboard can sign out, and the server's account can stop working.
pub async fn status(controller: Arc<Controller>) -> Result<Status, String> {
    let config = controller.config();
    let (Some(server_url), Some(token)) = (config.server_url, config.device_token) else {
        return Ok(Status::default());
    };
    let response = reqwest::Client::new()
        .get(format!("{server_url}/api/companions/tiktok-session"))
        .bearer_auth(token)
        .send()
        .await
        .map_err(|e| format!("Could not reach the server: {e}"))?;
    response.json().await.map_err(|e| e.to_string())
}

fn find_session(cookies: &[tauri::webview::Cookie<'static>]) -> Option<String> {
    cookies
        .iter()
        .find(|c| {
            let domain = c.domain().unwrap_or_default().trim_start_matches('.');
            c.name() == "sessionid" && !c.value().is_empty() && (domain == "tiktok.com" || domain.ends_with(".tiktok.com"))
        })
        .map(|c| c.value().to_string())
}

#[cfg(test)]
mod tests {
    use super::find_session;
    use tauri::webview::Cookie;

    #[test]
    fn finds_the_session_on_any_tiktok_domain() {
        let cookie = |name: &'static str, value: &'static str, domain: &'static str| {
            let mut c = Cookie::new(name, value);
            c.set_domain(domain);
            c
        };
        assert_eq!(find_session(&[cookie("sessionid", "abc", ".tiktok.com")]), Some("abc".into()));
        assert_eq!(find_session(&[cookie("sessionid", "abc", "www.tiktok.com")]), Some("abc".into()));
        assert_eq!(find_session(&[cookie("sessionid", "abc", "nottiktok.com")]), None);
        assert_eq!(find_session(&[cookie("sessionid", "", ".tiktok.com"), cookie("sid_tt", "x", ".tiktok.com")]), None);
    }
}
