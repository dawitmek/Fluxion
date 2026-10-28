// Shared companion state plus the safety gate every action passes through before a key is pressed.

use crate::config::Config;
use crate::input::{self, GameWindow};
use crate::keys::{self, ALL_KEYS};
use serde::Serialize;
use std::collections::{HashMap, VecDeque};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

pub const PANIC_HOTKEY: &str = "Ctrl+Shift+Backspace";
const MAX_HOLD_MS: u64 = 5000;
const LOG_LEN: usize = 50;

#[derive(Serialize, Clone)]
pub struct LogEntry {
    pub key: String,
    pub ok: bool,
    pub reason: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    paired: bool,
    server_url: Option<String>,
    device_name: Option<String>,
    connection: String,
    paused: bool,
    target_process: Option<String>,
    profile_name: Option<String>,
    profile_game: Option<String>,
    allowed_keys: Vec<String>,
    all_keys: Vec<String>,
    log: Vec<LogEntry>,
    platform_supported: bool,
    permission_problem: Option<&'static str>, // macOS: Accessibility permission not granted yet
    panic_hotkey: &'static str,
}

pub struct Controller {
    app: AppHandle,
    config_path: PathBuf,
    config: Mutex<Config>,
    paused: AtomicBool,
    connection: Mutex<String>,
    profile: Mutex<(Option<String>, Option<String>)>, // active dashboard profile: (name, game process)
    log: Mutex<VecDeque<LogEntry>>,
    held: Mutex<HashMap<String, u32>>, // key -> number of actions currently holding it
    pub connection_task: Mutex<Option<tauri::async_runtime::JoinHandle<()>>>,
}

impl Controller {
    pub fn new(app: AppHandle, config_path: PathBuf) -> Arc<Controller> {
        let config = Config::load(&config_path);
        Arc::new(Controller {
            app,
            config_path,
            config: Mutex::new(config),
            paused: AtomicBool::new(false),
            connection: Mutex::new("disconnected".into()),
            profile: Mutex::new((None, None)),
            log: Mutex::new(VecDeque::new()),
            held: Mutex::new(HashMap::new()),
            connection_task: Mutex::new(None),
        })
    }

    pub fn config(&self) -> Config {
        self.config.lock().unwrap().clone()
    }

    pub fn update_config(&self, change: impl FnOnce(&mut Config)) -> Result<(), String> {
        let mut config = self.config.lock().unwrap();
        change(&mut config);
        config.save(&self.config_path)?;
        drop(config);
        self.emit();
        Ok(())
    }

    pub fn snapshot(&self) -> Snapshot {
        let config = self.config();
        // Lock once: std's Mutex isn't reentrant, and two locks in one expression deadlock.
        let (profile_name, profile_game) = self.profile.lock().unwrap().clone();
        Snapshot {
            paired: config.device_token.is_some(),
            server_url: config.server_url,
            device_name: config.device_name,
            connection: self.connection.lock().unwrap().clone(),
            paused: self.paused.load(Ordering::SeqCst),
            target_process: config.target_process,
            profile_name,
            profile_game,
            allowed_keys: allowed_keys(&config.allowed_keys),
            all_keys: ALL_KEYS.iter().map(|k| k.to_string()).collect(),
            log: self.log.lock().unwrap().iter().cloned().collect(),
            platform_supported: cfg!(any(windows, target_os = "macos")),
            permission_problem: input::permission_problem(),
            panic_hotkey: PANIC_HOTKEY,
        }
    }

    pub fn emit(&self) {
        let _ = self.app.emit("state", self.snapshot());
    }

    pub fn set_connection(&self, status: impl Into<String>) {
        *self.connection.lock().unwrap() = status.into();
        self.emit();
    }

    pub fn set_paused(&self, paused: bool) {
        self.paused.store(paused, Ordering::SeqCst);
        if paused {
            self.release_all();
        }
        self.emit();
    }

    /// Follows the dashboard's active profile. The host can still pick another game here until the next switch.
    pub fn apply_profile(&self, name: String, game_process: Option<String>) -> Result<(), String> {
        let game_process = game_process.map(|p| p.to_lowercase());
        *self.profile.lock().unwrap() = (Some(name), game_process.clone());
        match game_process {
            Some(process) => self.update_config(|c| c.target_process = Some(process)),
            None => {
                self.emit();
                Ok(())
            }
        }
    }

    pub fn list_windows(&self) -> Vec<GameWindow> {
        input::list_windows()
    }

    /// Runs the safety checks, then holds the key. Returns why an action was refused.
    pub fn perform(self: &Arc<Self>, key: &str, hold_ms: u64) -> Result<(), String> {
        let result = self.check(key).and_then(|()| self.press(key, hold_ms.min(MAX_HOLD_MS)));
        self.record(key, &result);
        result
    }

    fn check(&self, key: &str) -> Result<(), String> {
        if self.paused.load(Ordering::SeqCst) {
            return Err("paused".into());
        }
        if keys::scan_code(key).is_none() {
            return Err("key not supported".into());
        }
        if let Some(problem) = input::permission_problem() {
            return Err(problem.into());
        }
        let config = self.config();
        if !allowed_keys(&config.allowed_keys).iter().any(|k| k == key) {
            return Err("key disabled on this PC".into());
        }
        let target = config.target_process.ok_or("no game selected")?;
        if input::foreground_process().as_deref() != Some(target.as_str()) {
            return Err("game not focused".into());
        }
        Ok(())
    }

    fn press(self: &Arc<Self>, key: &str, hold_ms: u64) -> Result<(), String> {
        let scan = keys::scan_code(key).ok_or("key not supported")?;
        {
            let mut held = self.held.lock().unwrap();
            let count = held.entry(key.to_string()).or_insert(0);
            if *count == 0 {
                input::send_key(&scan, false)?;
            }
            *count += 1;
        }
        let this = self.clone();
        let key = key.to_string();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(Duration::from_millis(hold_ms)).await;
            this.release(&key);
        });
        Ok(())
    }

    fn release(&self, key: &str) {
        let mut held = self.held.lock().unwrap();
        // Missing means release_all already let go of it.
        let Some(count) = held.get_mut(key) else { return };
        *count -= 1;
        if *count == 0 {
            held.remove(key);
            if let Some(scan) = keys::scan_code(key) {
                let _ = input::send_key(&scan, true);
            }
        }
    }

    pub fn release_all(&self) {
        let mut held = self.held.lock().unwrap();
        for key in held.keys() {
            if let Some(scan) = keys::scan_code(key) {
                let _ = input::send_key(&scan, true);
            }
        }
        held.clear();
    }

    fn record(&self, key: &str, result: &Result<(), String>) {
        let mut log = self.log.lock().unwrap();
        log.push_front(LogEntry { key: key.to_string(), ok: result.is_ok(), reason: result.clone().err() });
        log.truncate(LOG_LEN);
        drop(log);
        self.emit();
    }
}

fn allowed_keys(saved: &Option<Vec<String>>) -> Vec<String> {
    match saved {
        Some(keys) => keys.iter().filter(|k| keys::scan_code(k).is_some()).cloned().collect(),
        None => ALL_KEYS.iter().map(|k| k.to_string()).collect(),
    }
}
