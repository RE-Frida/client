use tauri::State;

use re_frida_protocol::*;

use crate::state::AppState;

#[tauri::command]
pub async fn list_scripts(
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
pub async fn vote_script(
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
pub async fn download_script(
    state: State<'_, AppState>,
    script_id: String,
) -> Result<(), String> {
    let ws_guard = state.ws.read().await;
    let ws = ws_guard.as_ref().ok_or("Not connected to server")?;
    let token = state.auth.lock().unwrap().token.clone();

    let data = serde_json::json!({ "id": script_id });
    let resp = ws.send_request(Action::DownloadScript, Some(data), token).await?;

    if !resp.ok {
        return Err(resp.error.unwrap_or_else(|| "Download failed".to_string()));
    }

    Ok(())
}

#[tauri::command]
pub async fn get_tags(
    state: State<'_, AppState>,
) -> Result<TagsData, String> {
    let ws_guard = state.ws.read().await;
    let ws = ws_guard.as_ref().ok_or("Not connected to server")?;
    let token = state.auth.lock().unwrap().token.clone();

    let resp = ws.send_request(Action::GetTags, None, token).await?;

    if !resp.ok {
        return Err(resp.error.unwrap_or_else(|| "Failed to get tags".to_string()));
    }

    serde_json::from_value(resp.data.ok_or("No tags data")?)
        .map_err(|e| format!("Invalid tags data: {}", e))
}
