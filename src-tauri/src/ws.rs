use futures::{SinkExt, StreamExt};
use std::sync::{Arc, Mutex};
use tokio::sync::mpsc;

use re_frida_protocol::*;

use crate::crypto::{self, CryptoKey, hmac_sign};
use crate::state::{AppState, PendingRequests, WsClient, SERVER_URL, dbg_log};

// Embedded TLS certificate (compiled into binary)
const EMBEDDED_CERT: &[u8] = include_bytes!("../embedded_cert.pem");

/// Connect to the server with TLS and SPKI pinning
pub async fn connect_ws(state: AppState) {
    *state.client_outdated.lock().unwrap_or_else(|e| e.into_inner()) = None;

    let url = SERVER_URL;
    let pending: PendingRequests = Arc::new(Mutex::new(std::collections::HashMap::new()));
    let connected = state.connected.clone();
    let auth_state = state.auth.clone();
    let log_buffer = state.log_buffer.clone();

    let crypto_key = CryptoKey::new();

    let ws_stream = match connect_with_tls(url).await {
        Ok(stream) => stream,
        Err(_e) => {
            *connected.lock().unwrap_or_else(|e| e.into_inner()) = false;
            dbg_log!("WS connect failed: {}", _e);
            return;
        }
    };

    *connected.lock().unwrap_or_else(|e| e.into_inner()) = true;
    dbg_log!("WS connected to {}", url);

    let (mut ws_sink, mut ws_stream) = ws_stream.split();
    let (tx, mut rx) = mpsc::channel::<String>(64);

    // Spawn writer task
    tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            dbg_log!("WS SEND: {}", msg);
            if ws_sink
                .send(tokio_tungstenite::tungstenite::Message::Text(msg.into()))
                .await
                .is_err()
            {
                break;
            }
        }
    });

    // Spawn reader task (captures tx for Pong replies)
    let pending_clone = pending.clone();
    let connected_clone = connected.clone();
    let log_clone = log_buffer.clone();
    let reader_tx = tx.clone();
    let reader_key = crypto_key.as_bytes().to_vec();
    tokio::spawn(async move {
        while let Some(msg) = ws_stream.next().await {
            match msg {
                Ok(tokio_tungstenite::tungstenite::Message::Text(text)) => {
                    let text: String = text.into();
                    dbg_log!("WS RECV: {}", text);

                    // Check for signed ping/pong at raw JSON level
                    // (before WsMessage parsing, which would drop extra fields)
                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(&text) {
                        if let Some(msg_type) = val.get("type").and_then(|v| v.as_str()) {
                            match msg_type {
                                "ping" => {
                                    let timestamp = val.get("timestamp")
                                        .and_then(|v| v.as_str())
                                        .unwrap_or("");
                                    let signature = val.get("signature")
                                        .and_then(|v| v.as_str())
                                        .unwrap_or("");
                                    // Verify server's ping signature
                                    if crypto::hmac_verify(&reader_key, timestamp.as_bytes(), signature) {
                                        // Send signed pong back
                                        let ts = chrono::Utc::now().timestamp().to_string();
                                        let sig = crypto::hmac_sign(&reader_key, ts.as_bytes());
                                        let pong = serde_json::json!({
                                            "type": "pong",
                                            "timestamp": ts,
                                            "signature": crypto::base64_encode(&sig)
                                        });
                                        let _ = reader_tx.send(pong.to_string()).await;
                                    }
                                    continue;
                                }
                                "pong" => {
                                    // Verify pong signature (optional keepalive ack)
                                    continue;
                                }
                                _ => {}
                            }
                        }
                    }

                    match serde_json::from_str::<WsMessage>(&text) {
                        Ok(WsMessage::Response(resp)) => {
                            if let Some(sender) = pending_clone.lock().unwrap_or_else(|e| e.into_inner()).remove(&resp.id) {
                                let _ = sender.send(resp);
                            }
                        }
                        Ok(WsMessage::Pong) => {}
                        Ok(WsMessage::Event(event)) => {
                            match event {
                                ServerEvent::ServerMessage {
                                    message,
                                    level,
                                } => {
                                    let mut logs = log_clone.lock().unwrap_or_else(|e| e.into_inner());
                                    logs.push(format!(
                                        "[{}] [{}] {}",
                                        chrono::Local::now().format("%H:%M:%S"),
                                        level,
                                        message
                                    ));
                                }
                                _ => {
                                    dbg_log!("WS EVENT: {:?}", event);
                                }
                            }
                        }
                        Ok(WsMessage::Ping) => {
                            dbg_log!("WS PING received");
                            // Respond with WsMessage::Pong
                            if let Ok(json) = serde_json::to_string(&WsMessage::Pong) {
                                let _ = reader_tx.send(json).await;
                            }
                        }
                        Ok(WsMessage::Auth(_)) => {}
                        Ok(WsMessage::Request(_)) => {}
                        _ => {
                            dbg_log!("WS UNKNOWN message type");
                        }
                    }
                }
                Ok(tokio_tungstenite::tungstenite::Message::Ping(_data)) => {
                    dbg_log!("WS PING frame");
                }
                Ok(tokio_tungstenite::tungstenite::Message::Pong(_)) => {
                    dbg_log!("WS PONG frame");
                }
                Ok(tokio_tungstenite::tungstenite::Message::Close(_)) => {
                    dbg_log!("WS CLOSE received");
                    break;
                }
                Err(_e) => {
                    dbg_log!("WS ERROR: {}", _e);
                    break;
                }
                _ => {
                    dbg_log!("WS unknown frame type");
                }
            }
        }
        *connected_clone.lock().unwrap_or_else(|e| e.into_inner()) = false;
        dbg_log!("WS disconnected");
    });

    // Spawn heartbeat ping task (sends signed pings)
    let tx_ping = tx.clone();
    let ping_key = crypto_key.as_bytes().to_vec();
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(30)).await;
            let timestamp = chrono::Utc::now().timestamp().to_string();
            let signature = hmac_sign(&ping_key, timestamp.as_bytes());
            let ping_msg = serde_json::json!({
                "type": "ping",
                "timestamp": timestamp,
                "signature": crypto::base64_encode(&signature)
            });
            if tx_ping.send(ping_msg.to_string()).await.is_err() {
                break;
            }
        }
    });

    let client = WsClient {
        tx: tx.clone(),
        pending: pending.clone(),
    };
    *state.ws.write().await = Some(client);

    // Report client version to server
    let version = app_version_from_config();
    let ci_id = uuid::Uuid::new_v4().to_string();
    let (ci_tx, mut ci_rx) = tokio::sync::oneshot::channel::<Response>();
    pending.lock().unwrap_or_else(|e| e.into_inner()).insert(ci_id.clone(), ci_tx);

    let ci_msg = WsMessage::Request(Request {
        id: ci_id,
        action: Action::ClientInfo,
        data: Some(serde_json::json!({
            "version": version,
            "platform": std::env::consts::OS,
            "arch": std::env::consts::ARCH,
        })),
        token: None,
    });
    if let Ok(json) = serde_json::to_string(&ci_msg) {
        let _ = tx.send(json).await;
    }

    match tokio::time::timeout(std::time::Duration::from_secs(5), &mut ci_rx).await {
        Ok(Ok(resp)) => {
            if !resp.ok {
                let error = resp.error.unwrap_or_else(|| "Update required".to_string());
                dbg_log!("Server rejected client version: {}", error);
                *state.client_outdated.lock().unwrap_or_else(|e| e.into_inner()) = Some(error);
                *connected.lock().unwrap_or_else(|e| e.into_inner()) = false;
                return;
            }
        }
        Ok(Err(_)) => {
            dbg_log!("ClientInfo response channel closed");
        }
        Err(_) => {
            dbg_log!("ClientInfo response timed out");
        }
    }

    // Try to restore auth from saved token
    let saved_token = state.auth.lock().unwrap_or_else(|e| e.into_inner()).token.clone();
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
                        if let Ok(auth_result) = serde_json::from_value::<AuthResult>(data.clone())
                        {
                            let mut auth = auth_state.lock().unwrap_or_else(|e| e.into_inner());
                            auth.authenticated = auth_result.is_guild_member;
                            auth.username =
                                auth_result.user.as_ref().map(|u| u.username.clone());
                            auth.avatar_url =
                                auth_result.user.as_ref().and_then(|u| u.avatar.clone());
                            auth.discord_id =
                                auth_result.user.as_ref().map(|u| u.id.clone());
                        }
                    }
                }
            }
        }
    }

}

/// Connect to WebSocket with TLS using embedded certificate
async fn connect_with_tls(
    url: &str,
) -> Result<
    tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>,
    String,
> {
    let use_tls = url.starts_with("wss://");

    if use_tls {
        dbg_log!("Connecting with TLS using embedded certificate");

        let mut builder = native_tls::TlsConnector::builder();

        let cert = native_tls::Certificate::from_pem(EMBEDDED_CERT)
            .map_err(|e| format!("Failed to parse embedded cert: {}", e))?;
        builder.add_root_certificate(cert);

        let connector = builder.build()
            .map_err(|e| format!("TLS connector failed: {}", e))?;

        let (ws_stream, _) = tokio_tungstenite::connect_async_tls_with_config(
            url,
            None,
            false,
            Some(tokio_tungstenite::Connector::NativeTls(connector)),
        )
        .await
        .map_err(|e| format!("TLS connection failed: {}", e))?;

        dbg_log!("TLS connection established with embedded cert verification");

        Ok(ws_stream)
    } else {
        dbg_log!("WARNING: Using unencrypted WebSocket connection");
        let (ws_stream, _) = tokio_tungstenite::connect_async(url)
            .await
            .map_err(|e| format!("Connection failed: {}", e))?;
        Ok(ws_stream)
    }
}

/// Start OAuth callback server with local-only binding
pub async fn start_oauth_callback_server() -> mpsc::Receiver<String> {
    use crate::state::OAUTH_CALLBACK_PORT;
    let (tx, rx) = mpsc::channel(1);

    tokio::spawn(async move {
        let listener = match tokio::net::TcpListener::bind(format!(
            "127.0.0.1:{}",
            OAUTH_CALLBACK_PORT
        ))
        .await
        {
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
                    let code = code_part
                        .split(|c| c == '&' || c == ' ' || c == '?')
                        .next()
                        .unwrap_or("");
                    let _ = tx.send(code.to_string()).await;

                    let response = "HTTP/1.1 200 OK\r\n\
                        Content-Type: text/html\r\n\
                        X-Content-Type-Options: nosniff\r\n\
                        X-Frame-Options: DENY\r\n\
                        Content-Security-Policy: default-src 'none'\r\n\
                        \r\n\
                        <html><body><h1>Authenticated! You can close this window.</h1></body></html>";
                    let _ = write_half.write_all(response.as_bytes()).await;
                }
            }
        }
    });

    rx
}

/// Read the app version from tauri.conf.json at compile time.
fn app_version_from_config() -> String {
    let config: serde_json::Value = serde_json::from_str(include_str!("../tauri.conf.json"))
        .unwrap_or_default();
    config
        .get("version")
        .and_then(|v| v.as_str())
        .unwrap_or("0.0.0")
        .to_string()
}
