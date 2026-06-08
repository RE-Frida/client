use tauri::State;

use crate::state::AppState;

#[tauri::command]
pub async fn get_logs(state: State<'_, AppState>) -> Result<String, String> {
    let logs = state.log_buffer.lock().unwrap();
    Ok(logs.join("\n"))
}

#[tauri::command]
pub async fn clear_logs(state: State<'_, AppState>) -> Result<(), String> {
    state.log_buffer.lock().unwrap().clear();
    Ok(())
}
