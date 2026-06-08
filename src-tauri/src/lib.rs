use futures::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::process::Command;
use std::sync::{Arc, Mutex};
use tauri::State;
use tokio::sync::{mpsc, oneshot, RwLock};

use re_frida_protocol::*;

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

// ─── Constants ──────────────────────────────────────────────────

const SERVER_URL: &str = "wss://refrida.rawnullbyte.com";
const OAUTH_CALLBACK_PORT: u16 = 17642;

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
    pub frida_port: u16,
    pub custom_package: String,
    pub advanced_mode: bool,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            theme: "dark".to_string(),
            frida_port: 27042,
            custom_package: "com.target.app".to_string(),
            advanced_mode: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthState {
    pub authenticated: bool,
    pub username: Option<String>,
    pub avatar_url: Option<String>,
    pub token: Option<String>,
}

// ─── WS Client ──────────────────────────────────────────────────

type PendingRequests = Arc<Mutex<HashMap<String, oneshot::Sender<Response>>>>;

#[derive(Clone)]
pub(crate) struct WsClient {
    tx: mpsc::Sender<String>,
    pending: PendingRequests,
}

impl WsClient {
    async fn send_request(&self, action: Action, data: Option<serde_json::Value>, token: Option<String>) -> Result<Response, String> {
        let id = uuid::Uuid::new_v4().to_string();
        let (resp_tx, resp_rx) = oneshot::channel();
        self.pending.lock().unwrap().insert(id.clone(), resp_tx);

        let msg = WsMessage::Request(Request {
            id: id.clone(),
            action,
            data,
            token,
        });
        let json = serde_json::to_string(&msg).map_err(|e| e.to_string())?;
        self.tx.send(json).await.map_err(|e| e.to_string())?;

        match tokio::time::timeout(std::time::Duration::from_secs(10), resp_rx).await {
            Ok(Ok(resp)) => Ok(resp),
            Ok(Err(_)) => Err("Channel closed".to_string()),
            Err(_) => {
                self.pending.lock().unwrap().remove(&id);
                Err("Request timed out".to_string())
            }
        }
    }

    async fn send_auth(&self, frame: AuthFrame) -> Result<Response, String> {
        let id = uuid::Uuid::new_v4().to_string();
        let (resp_tx, resp_rx) = oneshot::channel();
        self.pending.lock().unwrap().insert(id.clone(), resp_tx);

        let msg = WsMessage::Auth(frame);
        let json = serde_json::to_string(&msg).map_err(|e| e.to_string())?;
        self.tx.send(json).await.map_err(|e| e.to_string())?;

        match tokio::time::timeout(std::time::Duration::from_secs(10), resp_rx).await {
            Ok(Ok(resp)) => Ok(resp),
            Ok(Err(_)) => Err("Channel closed".to_string()),
            Err(_) => {
                self.pending.lock().unwrap().remove(&id);
                Err("Auth timed out".to_string())
            }
        }
    }
}

// ─── State ──────────────────────────────────────────────────────

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<Mutex<AppConfig>>,
    pub log_buffer: Arc<Mutex<Vec<String>>>,
    pub auth: Arc<Mutex<AuthState>>,
    pub adb_path: String,
    pub frida_path: String,
    pub(crate) ws: Arc<RwLock<Option<WsClient>>>,
    pub connected: Arc<Mutex<bool>>,
}

impl AppState {
    pub fn new() -> Self {
        let adb_path = find_binary("adb");
        let frida_path = find_binary("frida-inject");
        let config = load_config();
        dbg_log!("ADB path: {}", adb_path);
        dbg_log!("Frida path: {}", frida_path);

        Self {
            config: Arc::new(Mutex::new(config)),
            log_buffer: Arc::new(Mutex::new(Vec::new())),
            auth: Arc::new(Mutex::new(AuthState {
                authenticated: false,
                username: None,
                avatar_url: None,
                token: None,
            })),
            adb_path,
            frida_path,
            ws: Arc::new(RwLock::new(None)),
            connected: Arc::new(Mutex::new(false)),
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

// ─── Config Persistence ─────────────────────────────────────────

fn config_path() -> std::path::PathBuf {
    let dir = dirs::config_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("re-frida");
    std::fs::create_dir_all(&dir).ok();
    dir.join("config.json")
}

fn load_config() -> AppConfig {
    let path = config_path();
    match std::fs::read_to_string(&path) {
        Ok(data) => serde_json::from_str(&data).unwrap_or_default(),
        Err(_) => AppConfig::default(),
    }
}

fn save_config_to_disk(config: &AppConfig) {
    let path = config_path();
    if let Ok(json) = serde_json::to_string_pretty(config) {
        std::fs::write(path, json).ok();
    }
}

// ─── Binary Discovery ───────────────────────────────────────────

fn find_binary(name: &str) -> String {
    #[cfg(target_os = "windows")]
    let ext = ".exe";
    #[cfg(not(target_os = "windows"))]
    let ext = "";

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
    let cwd = std::path::PathBuf::from("tools").join(&name_plain);
    if cwd.exists() {
        return cwd.to_string_lossy().to_string();
    }
    name_plain
}

// ─── WS Connection ──────────────────────────────────────────────

async fn connect_ws(state: AppState) {
    let url = SERVER_URL;
    let pending: PendingRequests = Arc::new(Mutex::new(HashMap::new()));
    let connected = state.connected.clone();
    let auth_state = state.auth.clone();
    let log_buffer = state.log_buffer.clone();

    match tokio_tungstenite::connect_async(url).await {
        Ok((ws_stream, _)) => {
            *connected.lock().unwrap() = true;
            dbg_log!("WS connected to {}", url);

            let (mut ws_sink, mut ws_stream) = ws_stream.split();
            let (tx, mut rx) = mpsc::channel::<String>(64);

            // Spawn writer task
            tokio::spawn(async move {
                while let Some(msg) = rx.recv().await {
                    if ws_sink.send(tokio_tungstenite::tungstenite::Message::Text(msg.into())).await.is_err() {
                        break;
                    }
                }
            });

            // Spawn reader task
            let pending_clone = pending.clone();
            let connected_clone = connected.clone();
            let log_clone = log_buffer.clone();
            tokio::spawn(async move {
                while let Some(msg) = ws_stream.next().await {
                    match msg {
                        Ok(tokio_tungstenite::tungstenite::Message::Text(text)) => {
                            let text: String = text.into();
                            match serde_json::from_str::<WsMessage>(&text) {
                                Ok(WsMessage::Response(resp)) => {
                                    if let Some(sender) = pending_clone.lock().unwrap().remove(&resp.id) {
                                        let _ = sender.send(resp);
                                    }
                                }
                                Ok(WsMessage::Pong) => {}
                                Ok(WsMessage::Event(ServerEvent::ServerMessage { message, level })) => {
                                    let mut logs = log_clone.lock().unwrap();
                                    logs.push(format!("[{}] [{}] {}", chrono::Local::now().format("%H:%M:%S"), level, message));
                                }
                                _ => {}
                            }
                        }
                        Ok(tokio_tungstenite::tungstenite::Message::Close(_)) => break,
                        Err(_) => break,
                        _ => {}
                    }
                }
                *connected_clone.lock().unwrap() = false;
                dbg_log!("WS disconnected");
            });

            // Spawn ping task
            let tx_ping = tx.clone();
            tokio::spawn(async move {
                loop {
                    tokio::time::sleep(std::time::Duration::from_secs(30)).await;
                    let ping = serde_json::to_string(&WsMessage::Ping).unwrap_or_default();
                    if tx_ping.send(ping).await.is_err() {
                        break;
                    }
                }
            });

            let client = WsClient {
                tx,
                pending: pending.clone(),
            };
            *state.ws.write().await = Some(client);

            // Try to restore auth from saved token
            let saved_token = state.auth.lock().unwrap().token.clone();
            if let Some(token) = saved_token {
                let ws_guard = state.ws.read().await;
                if let Some(ws) = ws_guard.as_ref() {
                    let frame = AuthFrame {
                        id: uuid::Uuid::new_v4().to_string(),
                        token: Some(token),
                        discord_code: None,
                        discord_redirect_uri: None,
                    };
                    if let Ok(resp) = ws.send_auth(frame).await {
                        if resp.ok {
                            if let Some(data) = &resp.data {
                                if let Ok(auth_result) = serde_json::from_value::<AuthResult>(data.clone()) {
                                    if auth_result.is_guild_member {
                                        let mut auth = auth_state.lock().unwrap();
                                        auth.authenticated = true;
                                        auth.username = auth_result.user.as_ref().map(|u| u.username.clone());
                                        auth.avatar_url = auth_result.user.as_ref().and_then(|u| u.avatar.as_ref().map(|a| {
                                            format!("https://cdn.discordapp.com/avatars/{}/{}.png", u.id, a)
                                        }));
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        #[allow(unused_variables)]
        Err(e) => {
            *connected.lock().unwrap() = false;
            dbg_log!("WS connect failed: {}", e);
        }
    }
}

// ─── OAuth Callback Server ──────────────────────────────────────

async fn start_oauth_callback_server() -> mpsc::Receiver<String> {
    let (tx, rx) = mpsc::channel(1);

    tokio::spawn(async move {
        let listener = match tokio::net::TcpListener::bind(format!("127.0.0.1:{}", OAUTH_CALLBACK_PORT)).await {
            Ok(l) => l,
            #[allow(unused_variables)]
            Err(e) => {
                dbg_log!("Failed to bind OAuth callback: {}", e);
                return;
            }
        };

        if let Ok((stream, _)) = listener.accept().await {
            use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
            let (read_half, mut write_half) = tokio::io::split(stream);
            let mut reader = BufReader::new(read_half);
            let mut line = String::new();
            if reader.read_line(&mut line).await.is_ok() {
                if let Some(code_start) = line.find("code=") {
                    let code_part = &line[code_start + 5..];
                    let code = code_part.split(|c| c == '&' || c == ' ' || c == '?').next().unwrap_or("");
                    let _ = tx.send(code.to_string()).await;

                    let response = "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n<html><body><h1>Authenticated! You can close this window.</h1></body></html>";
                    let _ = write_half.write_all(response.as_bytes()).await;
                }
            }
        }
    });

    rx
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

    let tmp_dir = std::env::temp_dir();
    let script_path = tmp_dir.join("re-frida-script.js");
    std::fs::write(&script_path, &script_code)
        .map_err(|e| format!("Failed to write script: {}", e))?;

    state.add_log(format!("Executing script on {}", device_id));

    let result = if use_gadget {
        let port = state.config.lock().unwrap().frida_port;
        Command::new(&state.frida_path)
            .arg("-H")
            .arg(format!("127.0.0.1:{}", port))
            .arg("-l")
            .arg(script_path.to_str().unwrap_or(""))
            .arg("--no-pause")
            .output()
    } else {
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
    save_config_to_disk(&config);
    *state.config.lock().unwrap() = config;
    Ok(())
}

// ─── Auth Commands ──────────────────────────────────────────────

#[tauri::command]
async fn get_auth_state(state: State<'_, AppState>) -> Result<AuthState, String> {
    Ok(state.auth.lock().unwrap().clone())
}

#[tauri::command]
async fn start_login(state: State<'_, AppState>) -> Result<String, String> {
    let ws_guard = state.ws.read().await;
    let ws = ws_guard.as_ref().ok_or("Not connected to server")?;

    let resp = ws.send_request(Action::GetConfig, None, None).await?;
    if !resp.ok {
        return Err(resp.error.unwrap_or_else(|| "Failed to get config".to_string()));
    }

    let config_data: ServerConfigData = serde_json::from_value(resp.data.unwrap_or_default())
        .map_err(|e| format!("Invalid config: {}", e))?;

    let auth_url = config_data.oauth.auth_url.clone();

    let mut callback_rx = start_oauth_callback_server().await;

    open::that(&auth_url).map_err(|e| format!("Failed to open browser: {}", e))?;
    state.add_log("Opened Discord login in browser".to_string());

    let code = tokio::time::timeout(std::time::Duration::from_secs(120), callback_rx.recv())
        .await
        .map_err(|_| "Login timed out".to_string())?
        .ok_or("No callback received".to_string())?;

    dbg_log!("Got OAuth code");

    let auth_frame = AuthFrame {
        id: uuid::Uuid::new_v4().to_string(),
        token: None,
        discord_code: Some(code),
        discord_redirect_uri: Some(config_data.oauth.redirect_uri),
    };

    let resp = ws.send_auth(auth_frame).await?;
    if !resp.ok {
        return Err(resp.error.unwrap_or_else(|| "Auth failed".to_string()));
    }

    let auth_result: AuthResult = serde_json::from_value(resp.data.unwrap_or_default())
        .map_err(|e| format!("Invalid auth response: {}", e))?;

    if !auth_result.is_guild_member {
        return Err("You must be a member of the Discord server".to_string());
    }

    let mut auth = state.auth.lock().unwrap();
    auth.authenticated = true;
    auth.token = auth_result.token.clone();
    auth.username = auth_result.user.as_ref().map(|u| u.username.clone());
    auth.avatar_url = auth_result.user.as_ref().and_then(|u| u.avatar.as_ref().map(|a| {
        format!("https://cdn.discordapp.com/avatars/{}/{}.png", u.id, a)
    }));

    state.add_log(format!("Logged in as {}", auth.username.as_deref().unwrap_or("unknown")));
    Ok("Login successful".to_string())
}

#[tauri::command]
async fn logout(state: State<'_, AppState>) -> Result<(), String> {
    let ws_guard = state.ws.read().await;
    if let Some(ws) = ws_guard.as_ref() {
        let token = state.auth.lock().unwrap().token.clone();
        let _ = ws.send_request(Action::AuthLogout, None, token).await;
    }

    let mut auth = state.auth.lock().unwrap();
    auth.authenticated = false;
    auth.username = None;
    auth.avatar_url = None;
    auth.token = None;
    state.add_log("Logged out".to_string());
    Ok(())
}

// ─── Marketplace Commands ───────────────────────────────────────

#[tauri::command]
async fn list_scripts(
    state: State<'_, AppState>,
    search: Option<String>,
    category: Option<String>,
    sort: Option<String>,
) -> Result<Vec<ScriptData>, String> {
    let ws_guard = state.ws.read().await;
    let ws = ws_guard.as_ref().ok_or("Not connected to server")?;
    let token = state.auth.lock().unwrap().token.clone();

    let query = ListScriptsQuery {
        search: search.unwrap_or_default(),
        category: category.unwrap_or_default(),
        game: String::new(),
        game_version: String::new(),
        sort: sort.unwrap_or_else(|| "downloads".to_string()),
    };

    let data = serde_json::to_value(&query).ok();
    let resp = ws.send_request(Action::ListScripts, data, token).await?;

    if !resp.ok {
        return Err(resp.error.unwrap_or_else(|| "Failed to list scripts".to_string()));
    }

    let scripts: Vec<ScriptData> = serde_json::from_value(
        resp.data.and_then(|d| d.get("scripts").cloned()).unwrap_or_default()
    ).map_err(|e| format!("Invalid scripts data: {}", e))?;

    Ok(scripts)
}

#[tauri::command]
async fn vote_script(
    state: State<'_, AppState>,
    script_id: String,
    upvote: bool,
) -> Result<(), String> {
    let ws_guard = state.ws.read().await;
    let ws = ws_guard.as_ref().ok_or("Not connected to server")?;
    let token = state.auth.lock().unwrap().token.clone().ok_or("Not logged in")?;

    let payload = VotePayload { script_id, upvote };
    let data = serde_json::to_value(&payload).ok();
    let resp = ws.send_request(Action::VoteScript, data, Some(token)).await?;

    if !resp.ok {
        return Err(resp.error.unwrap_or_else(|| "Vote failed".to_string()));
    }

    Ok(())
}

#[tauri::command]
async fn download_script(
    state: State<'_, AppState>,
    script_id: String,
) -> Result<(), String> {
    let ws_guard = state.ws.read().await;
    let ws = ws_guard.as_ref().ok_or("Not connected to server")?;
    let token = state.auth.lock().unwrap().token.clone();

    let data = serde_json::json!({ "script_id": script_id });
    let resp = ws.send_request(Action::DownloadScript, Some(data), token).await?;

    if !resp.ok {
        return Err(resp.error.unwrap_or_else(|| "Download failed".to_string()));
    }

    Ok(())
}

// ─── Connection Status ──────────────────────────────────────────

#[tauri::command]
async fn is_connected(state: State<'_, AppState>) -> Result<bool, String> {
    Ok(*state.connected.lock().unwrap())
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

    let state = AppState::new();

    // Connect WebSocket in background
    let state_for_ws = state.clone();
    tokio::spawn(async move {
        connect_ws(state_for_ws).await;
    });

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .manage(state)
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
            start_login,
            logout,
            list_scripts,
            vote_script,
            download_script,
            is_connected,
            get_app_version,
            is_debug_build,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
