use tauri::State;

use crate::config::save_config_to_disk;
use crate::state::AppState;
use crate::types::AppConfig;

#[tauri::command]
pub async fn get_config(state: State<'_, AppState>) -> Result<AppConfig, String> {
    Ok(state.config.lock().unwrap().clone())
}

#[tauri::command]
pub async fn save_config(state: State<'_, AppState>, config: AppConfig) -> Result<(), String> {
    save_config_to_disk(&config);
    *state.config.lock().unwrap() = config;
    Ok(())
}
