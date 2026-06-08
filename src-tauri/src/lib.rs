use serde::{Deserialize, Serialize};
use std::process::Command;
use std::sync::{Arc, Mutex};
use tauri::State;

// ─── Debug Logging ──────────────────────────────────────────────

#[cfg(feature = "debug")]
macro_rules! dbg_log {
    ($($arg:tt)*) => {
        eprintln!("[DEBUG] {}", format!($($arg)*))
    };
}

#[cfg(not(feature = "debug"))]
macro_rules! dbg_log {
    ($($arg:tt)*) => {};
}

// ─── Types ──────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceInfo {
    pub id: String,
    pub model: Option<String>,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub theme: String,
    pub server_url: String,
    pub frida_port: u16,
    pub custom_package: String,
    pub advanced_mode: bool,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            theme: "dark".to_string(),
            server_url: "wss://refrida.rawnullbyte.com".to_string(),
            frida_port: 27042,
            custom_package: "com.target.app".to_string(),
            advanced_mode: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScriptItem {
    pub id: String,
    pub name: String,
    pub description: String,
    pub author: String,
    pub category: String,
    pub downloads: u64,
    pub upvotes: i64,
    pub downvotes: i64,
    pub user_vote: Option<bool>,
    pub code: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthState {
    pub authenticated: bool,
    pub username: Option<String>,
    pub avatar_url: Option<String>,
    pub token: Option<String>,
}

// ─── State ──────────────────────────────────────────────────────

pub struct AppState {
    pub config: Arc<Mutex<AppConfig>>,
    pub log_buffer: Arc<Mutex<Vec<String>>>,
    pub auth: Arc<Mutex<AuthState>>,
    pub adb_path: String,
    pub frida_path: String,
}

impl AppState {
    pub fn new() -> Self {
        let adb_path = find_binary("adb");
        let frida_path = find_binary("frida-inject");
        dbg_log!("ADB path: {}", adb_path);
        dbg_log!("Frida path: {}", frida_path);

        Self {
            config: Arc::new(Mutex::new(AppConfig::default())),
            log_buffer: Arc::new(Mutex::new(Vec::new())),
            auth: Arc::new(Mutex::new(AuthState {
                authenticated: false,
                username: None,
                avatar_url: None,
                token: None,
            })),
            adb_path,
            frida_path,
        }
    }

    pub fn add_log(&self, line: String) {
        dbg_log!("LOG: {}", line);
        let mut logs = self.log_buffer.lock().unwrap();
        logs.push(format!("[{}] {}", chrono::Local::now().format("%H:%M:%S"), line));
        if logs.len() > 10000 {
            let excess = logs.len() - 10000;
            logs.drain(0..excess);
        }
    }
}

fn find_binary(name: &str) -> String {
    #[cfg(target_os = "windows")]
    let ext = ".exe";
    #[cfg(not(target_os = "windows"))]
    let ext = "";

    // Tauri sidecars use target triple suffix
    let suffix = if cfg!(target_os = "windows") {
        "-x86_64-pc-windows-msvc"
    } else if cfg!(target_os = "linux") {
        "-x86_64-unknown-linux-gnu"
    } else if cfg!(target_os = "macos") {
        "-x86_64-apple-darwin"
    } else {
        ""
    };

    let name_with_suffix = format!("{}{}{}", name, suffix, ext);
    let name_plain = format!("{}{}", name, ext);

    // 1. Check next to the executable (with target triple - Tauri sidecar)
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let bundled = dir.join("tools").join(&name_with_suffix);
            if bundled.exists() {
                return bundled.to_string_lossy().to_string();
            }
            let bundled = dir.join(&name_with_suffix);
            if bundled.exists() {
                return bundled.to_string_lossy().to_string();
            }
            // Without target triple
            let bundled = dir.join("tools").join(&name_plain);
            if bundled.exists() {
                return bundled.to_string_lossy().to_string();
            }
            let bundled = dir.join(&name_plain);
            if bundled.exists() {
                return bundled.to_string_lossy().to_string();
            }
        }
    }
    // 2. Check current working directory
    let cwd = std::path::PathBuf::from("tools").join(&name_plain);
    if cwd.exists() {
        return cwd.to_string_lossy().to_string();
    }
    // 3. Fall back to system PATH
    name_plain
}

// ─── ADB Commands ───────────────────────────────────────────────

#[tauri::command]
async fn discover_devices(state: State<'_, AppState>) -> Result<Vec<DeviceInfo>, String> {
    dbg_log!("discover_devices called");
    let output = Command::new(&state.adb_path)
        .arg("devices")
        .arg("-l")
        .output()
        .map_err(|e| format!("Failed to execute adb: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("ADB error: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let re = regex::Regex::new(r"^(\S+)\s+(\w+)\s+(.*)$").unwrap();
    let mut devices = Vec::new();

    for line in stdout.lines().skip(1) {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        if let Some(caps) = re.captures(line) {
            let device_id = caps[1].to_string();
            let status = caps[2].to_string();
            let details = caps[3].to_string();
            let model = details
                .split_whitespace()
                .find(|s| s.starts_with("model:"))
                .and_then(|s| s.strip_prefix("model:"))
                .map(|s| s.to_string());
            devices.push(DeviceInfo {
                id: device_id,
                model,
                status,
            });
        }
    }

    state.add_log(format!("Discovered {} device(s)", devices.len()));
    dbg_log!("Found {} devices", devices.len());
    Ok(devices)
}

#[tauri::command]
async fn start_session(state: State<'_, AppState>, device_id: String) -> Result<String, String> {
    let port = state.config.lock().unwrap().frida_port;
    dbg_log!("start_session on device {} port {}", device_id, port);

    // Forward port
    let output = Command::new(&state.adb_path)
        .arg("-s")
        .arg(&device_id)
        .arg("forward")
        .arg(format!("tcp:{}", port))
        .arg(format!("tcp:{}", port))
        .output()
        .map_err(|e| format!("Port forward failed: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Port forward error: {}", stderr));
    }

    state.add_log(format!("Session started on {} (port {})", device_id, port));
    Ok(format!("Connected to {} on port {}", device_id, port))
}

#[tauri::command]
async fn stop_session(state: State<'_, AppState>) -> Result<String, String> {
    dbg_log!("stop_session");
    state.add_log("Session stopped".to_string());
    Ok("Session stopped".to_string())
}

#[tauri::command]
async fn execute_script(
    state: State<'_, AppState>,
    device_id: String,
    script_code: String,
    use_gadget: bool,
) -> Result<String, String> {
    dbg_log!("execute_script on device {} (gadget={})", device_id, use_gadget);

    // Write script to temp file
    let tmp_dir = std::env::temp_dir();
    let script_path = tmp_dir.join("re-frida-script.js");
    std::fs::write(&script_path, &script_code)
        .map_err(|e| format!("Failed to write script: {}", e))?;

    state.add_log(format!("Executing script on {}", device_id));

    let result = if use_gadget {
        // Connect to gadget: frida -H 127.0.0.1:<port> -l script.js
        let port = state.config.lock().unwrap().frida_port;
        Command::new(&state.frida_path)
            .arg("-H")
            .arg(format!("127.0.0.1:{}", port))
            .arg("-l")
            .arg(script_path.to_str().unwrap_or(""))
            .arg("--no-pause")
            .output()
    } else {
        // Direct USB: frida -U -n Gadget -l script.js
        Command::new(&state.frida_path)
            .arg("-U")
            .arg("-n")
            .arg("Gadget")
            .arg("-l")
            .arg(script_path.to_str().unwrap_or(""))
            .arg("--no-pause")
            .output()
    };

    let _ = std::fs::remove_file(&script_path);

    match result {
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout).to_string();
            let stderr = String::from_utf8_lossy(&out.stderr).to_string();
            dbg_log!("frida stdout: {}", stdout);
            dbg_log!("frida stderr: {}", stderr);
            if out.status.success() {
                state.add_log("Script executed successfully".to_string());
                Ok(if stdout.is_empty() { stderr } else { stdout })
            } else {
                state.add_log(format!("Script error: {}", stderr));
                Err(stderr)
            }
        }
        Err(e) => {
            state.add_log(format!("Execution error: {}", e));
            Err(format!("frida failed: {}", e))
        }
    }
}

#[tauri::command]
async fn push_gadget(
    state: State<'_, AppState>,
    device_id: String,
    gadget_path: String,
) -> Result<String, String> {
    dbg_log!("push_gadget to {}", device_id);
    let output = Command::new(&state.adb_path)
        .arg("-s")
        .arg(&device_id)
        .arg("push")
        .arg(&gadget_path)
        .arg("/data/local/tmp/libfrida-gadget.so")
        .output()
        .map_err(|e| format!("Push failed: {}", e))?;

    if output.status.success() {
        state.add_log(format!("Gadget pushed to {}", device_id));
        Ok("Gadget pushed successfully".to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("Push error: {}", stderr))
    }
}

#[tauri::command]
async fn list_packages(
    state: State<'_, AppState>,
    device_id: String,
) -> Result<Vec<String>, String> {
    dbg_log!("list_packages for {}", device_id);
    let output = Command::new(&state.adb_path)
        .arg("-s")
        .arg(&device_id)
        .arg("shell")
        .arg("pm")
        .arg("list")
        .arg("packages")
        .arg("-3")
        .output()
        .map_err(|e| format!("Failed to list packages: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let packages: Vec<String> = stdout
        .lines()
        .filter_map(|line| {
            line.strip_prefix("package:")
                .map(|s| s.trim().to_string())
        })
        .collect();

    Ok(packages)
}

// ─── Log Commands ───────────────────────────────────────────────

#[tauri::command]
async fn get_logs(state: State<'_, AppState>) -> Result<String, String> {
    let logs = state.log_buffer.lock().unwrap();
    Ok(logs.join("\n"))
}

#[tauri::command]
async fn clear_logs(state: State<'_, AppState>) -> Result<(), String> {
    state.log_buffer.lock().unwrap().clear();
    Ok(())
}

// ─── Config Commands ────────────────────────────────────────────

#[tauri::command]
async fn get_config(state: State<'_, AppState>) -> Result<AppConfig, String> {
    Ok(state.config.lock().unwrap().clone())
}

#[tauri::command]
async fn save_config(state: State<'_, AppState>, config: AppConfig) -> Result<(), String> {
    *state.config.lock().unwrap() = config;
    Ok(())
}

// ─── Auth Commands ──────────────────────────────────────────────

#[tauri::command]
async fn get_auth_state(state: State<'_, AppState>) -> Result<AuthState, String> {
    Ok(state.auth.lock().unwrap().clone())
}

#[tauri::command]
async fn logout(state: State<'_, AppState>) -> Result<(), String> {
    let mut auth = state.auth.lock().unwrap();
    auth.authenticated = false;
    auth.username = None;
    auth.avatar_url = None;
    auth.token = None;
    state.add_log("Logged out".to_string());
    Ok(())
}

// ─── App Info ───────────────────────────────────────────────────

#[tauri::command]
async fn get_app_version() -> Result<String, String> {
    Ok(env!("CARGO_PKG_VERSION").to_string())
}

#[tauri::command]
async fn is_debug_build() -> Result<bool, String> {
    Ok(cfg!(feature = "debug"))
}

// ─── Entry Point ────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(feature = "debug")]
    {
        env_logger::init();
        dbg_log!("Debug build - verbose logging enabled");
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            discover_devices,
            start_session,
            stop_session,
            execute_script,
            push_gadget,
            list_packages,
            get_logs,
            clear_logs,
            get_config,
            save_config,
            get_auth_state,
            logout,
            get_app_version,
            is_debug_build,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
