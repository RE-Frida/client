use std::process::Command;
use tauri::State;

use crate::state::{AppState, dbg_log};
use crate::types::DeviceInfo;
use crate::config::DEFAULT_FRIDA_INSTALL;

#[tauri::command]
pub async fn discover_devices(state: State<'_, AppState>) -> Result<Vec<DeviceInfo>, String> {
    dbg_log!("discover_devices called");
    let output = Command::new(&state.adb_path)
        .arg("devices")
        .arg("-l")
        .output()
        .map_err(|e| format!("Failed to execute adb: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("ADB error: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let re = regex::Regex::new(r"^(\S+)\s+(\w+)\s+(.*)$").unwrap();
    let mut devices = Vec::new();

    for line in stdout.lines().skip(1) {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        if let Some(caps) = re.captures(line) {
            let device_id = caps[1].to_string();
            let status = caps[2].to_string();
            let details = caps[3].to_string();
            let model = details
                .split_whitespace()
                .find(|s| s.starts_with("model:"))
                .and_then(|s| s.strip_prefix("model:"))
                .map(|s| s.to_string());
            devices.push(DeviceInfo {
                id: device_id,
                model,
                status,
            });
        }
    }

    state.add_log(format!("Discovered {} device(s)", devices.len()));
    dbg_log!("Found {} devices", devices.len());
    Ok(devices)
}

#[tauri::command]
pub async fn start_session(state: State<'_, AppState>, device_id: String) -> Result<String, String> {
    let port = state.config.lock().unwrap().settings.frida_port;
    dbg_log!("start_session on device {} port {}", device_id, port);

    let output = Command::new(&state.adb_path)
        .arg("-s")
        .arg(&device_id)
        .arg("forward")
        .arg(format!("tcp:{}", port))
        .arg(format!("tcp:{}", port))
        .output()
        .map_err(|e| format!("Port forward failed: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Port forward error: {}", stderr));
    }

    state.add_log(format!("Session started on {} (port {})", device_id, port));
    Ok(format!("Connected to {} on port {}", device_id, port))
}

#[tauri::command]
pub async fn stop_session(state: State<'_, AppState>) -> Result<String, String> {
    dbg_log!("stop_session");
    state.add_log("Session stopped".to_string());
    Ok("Session stopped".to_string())
}

#[tauri::command]
pub async fn execute_script(
    state: State<'_, AppState>,
    device_id: String,
    script_code: String,
) -> Result<String, String> {
    dbg_log!("execute_script on device {}", device_id);

    let tmp_dir = std::env::temp_dir();
    let script_path = tmp_dir.join("re-frida-script.js");
    std::fs::write(&script_path, &script_code)
        .map_err(|e| format!("Failed to write script: {}", e))?;

    state.add_log(format!("Executing script on {}", device_id));

    let port = state.config.lock().unwrap().settings.frida_port;
    let result = Command::new(&state.frida_path)
        .arg("-H")
        .arg(format!("127.0.0.1:{}", port))
        .arg("-n")
        .arg("Gadget")
        .arg("-l")
        .arg(script_path.to_str().unwrap_or(""))
        .output();

    let _ = std::fs::remove_file(&script_path);

    match result {
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout).to_string();
            let stderr = String::from_utf8_lossy(&out.stderr).to_string();
            dbg_log!("frida stdout: {}", stdout);
            dbg_log!("frida stderr: {}", stderr);
            if out.status.success() {
                state.add_log("Script executed successfully".to_string());
                Ok(if stdout.is_empty() { stderr } else { stdout })
            } else {
                let error_msg = if stderr.contains("No such file") || stderr.contains("not found") {
                    format!("Frida not found. {}\n\n{}", DEFAULT_FRIDA_INSTALL, stderr)
                } else {
                    stderr
                };
                state.add_log(format!("Script error: {}", error_msg));
                Err(error_msg)
            }
        }
        Err(e) => {
            let error_msg = if e.to_string().contains("No such file") || e.to_string().contains("not found") {
                format!("Frida not found. {}\n\n({})", DEFAULT_FRIDA_INSTALL, e)
            } else {
                format!("frida failed: {}", e)
            };
            state.add_log(error_msg.clone());
            Err(error_msg)
        }
    }
}

#[tauri::command]
pub async fn push_gadget(
    state: State<'_, AppState>,
    device_id: String,
    gadget_path: String,
) -> Result<String, String> {
    dbg_log!("push_gadget to {}", device_id);
    let output = Command::new(&state.adb_path)
        .arg("-s")
        .arg(&device_id)
        .arg("push")
        .arg(&gadget_path)
        .arg("/data/local/tmp/libfrida-gadget.so")
        .output()
        .map_err(|e| format!("Push failed: {}", e))?;

    if output.status.success() {
        state.add_log(format!("Gadget pushed to {}", device_id));
        Ok("Gadget pushed successfully".to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("Push error: {}", stderr))
    }
}

#[tauri::command]
pub async fn list_packages(
    state: State<'_, AppState>,
    device_id: String,
) -> Result<Vec<String>, String> {
    dbg_log!("list_packages for {}", device_id);
    let output = Command::new(&state.adb_path)
        .arg("-s")
        .arg(&device_id)
        .arg("shell")
        .arg("pm")
        .arg("list")
        .arg("packages")
        .arg("-3")
        .output()
        .map_err(|e| format!("Failed to list packages: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let packages: Vec<String> = stdout
        .lines()
        .filter_map(|line| {
            line.strip_prefix("package:")
                .map(|s| s.trim().to_string())
        })
        .collect();

    Ok(packages)
}

#[tauri::command]
pub async fn launch_app(
    state: State<'_, AppState>,
    device_id: String,
    package_id: String,
) -> Result<String, String> {
    dbg_log!("launch_app {} on {}", package_id, device_id);
    let output = Command::new(&state.adb_path)
        .arg("-s")
        .arg(&device_id)
        .arg("shell")
        .arg("monkey")
        .arg("-p")
        .arg(&package_id)
        .arg("-c")
        .arg("android.intent.category.LAUNCHER")
        .arg("1")
        .output()
        .map_err(|e| format!("Failed to launch: {}", e))?;

    if output.status.success() {
        state.add_log(format!("Launched {}", package_id));
        Ok(format!("Launched {}", package_id))
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("Launch error: {}", stderr))
    }
}

#[tauri::command]
pub async fn kill_app(
    state: State<'_, AppState>,
    device_id: String,
    package_id: String,
) -> Result<String, String> {
    dbg_log!("kill_app {} on {}", package_id, device_id);
    let output = Command::new(&state.adb_path)
        .arg("-s")
        .arg(&device_id)
        .arg("shell")
        .arg("am")
        .arg("force-stop")
        .arg(&package_id)
        .output()
        .map_err(|e| format!("Failed to kill: {}", e))?;

    if output.status.success() {
        state.add_log(format!("Killed {}", package_id));
        Ok(format!("Killed {}", package_id))
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("Kill error: {}", stderr))
    }
}
