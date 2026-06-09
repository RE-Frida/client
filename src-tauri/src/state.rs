use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::sync::{mpsc, oneshot, RwLock};

use re_frida_protocol::*;

use crate::binary::find_binary;
use crate::config::load_config;
use crate::types::{AppConfig, AuthState};

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

pub(crate) use dbg_log;

// ─── Constants ──────────────────────────────────────────────────

pub const SERVER_URL: &str = "wss://78.80.45.23:26202/ws";
pub const OAUTH_CALLBACK_PORT: u16 = 17642;

// ─── WS Client ──────────────────────────────────────────────────

pub type PendingRequests = Arc<Mutex<HashMap<String, oneshot::Sender<Response>>>>;

#[derive(Clone)]
pub(crate) struct WsClient {
    pub tx: mpsc::Sender<String>,
    pub pending: PendingRequests,
}

impl WsClient {
    pub async fn send_request(&self, action: Action, data: Option<serde_json::Value>, token: Option<String>) -> Result<Response, String> {
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

    pub async fn send_auth(&self, frame: AuthFrame) -> Result<Response, String> {
        let id = frame.id.clone();
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

// ─── AppState ───────────────────────────────────────────────────

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<Mutex<AppConfig>>,
    pub log_buffer: Arc<Mutex<Vec<String>>>,
    pub auth: Arc<Mutex<AuthState>>,
    pub adb_path: String,
    pub frida_path: String,
    pub frida_inject_path: String,
    pub(crate) ws: Arc<RwLock<Option<WsClient>>>,
    pub connected: Arc<Mutex<bool>>,
}

impl AppState {
    pub fn new() -> Self {
        let adb_path = find_binary("adb");
        let frida_path = find_binary("frida");
        let frida_inject_path = find_binary("frida-inject");
        let config = load_config();
        dbg_log!("ADB path: {}", adb_path);
        dbg_log!("Frida path: {}", frida_path);
        dbg_log!("Frida-inject path: {}", frida_inject_path);

        // Load saved auth token from config
        let auth = AuthState {
            authenticated: config.auth.token.is_some(),
            username: None,
            avatar_url: None,
            token: config.auth.token.clone(),
        };

        Self {
            config: Arc::new(Mutex::new(config)),
            log_buffer: Arc::new(Mutex::new(Vec::new())),
            auth: Arc::new(Mutex::new(auth)),
            adb_path,
            frida_path,
            frida_inject_path,
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
