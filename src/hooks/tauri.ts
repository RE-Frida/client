import { invoke } from "@tauri-apps/api/core";
import type { DeviceInfo, AppConfig, AuthState, ScriptData } from "@/types";

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
  scriptCode: string,
  useGadget: boolean = false
): Promise<string> {
  return invoke("execute_script", { deviceId, scriptCode, useGadget });
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

export async function startLogin(): Promise<string> {
  return invoke("start_login");
}

export async function logout(): Promise<void> {
  return invoke("logout");
}

// ─── Marketplace ─────────────────────────────────────────────────

export async function listScripts(
  search?: string,
  category?: string,
  sort?: string
): Promise<ScriptData[]> {
  return invoke("list_scripts", { search, category, sort });
}

export async function voteScript(
  scriptId: string,
  upvote: boolean
): Promise<void> {
  return invoke("vote_script", { scriptId, upvote });
}

export async function downloadScript(scriptId: string): Promise<void> {
  return invoke("download_script", { scriptId });
}

// ─── Connection ──────────────────────────────────────────────────

export async function isConnected(): Promise<boolean> {
  return invoke("is_connected");
}

// ─── App ─────────────────────────────────────────────────────────

export async function getAppVersion(): Promise<string> {
  return invoke("get_app_version");
}

export async function isDebugBuild(): Promise<boolean> {
  return invoke("is_debug_build");
}
