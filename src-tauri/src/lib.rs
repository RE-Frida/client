mod binary;
mod commands;
mod config;
mod crypto;
mod security;
mod state;
mod types;
mod ws;

use tauri::Manager;

pub use state::AppState;
pub use types::{AppConfig, AuthState, DeviceInfo};

// ─── File Operations ─────────────────────────────────────────────

#[tauri::command]
async fn open_folder(path: String) -> Result<(), String> {
    open::that(&path).map_err(|e| format!("Failed to open folder: {}", e))
}

// ─── Connection Status ──────────────────────────────────────────

#[tauri::command]
async fn is_connected(state: tauri::State<'_, AppState>) -> Result<bool, String> {
    Ok(*state.connected.lock().unwrap())
}

#[tauri::command]
async fn reconnect(state: tauri::State<'_, AppState>) -> Result<(), String> {
    let mut ws_guard = state.ws.write().await;
    *ws_guard = None;
    *state.connected.lock().unwrap() = false;
    *state.client_outdated.lock().unwrap() = None;
    drop(ws_guard);

    let state_clone = state.inner().clone();
    tauri::async_runtime::spawn(async move {
        ws::connect_ws(state_clone).await;
    });

    Ok(())
}

#[tauri::command]
async fn get_client_version_error(state: tauri::State<'_, AppState>) -> Result<Option<String>, String> {
    Ok(state.client_outdated.lock().unwrap().clone())
}

// ─── App Info ───────────────────────────────────────────────────

#[tauri::command]
async fn get_app_version() -> Result<String, String> {
    let config: serde_json::Value = serde_json::from_str(include_str!("../tauri.conf.json"))
        .unwrap_or_default();
    let version = config
        .get("version")
        .and_then(|v| v.as_str())
        .unwrap_or("0.0.0")
        .to_string();
    Ok(version)
}

#[tauri::command]
async fn is_debug_build() -> Result<bool, String> {
    Ok(cfg!(feature = "debug"))
}

// ─── Security Info ──────────────────────────────────────────────

#[tauri::command]
async fn get_security_report() -> Result<String, String> {
    Ok(security::security_report())
}

// ─── Entry Point ────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(feature = "debug")]
    {
        env_logger::init();
        state::dbg_log!("Debug build - verbose logging enabled");
    }

    // ─── Security Checks ────────────────────────────────────────

    // Anti-dump protection
    security::anti_dump();

    // Anti-debug check (warn but don't block in development)
    if security::is_debugger_attached() {
        state::dbg_log!("WARNING: Debugger detected");
        #[cfg(not(feature = "debug"))]
        {
            // In release mode, exit if debugger detected
            // Uncomment to enable:
            // std::process::exit(1);
        }
    }

    // VM detection (informational)
    if security::is_vm() {
        state::dbg_log!("WARNING: Virtual machine detected");
    }

    // Verify self-integrity
    if !security::verify_self_integrity() {
        state::dbg_log!("WARNING: Binary integrity check failed");
    }

    // Opaque predicate (confuse static analysis)
    if security::opaque_true() {
        state::dbg_log!("Security check passed");
    }

    // ─── App Setup ──────────────────────────────────────────────

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
            commands::adb::execute_script_console,
            commands::adb::send_frida_input,
            commands::adb::stop_frida_console,
            commands::adb::push_gadget,
            commands::adb::list_packages,
            commands::adb::launch_app,
            commands::adb::kill_app,
            commands::adb::adb_shell,


            commands::adb::adb_logcat,
            commands::adb::adb_reboot,
            commands::adb::adb_install,
            commands::adb::adb_uninstall,
            commands::adb::adb_list_files,
            commands::adb::adb_connect,
            commands::adb::adb_disconnect,
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
            commands::marketplace::get_tags,
            commands::projects::list_projects,
            commands::projects::get_project,
            commands::projects::create_project,
            commands::projects::update_project,
            commands::projects::delete_project,
            commands::projects::list_project_files,
            commands::projects::get_project_file,
            commands::projects::update_project_file,
            is_connected,
            reconnect,
            get_client_version_error,
            open_folder,
            get_app_version,
            is_debug_build,
            get_security_report,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
