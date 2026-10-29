// Shared companion state plus the safety gate every action passes through before a key is pressed.

use crate::config::Config;
use crate::input::{self, GameWindow};
use crate::keys::{self, ALL_KEYS, Combo, Modifier, OLD_MODIFIER_TOGGLES};
use crate::protocol::CommandInfo;
use serde::Serialize;
use std::collections::{HashMap, VecDeque};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
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
    commands: Vec<CommandView>,
    pending_approvals: usize, // enabled combinations waiting for this PC's OK
}

/// A dashboard command and whether this PC will press it.
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CommandView {
    keyword: String,
    key: String,
    label: String, // "Ctrl+Shift+E"
    enabled: bool,
    combo: bool,              // needs its own approval on this PC
    approved: bool,           // combinations only
    problem: Option<String>,  // why it won't be pressed, apart from waiting for approval
}

pub struct Controller {
    app: AppHandle,
    config_path: PathBuf,
    config: Mutex<Config>,
    paused: AtomicBool,
    connection: Mutex<String>,
    profile: Mutex<(Option<String>, Option<String>)>, // active dashboard profile: (name, game process)
    commands: Mutex<Vec<CommandInfo>>,               // the active profile's commands, from the server
    log: Mutex<VecDeque<LogEntry>>,
    held: Mutex<HashMap<String, u32>>, // key -> number of actions currently holding it
    // A combination being held, and which press it is (so a finished press doesn't release a newer one).
    // While one is held nothing else is pressed, so viewers' overlapping holds can't add up to another combination.
    combo: Mutex<Option<(u64, Combo)>>,
    combo_count: AtomicU64,
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
            commands: Mutex::new(Vec::new()),
            log: Mutex::new(VecDeque::new()),
            held: Mutex::new(HashMap::new()),
            combo: Mutex::new(None),
            combo_count: AtomicU64::new(0),
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
        let allowed = allowed_keys(&config.allowed_keys);
        let approved = config.approved_combos.clone().unwrap_or_default();
        let commands: Vec<CommandView> = self.commands.lock().unwrap().iter().map(|c| command_view(c, &allowed, &approved)).collect();
        let pending_approvals = commands.iter().filter(|c| c.enabled && c.combo && !c.approved && c.problem.is_none()).count();
        Snapshot {
            paired: config.device_token.is_some(),
            server_url: config.server_url,
            device_name: config.device_name,
            connection: self.connection.lock().unwrap().clone(),
            paused: self.paused.load(Ordering::SeqCst),
            target_process: config.target_process,
            profile_name,
            profile_game,
            allowed_keys: allowed,
            all_keys: ALL_KEYS.iter().map(|k| k.to_string()).collect(),
            log: self.log.lock().unwrap().iter().cloned().collect(),
            platform_supported: cfg!(any(windows, target_os = "macos")),
            permission_problem: input::permission_problem(),
            panic_hotkey: PANIC_HOTKEY,
            commands,
            pending_approvals,
        }
    }

    /// The server's list of the active profile's commands. The first list after updating carries approvals over
    /// from the old Ctrl/Alt toggles, so combinations that worked before keep working.
    pub fn set_commands(&self, commands: Vec<CommandInfo>) -> Result<(), String> {
        let config = self.config();
        if config.approved_combos.is_none() {
            let carried = carried_over_approvals(&commands, &config.allowed_keys);
            self.update_config(|c| c.approved_combos = Some(carried))?;
        }
        *self.commands.lock().unwrap() = commands;
        self.emit();
        Ok(())
    }

    pub fn set_combo_approved(&self, key: &str, approved: bool) -> Result<(), String> {
        if Combo::parse(key).is_none_or(|c| c.modifiers.is_empty()) {
            return Err("only key combinations need approving".into());
        }
        self.update_config(|c| {
            let list = c.approved_combos.get_or_insert_with(Vec::new);
            list.retain(|k| k != key);
            if approved {
                list.push(key.to_string());
            }
        })
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

    /// Runs the safety checks, then holds the key or combination. Returns why an action was refused.
    pub fn perform(self: &Arc<Self>, key: &str, hold_ms: u64) -> Result<(), String> {
        let result = Combo::parse(key)
            .ok_or_else(|| "key not supported".to_string())
            .and_then(|combo| {
                self.check(key, &combo)?;
                let hold_ms = hold_ms.min(MAX_HOLD_MS);
                if combo.modifiers.is_empty() { self.press(&combo.key, hold_ms) } else { self.press_combo(combo, hold_ms) }
            });
        self.record(key, &result);
        result
    }

    fn check(&self, key: &str, combo: &Combo) -> Result<(), String> {
        if self.paused.load(Ordering::SeqCst) {
            return Err("paused".into());
        }
        if let Some(reason) = combo.blocked() {
            return Err(reason.into());
        }
        if keys::scan_code(&combo.key).is_none() {
            return Err("key not supported".into());
        }
        if let Some(problem) = input::permission_problem() {
            return Err(problem.into());
        }
        let config = self.config();
        // Single keys go by the allowed-keys grid; a combination needs this exact combination approved here.
        if combo.modifiers.is_empty() {
            if !allowed_keys(&config.allowed_keys).iter().any(|k| *k == combo.key) {
                return Err("key disabled on this PC".into());
            }
        } else if !config.approved_combos.unwrap_or_default().iter().any(|k| k == key) {
            return Err(format!("{} isn't approved on this PC", keys::label(key)));
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
            let combo = self.combo.lock().unwrap();
            if combo.is_some() {
                return Err("a key combination is being pressed".into());
            }
            let mut held = self.held.lock().unwrap();
            let count = held.entry(key.to_string()).or_insert(0);
            if *count == 0 {
                input::send_key(&scan, false, &[])?;
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

    /// Holds a combination on its own: lets go of other held keys first, and refuses other presses until done.
    fn press_combo(self: &Arc<Self>, combo: Combo, hold_ms: u64) -> Result<(), String> {
        let scan = keys::scan_code(&combo.key).ok_or("key not supported")?;
        let id = {
            let mut current = self.combo.lock().unwrap();
            if current.is_some() {
                return Err("a key combination is being pressed".into());
            }
            self.release_held();
            for (i, m) in combo.modifiers.iter().enumerate() {
                input::send_key(&m.scan_code(), false, &combo.modifiers[..=i])?;
            }
            input::send_key(&scan, false, &combo.modifiers)?;
            let id = self.combo_count.fetch_add(1, Ordering::SeqCst);
            *current = Some((id, combo));
            id
        };
        let this = self.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(Duration::from_millis(hold_ms)).await;
            let mut current = this.combo.lock().unwrap();
            // Gone or replaced means release_all already let go of this one.
            if current.as_ref().is_some_and(|(held, _)| *held == id) {
                release_combo(&current.take().unwrap().1);
            }
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
                let _ = input::send_key(&scan, true, &[]);
            }
        }
    }

    fn release_held(&self) {
        let mut held = self.held.lock().unwrap();
        for key in held.keys() {
            if let Some(scan) = keys::scan_code(key) {
                let _ = input::send_key(&scan, true, &[]);
            }
        }
        held.clear();
    }

    pub fn release_all(&self) {
        // Same lock order as press_combo: combo, then held.
        let mut combo = self.combo.lock().unwrap();
        if let Some((_, held)) = combo.take() {
            release_combo(&held);
        }
        self.release_held();
    }

    fn record(&self, key: &str, result: &Result<(), String>) {
        let mut log = self.log.lock().unwrap();
        log.push_front(LogEntry { key: key.to_string(), ok: result.is_ok(), reason: result.clone().err() });
        log.truncate(LOG_LEN);
        drop(log);
        self.emit();
    }
}

/// Lets go of a combination's key, then its modifiers in reverse order.
fn release_combo(combo: &Combo) {
    if let Some(scan) = keys::scan_code(&combo.key) {
        let _ = input::send_key(&scan, true, &combo.modifiers);
    }
    for (i, m) in combo.modifiers.iter().enumerate().rev() {
        let _ = input::send_key(&m.scan_code(), true, &combo.modifiers[..i]);
    }
}

/// Single keys this PC allows. Nothing saved yet means everything.
fn allowed_keys(saved: &Option<Vec<String>>) -> Vec<String> {
    match saved {
        Some(keys) => keys.iter().filter(|k| keys::scan_code(k).is_some()).cloned().collect(),
        None => ALL_KEYS.iter().map(|k| k.to_string()).collect(),
    }
}

/// What the companion shows for a command: whether it will be pressed here, and if not, why.
fn command_view(command: &CommandInfo, allowed: &[String], approved: &[String]) -> CommandView {
    let combo = Combo::parse(&command.key);
    let is_combo = combo.as_ref().is_some_and(|c| !c.modifiers.is_empty());
    let problem = match &combo {
        None => Some("not a key this companion can press".to_string()),
        Some(c) => c.blocked().map(str::to_string).or_else(|| {
            if keys::scan_code(&c.key).is_none() {
                Some("not a key this companion can press".into())
            } else if !is_combo && !allowed.iter().any(|k| *k == c.key) {
                Some(format!("{} isn't allowed on this PC", keys::label(&c.key)))
            } else {
                None
            }
        }),
    };
    CommandView {
        keyword: command.keyword.clone(),
        key: command.key.clone(),
        label: keys::label(&command.key),
        enabled: command.enabled,
        combo: is_combo,
        approved: is_combo && approved.iter().any(|k| *k == command.key),
        problem,
    }
}

/// The combinations the old Ctrl/Alt toggles allowed: every modifier switched on (Shift went with the Shift keys)
/// and the key itself allowed. Nothing saved means everything was allowed.
fn carried_over_approvals(commands: &[CommandInfo], saved: &Option<Vec<String>>) -> Vec<String> {
    let had = |k: &str| saved.as_ref().is_none_or(|keys| keys.iter().any(|s| s == k));
    let mut approved: Vec<String> = commands
        .iter()
        .filter_map(|c| Combo::parse(&c.key).map(|combo| (c, combo)))
        .filter(|(_, combo)| !combo.modifiers.is_empty() && combo.blocked().is_none() && had(&combo.key))
        .filter(|(_, combo)| {
            combo.modifiers.iter().all(|m| match m {
                Modifier::Control => had(OLD_MODIFIER_TOGGLES[0]),
                Modifier::Alt => had(OLD_MODIFIER_TOGGLES[1]),
                Modifier::Shift => had("ShiftLeft") || had("ShiftRight"),
            })
        })
        .map(|(c, _)| c.key.clone())
        .collect();
    approved.sort();
    approved.dedup();
    approved
}

#[cfg(test)]
mod tests {
    use super::*;

    fn command(keyword: &str, key: &str) -> CommandInfo {
        CommandInfo { keyword: keyword.into(), key: key.into(), enabled: true }
    }
    fn keys(list: &[&str]) -> Vec<String> {
        list.iter().map(|k| k.to_string()).collect()
    }

    #[test]
    fn single_keys_go_by_the_grid_and_combinations_by_approval() {
        let allowed = keys(&["KeyA", "KeyE"]);
        let approved = keys(&["Control+Shift+KeyE"]);
        let view = |key: &str| command_view(&command("x", key), &allowed, &approved);
        assert_eq!((view("KeyA").combo, view("KeyA").problem), (false, None));
        assert_eq!(view("KeyD").problem.as_deref(), Some("D isn't allowed on this PC"));
        assert!(view("Control+Shift+KeyE").approved);
        // A combination doesn't need its key in the grid, only its own approval.
        assert_eq!((view("Control+KeyD").approved, view("Control+KeyD").problem), (false, None));
        assert!(view("Control+KeyW").problem.unwrap().contains("blocked"));
        assert_eq!(view("Control+KeyE").label, "Ctrl+E");
    }

    #[test]
    fn approvals_carry_over_from_the_old_toggles() {
        let commands = [command("a", "Control+KeyE"), command("b", "Alt+KeyE"), command("c", "Shift+KeyE"), command("d", "Control+KeyR"), command("e", "Control+KeyW")];
        // Ctrl on, Alt off, Shift keys and E allowed; R not allowed; Ctrl+W blocked anyway.
        let saved = Some(keys(&["Control", "ShiftLeft", "KeyE"]));
        assert_eq!(carried_over_approvals(&commands, &saved), keys(&["Control+KeyE", "Shift+KeyE"]));
        // A companion that never changed its keys allowed everything that isn't blocked.
        assert_eq!(carried_over_approvals(&commands, &None), keys(&["Alt+KeyE", "Control+KeyE", "Control+KeyR", "Shift+KeyE"]));
    }
}
