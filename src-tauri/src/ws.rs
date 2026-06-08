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
    let url = SERVER_URL;
    let pending: PendingRequests = Arc::new(Mutex::new(std::collections::HashMap::new()));
    let connected = state.connected.clone();
    let auth_state = state.auth.clone();
    let log_buffer = state.log_buffer.clone();

    // Create crypto key for message signing
    let crypto_key = CryptoKey::new();

    // Connect with TLS verification
    let ws_stream = match connect_with_tls(url).await {
        Ok(stream) => stream,
        Err(_e) => {
            *connected.lock().unwrap() = false;
            dbg_log!("WS connect failed: {}", _e);
            return;
        }
    };

    *connected.lock().unwrap() = true;
    dbg_log!("WS connected to {}", url);

    let (mut ws_sink, mut ws_stream) = ws_stream.split();
    let (tx, mut rx) = mpsc::channel::<String>(64);

    // Spawn writer task
    tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if ws_sink
                .send(tokio_tungstenite::tungstenite::Message::Text(msg.into()))
                .await
                .is_err()
            {
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
                        Ok(WsMessage::Event(ServerEvent::ServerMessage {
                            message,
                            level,
                        })) => {
                            let mut logs = log_clone.lock().unwrap();
                            logs.push(format!(
                                "[{}] [{}] {}",
                                chrono::Local::now().format("%H:%M:%S"),
                                level,
                                message
                            ));
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

    // Spawn ping task with HMAC signing
    let tx_ping = tx.clone();
    let ping_key = crypto_key.as_bytes().to_vec();
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(30)).await;

            // Sign the ping message
            let timestamp = chrono::Utc::now().timestamp().to_string();
            let signature = hmac_sign(&ping_key, timestamp.as_bytes());

            let ping_msg = serde_json::json!({
                "type": "ping",
                "timestamp": timestamp,
                "signature": crypto::base64_encode(&signature)
            });

            if tx_ping
                .send(ping_msg.to_string())
                .await
                .is_err()
            {
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
                        if let Ok(auth_result) = serde_json::from_value::<AuthResult>(data.clone())
                        {
                            if auth_result.is_guild_member {
                                let mut auth = auth_state.lock().unwrap();
                                auth.authenticated = true;
                                auth.username =
                                    auth_result.user.as_ref().map(|u| u.username.clone());
                                auth.avatar_url = auth_result.user.as_ref().and_then(|u| {
                                    u.avatar.as_ref().map(|a| {
                                        format!(
                                            "https://cdn.discordapp.com/avatars/{}/{}.png",
                                            u.id, a
                                        )
                                    })
                                });
                            }
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

        // Build TLS connector that trusts our embedded self-signed cert
        let mut builder = native_tls::TlsConnector::builder();

        // Add our embedded cert as a trusted root CA
        let cert = native_tls::Certificate::from_pem(EMBEDDED_CERT)
            .map_err(|e| format!("Failed to parse embedded cert: {}", e))?;
        builder.add_root_certificate(cert);

        let connector = builder.build()
            .map_err(|e| format!("TLS connector failed: {}", e))?;

        // Use connect_async_tls_with_config with custom connector
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
        // Plain WebSocket (development only)
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

                    // Response with security headers
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
