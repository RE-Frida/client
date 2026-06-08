mod binary;
mod commands;
mod config;
mod state;
mod types;
mod ws;

use tauri::Manager;

pub use state::AppState;
pub use types::{AppConfig, AuthState, DeviceInfo};

// ─── Connection Status ──────────────────────────────────────────

#[tauri::command]
async fn is_connected(state: tauri::State<'_, AppState>) -> Result<bool, String> {
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
        state::dbg_log!("Debug build - verbose logging enabled");
    }

    let state = AppState::new();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .manage(state)
        .setup(|app| {
            let state = app.state::<AppState>().inner().clone();
            tauri::async_runtime::spawn(async move {
                ws::connect_ws(state).await;
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::adb::discover_devices,
            commands::adb::start_session,
            commands::adb::stop_session,
            commands::adb::execute_script,
            commands::adb::push_gadget,
            commands::adb::list_packages,
            commands::adb::launch_app,
            commands::adb::kill_app,
            commands::logs::get_logs,
            commands::logs::clear_logs,
            commands::config::get_config,
            commands::config::save_config,
            commands::auth::get_auth_state,
            commands::auth::start_login,
            commands::auth::logout,
            commands::marketplace::list_scripts,
            commands::marketplace::vote_script,
            commands::marketplace::download_script,
            is_connected,
            get_app_version,
            is_debug_build,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
