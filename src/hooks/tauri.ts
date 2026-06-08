import { invoke } from "@tauri-apps/api/core";
import type { DeviceInfo, AppConfig, AuthState } from "@/types";

// ─── ADB ────────────────────────────────────────────────────────

export async function discoverDevices(): Promise<DeviceInfo[]> {
  return invoke("discover_devices");
}

export async function startSession(deviceId: string): Promise<string> {
  return invoke("start_session", { deviceId });
}

export async function stopSession(): Promise<string> {
  return invoke("stop_session");
}

export async function executeScript(
  deviceId: string,
  scriptCode: string
): Promise<string> {
  return invoke("execute_script", { deviceId, scriptCode });
}

export async function pushGadget(
  deviceId: string,
  gadgetPath: string
): Promise<string> {
  return invoke("push_gadget", { deviceId, gadgetPath });
}

export async function listPackages(deviceId: string): Promise<string[]> {
  return invoke("list_packages", { deviceId });
}

// ─── Logs ────────────────────────────────────────────────────────

export async function getLogs(): Promise<string> {
  return invoke("get_logs");
}

export async function clearLogs(): Promise<void> {
  return invoke("clear_logs");
}

// ─── Config ──────────────────────────────────────────────────────

export async function getConfig(): Promise<AppConfig> {
  return invoke("get_config");
}

export async function saveConfig(config: AppConfig): Promise<void> {
  return invoke("save_config", { config });
}

// ─── Auth ────────────────────────────────────────────────────────

export async function getAuthState(): Promise<AuthState> {
  return invoke("get_auth_state");
}

export async function logout(): Promise<void> {
  return invoke("logout");
}

// ─── App ─────────────────────────────────────────────────────────

export async function getAppVersion(): Promise<string> {
  return invoke("get_app_version");
}
