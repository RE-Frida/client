use tauri::State;

use re_frida_protocol::*;

use crate::state::AppState;

#[tauri::command]
pub async fn list_projects(
    state: State<'_, AppState>,
) -> Result<Vec<ProjectData>, String> {
    let ws_guard = state.ws.read().await;
    let ws = ws_guard.as_ref().ok_or("Not connected to server")?;
    let token = state.auth.lock().unwrap().token.clone();

    let resp = ws.send_request(Action::ListProjects, None, token).await?;

    if !resp.ok {
        return Err(resp.error.unwrap_or_else(|| "Failed to list projects".to_string()));
    }

    let projects: Vec<ProjectData> = serde_json::from_value(
        resp.data.and_then(|d| d.get("projects").cloned()).unwrap_or_default()
    ).map_err(|e| format!("Invalid projects data: {}", e))?;

    Ok(projects)
}

#[tauri::command]
pub async fn get_project(
    state: State<'_, AppState>,
    project_id: String,
) -> Result<ProjectData, String> {
    let ws_guard = state.ws.read().await;
    let ws = ws_guard.as_ref().ok_or("Not connected to server")?;
    let token = state.auth.lock().unwrap().token.clone();

    let data = serde_json::json!({ "id": project_id });
    let resp = ws.send_request(Action::GetProject, Some(data), token).await?;

    if !resp.ok {
        return Err(resp.error.unwrap_or_else(|| "Failed to get project".to_string()));
    }

    let data = resp.data.ok_or("No project data returned")?;
    let project: ProjectData = serde_json::from_value(data)
        .map_err(|e| format!("Invalid project data: {}", e))?;

    Ok(project)
}

#[tauri::command]
pub async fn create_project(
    state: State<'_, AppState>,
    name: String,
    description: String,
    icon: String,
    category: String,
    tags: Vec<String>,
    game_version: String,
) -> Result<ProjectData, String> {
    let ws_guard = state.ws.read().await;
    let ws = ws_guard.as_ref().ok_or("Not connected to server")?;
    let token = state.auth.lock().unwrap().token.clone().ok_or("Not logged in")?;

    let payload = CreateProjectPayload {
        name,
        description,
        icon,
        category,
        tags,
        game_version,
    };
    let data = serde_json::to_value(&payload).ok();
    let resp = ws.send_request(Action::CreateProject, data, Some(token)).await?;

    if !resp.ok {
        return Err(resp.error.unwrap_or_else(|| "Failed to create project".to_string()));
    }

    let data = resp.data.ok_or("No project data returned")?;
    let project: ProjectData = serde_json::from_value(data)
        .map_err(|e| format!("Invalid project data: {}", e))?;

    Ok(project)
}

#[tauri::command]
pub async fn update_project(
    state: State<'_, AppState>,
    id: String,
    name: Option<String>,
    description: Option<String>,
    icon: Option<String>,
    category: Option<String>,
    tags: Option<Vec<String>>,
    game_version: Option<String>,
) -> Result<ProjectData, String> {
    let ws_guard = state.ws.read().await;
    let ws = ws_guard.as_ref().ok_or("Not connected to server")?;
    let token = state.auth.lock().unwrap().token.clone().ok_or("Not logged in")?;

    let payload = UpdateProjectPayload {
        id,
        name,
        description,
        icon,
        category,
        tags,
        game_version,
    };
    let data = serde_json::to_value(&payload).ok();
    let resp = ws.send_request(Action::UpdateProject, data, Some(token)).await?;

    if !resp.ok {
        return Err(resp.error.unwrap_or_else(|| "Failed to update project".to_string()));
    }

    let data = resp.data.ok_or("No project data returned")?;
    let project: ProjectData = serde_json::from_value(data)
        .map_err(|e| format!("Invalid project data: {}", e))?;

    Ok(project)
}

#[tauri::command]
pub async fn delete_project(
    state: State<'_, AppState>,
    project_id: String,
) -> Result<(), String> {
    let ws_guard = state.ws.read().await;
    let ws = ws_guard.as_ref().ok_or("Not connected to server")?;
    let token = state.auth.lock().unwrap().token.clone().ok_or("Not logged in")?;

    let data = serde_json::json!({ "id": project_id });
    let resp = ws.send_request(Action::DeleteProject, Some(data), Some(token)).await?;

    if !resp.ok {
        return Err(resp.error.unwrap_or_else(|| "Failed to delete project".to_string()));
    }

    Ok(())
}

#[tauri::command]
pub async fn list_project_files(
    state: State<'_, AppState>,
    project_id: String,
) -> Result<Vec<String>, String> {
    let ws_guard = state.ws.read().await;
    let ws = ws_guard.as_ref().ok_or("Not connected to server")?;
    let token = state.auth.lock().unwrap().token.clone();

    let data = serde_json::json!({ "project_id": project_id });
    let resp = ws.send_request(Action::ListProjectFiles, Some(data), token).await?;

    if !resp.ok {
        return Err(resp.error.unwrap_or_else(|| "Failed to list files".to_string()));
    }

    let files: Vec<String> = serde_json::from_value(
        resp.data.and_then(|d| d.get("files").cloned()).unwrap_or_default()
    ).map_err(|e| format!("Invalid files data: {}", e))?;

    Ok(files)
}

#[tauri::command]
pub async fn get_project_file(
    state: State<'_, AppState>,
    project_id: String,
    path: String,
) -> Result<String, String> {
    let ws_guard = state.ws.read().await;
    let ws = ws_guard.as_ref().ok_or("Not connected to server")?;
    let token = state.auth.lock().unwrap().token.clone();

    let data = serde_json::json!({ "project_id": project_id, "path": path });
    let resp = ws.send_request(Action::GetProjectFile, Some(data), token).await?;

    if !resp.ok {
        return Err(resp.error.unwrap_or_else(|| "Failed to get file".to_string()));
    }

    let content: String = serde_json::from_value(
        resp.data.and_then(|d| d.get("content").cloned()).unwrap_or_default()
    ).map_err(|e| format!("Invalid file data: {}", e))?;

    Ok(content)
}

#[tauri::command]
pub async fn update_project_file(
    state: State<'_, AppState>,
    project_id: String,
    path: String,
    content: String,
) -> Result<(), String> {
    let ws_guard = state.ws.read().await;
    let ws = ws_guard.as_ref().ok_or("Not connected to server")?;
    let token = state.auth.lock().unwrap().token.clone().ok_or("Not logged in")?;

    let data = serde_json::json!({
        "project_id": project_id,
        "path": path,
        "content": content
    });
    let resp = ws.send_request(Action::UpdateProjectFile, Some(data), Some(token)).await?;

    if !resp.ok {
        return Err(resp.error.unwrap_or_else(|| "Failed to update file".to_string()));
    }

    Ok(())
}
