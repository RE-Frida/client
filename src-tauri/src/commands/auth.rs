use tauri::State;

use re_frida_protocol::*;

use crate::state::{AppState, dbg_log};
use crate::types::AuthState;
use crate::ws::start_oauth_callback_server;

#[tauri::command]
pub async fn get_auth_state(state: State<'_, AppState>) -> Result<AuthState, String> {
    Ok(state.auth.lock().unwrap().clone())
}

#[tauri::command]
pub async fn start_login(state: State<'_, AppState>) -> Result<String, String> {
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
pub async fn logout(state: State<'_, AppState>) -> Result<(), String> {
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
