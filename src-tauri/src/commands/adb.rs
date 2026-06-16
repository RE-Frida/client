use std::process::{Command as StdCommand, Stdio};
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use tauri::{Emitter, State};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

use crate::state::{AppState, dbg_log};
use crate::types::DeviceInfo;

fn adb_cmd(adb_path: &str) -> StdCommand {
    let cmd = StdCommand::new(adb_path);
    #[cfg(windows)]
    let cmd = {
        let mut c = cmd;
        c.creation_flags(0x08000000);
        c
    };
    cmd
}

fn adb_cmd_device(adb_path: &str, device_id: &str) -> StdCommand {
    let mut cmd = StdCommand::new(adb_path);
    #[cfg(windows)]
    cmd.creation_flags(0x08000000);
    cmd.arg("-s").arg(device_id);
    cmd
}

#[tauri::command]
pub async fn discover_devices(state: State<'_, AppState>) -> Result<Vec<DeviceInfo>, String> {
    dbg_log!("discover_devices called");
    let output = adb_cmd(&state.adb_path)
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

    let output = adb_cmd_device(&state.adb_path, &device_id)
        .arg("forward")
        .arg(format!("tcp:{}", port))
        .arg(format!("tcp:{}", port))
        .output()
        .map_err(|e| format!("Port forward failed: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Port forward error: {}", stderr));
    }

    Ok(format!("Connected to {} on port {}", device_id, port))
}

#[tauri::command]
pub async fn stop_session(_state: State<'_, AppState>) -> Result<String, String> {
    Ok("Session stopped".to_string())
}

#[tauri::command]
pub async fn execute_script_console(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
    device_id: String,
    script_path: String,
) -> Result<String, String> {
    // Kill any existing frida process first
    if let Some(pid) = state.frida_pid.lock().unwrap().take() {
        let _ = StdCommand::new("kill").arg("-9").arg(pid.to_string()).output();
    }
    {
        let mut child_guard = state.frida_child.lock().await;
        if let Some(mut child) = child_guard.take() {
            let _ = child.kill().await;
            child.wait().await.ok();
        }
    }
    *state.frida_stdin.lock().await = None;

    let gadget_name = state.config.lock().unwrap().settings.gadget_name.clone();

    let mut child = tokio::process::Command::new(&state.frida_path)
        .env("PYTHONUNBUFFERED", "1")
        .env("TERM", "dumb")
        .arg("-D")
        .arg(&device_id)
        .arg("-n")
        .arg(&gadget_name)
        .arg("-l")
        .arg(&script_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| {
            if e.to_string().contains("No such file") || e.to_string().contains("not found") {
                "Frida not found.\n\nInstall: pip install frida".to_string()
            } else {
                format!("frida failed: {}", e)
            }
        })?;

    let pid = child.id();
    let stdin = child.stdin.take().ok_or("No stdin")?;
    let stdout = child.stdout.take().ok_or("No stdout")?;
    let stderr = child.stderr.take().ok_or("No stderr")?;

    *state.frida_pid.lock().unwrap() = pid;
    *state.frida_stdin.lock().await = Some(stdin);
    *state.frida_child.lock().await = Some(child);

    // Stream stdout
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

    // Stream stderr
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

    // Monitor process exit
    let child_monitor = state.frida_child.clone();
    let stdin_monitor = state.frida_stdin.clone();
    let pid_monitor = state.frida_pid.clone();
    let app_done = app_handle.clone();
    tokio::spawn(async move {
        let child = {
            let mut guard = child_monitor.lock().await;
            guard.take()
        };
        if let Some(mut child) = child {
            let status = child.wait().await;
            *pid_monitor.lock().unwrap() = None;
            *stdin_monitor.lock().await = None;
            let _ = app_done.emit("frida-done", serde_json::json!({
                "success": status.map(|s| s.success()).unwrap_or(false),
            }));
        }
    });

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
    if let Some(pid) = state.frida_pid.lock().unwrap().take() {
        let _ = StdCommand::new("kill").arg("-9").arg(pid.to_string()).output();
    }
    let mut child_guard = state.frida_child.lock().await;
    if let Some(mut child) = child_guard.take() {
        let _ = child.kill().await;
        child.wait().await.ok();
    }
    let mut stdin_guard = state.frida_stdin.lock().await;
    *stdin_guard = None;

    Ok("Frida console stopped".to_string())
}

#[tauri::command]
pub async fn execute_script(
    state: State<'_, AppState>,
    device_id: String,
    script_code: String,
) -> Result<String, String> {
    let tmp_dir = std::env::temp_dir();
    let script_path = tmp_dir.join("re-frida-script.js");
    std::fs::write(&script_path, &script_code)
        .map_err(|e| format!("Failed to write script: {}", e))?;

    let script_str = script_path.to_str().unwrap_or("");

    let gadget_name = state.config.lock().unwrap().settings.gadget_name.clone();

    let mut child = tokio::process::Command::new(&state.frida_path)
        .arg("-q")
        .arg("-D")
        .arg(&device_id)
        .arg("-n")
        .arg(&gadget_name)
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

    let _status = child.wait().await.map_err(|e| e.to_string())?;

    let _ = std::fs::remove_file(&script_path);

    let mut full_output = stdout_out.clone();
    if !stderr_out.is_empty() {
        if !full_output.is_empty() {
            full_output.push('\n');
        }
        full_output.push_str(&stderr_out);
    }

    Ok(full_output)
}

#[tauri::command]
pub async fn push_gadget(
    state: State<'_, AppState>,
    device_id: String,
    gadget_path: String,
) -> Result<String, String> {
    let output = adb_cmd_device(&state.adb_path, &device_id)
        .arg("push")
        .arg(&gadget_path)
        .arg("/data/local/tmp/libfrida-gadget.so")
        .output()
        .map_err(|e| format!("Push failed: {}", e))?;

    if output.status.success() {
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
    let output = adb_cmd_device(&state.adb_path, &device_id)
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
    let output = adb_cmd_device(&state.adb_path, &device_id)
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
    let output = adb_cmd_device(&state.adb_path, &device_id)
        .arg("shell")
        .arg("am")
        .arg("force-stop")
        .arg(&package_id)
        .output()
        .map_err(|e| format!("Failed to kill: {}", e))?;

    if output.status.success() {
        Ok(format!("Killed {}", package_id))
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("Kill error: {}", stderr))
    }
}

#[tauri::command]
pub async fn adb_shell(
    state: State<'_, AppState>,
    device_id: String,
    command: String,
) -> Result<String, String> {
    let output = adb_cmd_device(&state.adb_path, &device_id)
        .arg("shell")
        .arg(&command)
        .output()
        .map_err(|e| format!("ADB shell failed: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let mut result = stdout;
    if !stderr.is_empty() {
        if !result.is_empty() { result.push('\n'); }
        result.push_str(&stderr);
    }
    Ok(result)
}


#[tauri::command]
pub async fn adb_logcat(
    state: State<'_, AppState>,
    device_id: String,
    filter: String,
    lines: u32,
) -> Result<String, String> {
    let mut cmd = adb_cmd_device(&state.adb_path, &device_id);
    cmd.arg("logcat");
    if !filter.is_empty() {
        cmd.arg("-s").arg(&filter);
    }
    if lines > 0 {
        cmd.arg("-t").arg(lines.to_string());
    }
    let output = cmd.output().map_err(|e| format!("logcat failed: {}", e))?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    Ok(stdout)
}

#[tauri::command]
pub async fn adb_reboot(
    state: State<'_, AppState>,
    device_id: String,
    mode: String,
) -> Result<String, String> {
    let mut cmd = adb_cmd_device(&state.adb_path, &device_id);
    match mode.as_str() {
        "recovery" => { cmd.arg("reboot").arg("recovery"); }
        "bootloader" => { cmd.arg("reboot").arg("bootloader"); }
        "soft" => { cmd.arg("reboot"); }
        _ => { cmd.arg("reboot"); }
    }
    let output = cmd.output().map_err(|e| format!("reboot failed: {}", e))?;
    if output.status.success() {
        Ok(format!("Rebooting to {}...", mode))
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[tauri::command]
pub async fn adb_install(
    state: State<'_, AppState>,
    device_id: String,
    apk_path: String,
) -> Result<String, String> {
    let output = adb_cmd_device(&state.adb_path, &device_id)
        .arg("install")
        .arg("-r")
        .arg(&apk_path)
        .output()
        .map_err(|e| format!("install failed: {}", e))?;

    if output.status.success() {
        Ok("Installed successfully".to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[tauri::command]
pub async fn adb_uninstall(
    state: State<'_, AppState>,
    device_id: String,
    package_id: String,
) -> Result<String, String> {
    let output = adb_cmd_device(&state.adb_path, &device_id)
        .arg("uninstall")
        .arg(&package_id)
        .output()
        .map_err(|e| format!("uninstall failed: {}", e))?;

    if output.status.success() {
        Ok("Uninstalled successfully".to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[tauri::command]
pub async fn adb_list_files(
    state: State<'_, AppState>,
    device_id: String,
    path: String,
) -> Result<String, String> {
    let output = adb_cmd_device(&state.adb_path, &device_id)
        .arg("shell")
        .arg("ls")
        .arg("-la")
        .arg(&path)
        .output()
        .map_err(|e| format!("list files failed: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let mut result = stdout;
    if !stderr.is_empty() {
        if !result.is_empty() { result.push('\n'); }
        result.push_str(&stderr);
    }
    Ok(result)
}

#[tauri::command]
pub async fn adb_connect(
    state: State<'_, AppState>,
    address: String,
) -> Result<String, String> {
    let output = adb_cmd(&state.adb_path)
        .arg("connect")
        .arg(&address)
        .output()
        .map_err(|e| format!("adb connect failed: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let mut result = stdout;
    if !stderr.is_empty() {
        if !result.is_empty() { result.push('\n'); }
        result.push_str(&stderr);
    }
    state.add_log(format!("ADB connect {}: {}", address, result.trim()));
    Ok(result)
}

#[tauri::command]
pub async fn adb_disconnect(
    state: State<'_, AppState>,
    address: String,
) -> Result<String, String> {
    let output = adb_cmd(&state.adb_path)
        .arg("disconnect")
        .arg(&address)
        .output()
        .map_err(|e| format!("adb disconnect failed: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let mut result = stdout;
    if !stderr.is_empty() {
        if !result.is_empty() { result.push('\n'); }
        result.push_str(&stderr);
    }
    state.add_log(format!("ADB disconnect {}: {}", address, result.trim()));
    Ok(result)
}
