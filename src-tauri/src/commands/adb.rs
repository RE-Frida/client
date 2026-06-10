use std::process::{Command as StdCommand, Stdio};
use tauri::{Emitter, State};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

use crate::state::{AppState, dbg_log};
use crate::types::DeviceInfo;

#[tauri::command]
pub async fn discover_devices(state: State<'_, AppState>) -> Result<Vec<DeviceInfo>, String> {
    dbg_log!("discover_devices called");
    let output = StdCommand::new(&state.adb_path)
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

    let output = StdCommand::new(&state.adb_path)
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
pub async fn execute_script_console(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
    device_id: String,
    script_code: String,
) -> Result<String, String> {
    dbg_log!("execute_script_console on device {}", device_id);

    // Kill any existing frida process first
    {
        let mut child_guard = state.frida_child.lock().await;
        if let Some(mut child) = child_guard.take() {
            let _ = child.kill().await;
            child.wait().await.ok();
        }
    }
    {
        let mut stdin_guard = state.frida_stdin.lock().await;
        *stdin_guard = None;
    }

    // Write script to temp file
    let tmp_dir = std::env::temp_dir();
    let script_path = tmp_dir.join("re-frida-script.js");
    std::fs::write(&script_path, &script_code)
        .map_err(|e| format!("Failed to write script: {}", e))?;

    let script_str = script_path.to_str().unwrap_or("");

    let mut child = tokio::process::Command::new(&state.frida_path)
        .arg("-q")
        .arg("-D")
        .arg(&device_id)
        .arg("-n")
        .arg("Gadget")
        .arg("-l")
        .arg(script_str)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| {
            let _ = std::fs::remove_file(&script_path);
            if e.to_string().contains("No such file") || e.to_string().contains("not found") {
                "Frida not found.\n\nInstall: pip install frida".to_string()
            } else {
                format!("frida failed: {}", e)
            }
        })?;

    let stdin = child.stdin.take().ok_or("No stdin")?;
    let stdout = child.stdout.take().ok_or("No stdout")?;
    let stderr = child.stderr.take().ok_or("No stderr")?;

    *state.frida_stdin.lock().await = Some(stdin);
    *state.frida_child.lock().await = Some(child);

    // Spawn task to clean up temp file when process exits
    let app_out = app_handle.clone();
    tokio::spawn(async move {
        let mut reader = BufReader::new(stdout).lines();
        while let Some(line) = reader.next_line().await.unwrap_or(None) {
            let _ = app_out.emit("frida-line", serde_json::json!({
                "line": line,
                "source": "stdout"
            }));
        }
    });

    let app_err = app_handle.clone();
    tokio::spawn(async move {
        let mut reader = BufReader::new(stderr).lines();
        while let Some(line) = reader.next_line().await.unwrap_or(None) {
            let _ = app_err.emit("frida-line", serde_json::json!({
                "line": line,
                "source": "stderr"
            }));
        }
    });

    // Clean up temp file after short delay
    let sp = script_path.clone();
    tokio::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_secs(2)).await;
        let _ = std::fs::remove_file(&sp);
    });

    state.add_log(format!("Frida console started on {} with script", device_id));
    Ok("Frida console started".to_string())
}

#[tauri::command]
pub async fn send_frida_input(
    state: State<'_, AppState>,
    input: String,
) -> Result<(), String> {
    let mut stdin_guard = state.frida_stdin.lock().await;
    let stdin = stdin_guard.as_mut().ok_or("No active frida console")?;
    stdin
        .write_all(input.as_bytes())
        .await
        .map_err(|e| format!("Failed to send input: {}", e))?;
    stdin
        .write_all(b"\n")
        .await
        .map_err(|e| format!("Failed to send newline: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn stop_frida_console(
    state: State<'_, AppState>,
) -> Result<String, String> {
    let mut child_guard = state.frida_child.lock().await;
    if let Some(mut child) = child_guard.take() {
        let _ = child.kill().await;
        child.wait().await.ok();
    }
    let mut stdin_guard = state.frida_stdin.lock().await;
    *stdin_guard = None;

    state.add_log("Frida console stopped".to_string());
    Ok("Frida console stopped".to_string())
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

    let script_str = script_path.to_str().unwrap_or("");
    state.add_log(format!("Executing script on {} via USB", device_id));

    let mut child = tokio::process::Command::new(&state.frida_path)
        .arg("-q")
        .arg("-D")
        .arg(&device_id)
        .arg("-n")
        .arg("Gadget")
        .arg("-l")
        .arg(script_str)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| {
            let _ = std::fs::remove_file(&script_path);
            if e.to_string().contains("No such file") || e.to_string().contains("not found") {
                "Frida not found.\n\nInstall: pip install frida".to_string()
            } else {
                format!("frida failed: {}", e)
            }
        })?;

    let stdout = child.stdout.take().ok_or("No stdout")?;
    let stderr = child.stderr.take().ok_or("No stderr")?;

    let stdout_task = tokio::spawn(async move {
        let mut reader = BufReader::new(stdout).lines();
        let mut out = String::new();
        while let Some(line) = reader.next_line().await.unwrap_or(None) {
            out.push_str(&line);
            out.push('\n');
        }
        out
    });

    let stderr_task = tokio::spawn(async move {
        let mut reader = BufReader::new(stderr).lines();
        let mut out = String::new();
        while let Some(line) = reader.next_line().await.unwrap_or(None) {
            out.push_str(&line);
            out.push('\n');
        }
        out
    });

    let (stdout_result, stderr_result) = tokio::join!(stdout_task, stderr_task);
    let stdout_out = stdout_result.unwrap_or_default();
    let stderr_out = stderr_result.unwrap_or_default();

    let status = child.wait().await.map_err(|e| e.to_string())?;

    let _ = std::fs::remove_file(&script_path);

    let mut full_output = stdout_out.clone();
    if !stderr_out.is_empty() {
        if !full_output.is_empty() {
            full_output.push('\n');
        }
        full_output.push_str(&stderr_out);
    }

    if status.success() {
        state.add_log("Script executed successfully".to_string());
    } else {
        state.add_log(format!("Script finished with error: {}", stderr_out));
    }

    Ok(full_output)
}

#[tauri::command]
pub async fn push_gadget(
    state: State<'_, AppState>,
    device_id: String,
    gadget_path: String,
) -> Result<String, String> {
    dbg_log!("push_gadget to {}", device_id);
    let output = StdCommand::new(&state.adb_path)
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
    let output = StdCommand::new(&state.adb_path)
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
    let output = StdCommand::new(&state.adb_path)
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
    let output = StdCommand::new(&state.adb_path)
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
