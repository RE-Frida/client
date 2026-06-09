import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { readDir, readTextFile, writeTextFile, exists, mkdir } from "@tauri-apps/plugin-fs";
import { join, homeDir } from "@tauri-apps/api/path";
import type { DeviceInfo, AppConfig, AuthState, ScriptData, ProjectData } from "@/types";

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

export async function launchApp(
  deviceId: string,
  packageId: string
): Promise<string> {
  return invoke("launch_app", { deviceId, packageId });
}

export async function killApp(
  deviceId: string,
  packageId: string
): Promise<string> {
  return invoke("kill_app", { deviceId, packageId });
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

// ─── Workspace ───────────────────────────────────────────────────

export interface WorkspaceFile {
  name: string;
  path: string;
  isDir: boolean;
  content?: string;
}

export interface WorkspaceConfig {
  default_file: string;
  name?: string;
}

export async function selectFolder(): Promise<string | null> {
  return await open({ directory: true });
}

export async function readWorkspaceFiles(dirPath: string): Promise<WorkspaceFile[]> {
  const files: WorkspaceFile[] = [];
  
  async function scan(currentPath: string, relativePath: string) {
    const entries = await readDir(currentPath);
    for (const entry of entries) {
      const fullPath = await join(currentPath, entry.name);
      const relPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
      
      // Skip .re-frida directory
      if (entry.name === ".re-frida") continue;
      
      if (entry.isDirectory) {
        files.push({ name: entry.name, path: relPath, isDir: true });
        await scan(fullPath, relPath);
      } else {
        files.push({ name: entry.name, path: relPath, isDir: false });
      }
    }
  }
  
  await scan(dirPath, "");
  return files;
}

export async function readFileContent(dirPath: string, filePath: string): Promise<string> {
  const fullPath = await join(dirPath, filePath);
  return await readTextFile(fullPath);
}

export async function writeFileContent(dirPath: string, filePath: string, content: string): Promise<void> {
  const fullPath = await join(dirPath, filePath);
  await writeTextFile(fullPath, content);
}

export async function loadWorkspaceConfig(dirPath: string): Promise<WorkspaceConfig> {
  const configPath = await join(dirPath, ".re-frida", "config.json");
  const configExists = await exists(configPath);
  
  if (!configExists) {
    return { default_file: "main.js" };
  }
  
  const content = await readTextFile(configPath);
  return JSON.parse(content);
}

export async function saveWorkspaceConfig(dirPath: string, config: WorkspaceConfig): Promise<void> {
  const configDir = await join(dirPath, ".re-frida");
  const dirExists = await exists(configDir);
  if (!dirExists) {
    await mkdir(configDir, { recursive: true });
  }
  
  const configPath = await join(configDir, "config.json");
  await writeTextFile(configPath, JSON.stringify(config, null, 2));
}

export async function downloadProject(projectId: string): Promise<string> {
  const home = await homeDir();
  const downloadPath = await join(home, "Documents", "RE-Frida", projectId);
  
  await mkdir(downloadPath, { recursive: true });

  const files = await listProjectFiles(projectId);
  for (const file of files) {
    const content = await getProjectFile(projectId, file);
    const filePath = await join(downloadPath, file);
    const parent = filePath.substring(0, filePath.lastIndexOf("/"));
    const parentExists = await exists(parent);
    if (!parentExists) {
      await mkdir(parent, { recursive: true });
    }
    await writeTextFile(filePath, content);
  }

  return downloadPath;
}

export async function isProjectInstalled(projectId: string): Promise<boolean> {
  const home = await homeDir();
  const projectPath = await join(home, "Documents", "RE-Frida", projectId);
  return await exists(projectPath);
}

export async function getInstalledProjectIds(): Promise<string[]> {
  const home = await homeDir();
  const basePath = await join(home, "Documents", "RE-Frida");
  const baseExists = await exists(basePath);
  if (!baseExists) return [];

  const entries = await readDir(basePath);
  const ids: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory) {
      ids.push(entry.name);
    }
  }
  return ids;
}

export async function publishProject(
  projectId: string,
  workspacePath: string
): Promise<void> {
  const files = await readWorkspaceFiles(workspacePath);
  for (const file of files) {
    if (!file.isDir) {
      const content = await readFileContent(workspacePath, file.path);
      await updateProjectFile(projectId, file.path, content);
    }
  }
}

export async function getProjectDiff(
  projectId: string,
  workspacePath: string
): Promise<{ serverOnly: string[]; localOnly: string[]; different: string[]; same: string[] }> {
  const serverFiles = await listProjectFiles(projectId);
  const localFiles = (await readWorkspaceFiles(workspacePath))
    .filter((f) => !f.isDir)
    .map((f) => f.path);

  const serverSet = new Set(serverFiles);
  const localSet = new Set(localFiles);

  const serverOnly = serverFiles.filter((f) => !localSet.has(f));
  const localOnly = localFiles.filter((f) => !serverSet.has(f));
  const common = serverFiles.filter((f) => localSet.has(f));

  const different: string[] = [];
  const same: string[] = [];

  for (const file of common) {
    const localContent = await readFileContent(workspacePath, file);
    const serverContent = await getProjectFile(projectId, file);
    if (localContent === serverContent) {
      same.push(file);
    } else {
      different.push(file);
    }
  }

  return { serverOnly, localOnly, different, same };
}

export async function updateProjectFromServer(
  projectId: string,
  workspacePath: string
): Promise<void> {
  const serverFiles = await listProjectFiles(projectId);
  for (const file of serverFiles) {
    const content = await getProjectFile(projectId, file);
    const filePath = await join(workspacePath, file);
    const parent = filePath.substring(0, filePath.lastIndexOf("/"));
    const parentExists = await exists(parent);
    if (!parentExists) {
      await mkdir(parent, { recursive: true });
    }
    await writeTextFile(filePath, content);
  }
}

export async function getProjectInstallPath(projectId: string): Promise<string> {
  const home = await homeDir();
  return await join(home, "Documents", "RE-Frida", projectId);
}

// ─── Project API ─────────────────────────────────────────────────

export async function listProjects(): Promise<ProjectData[]> {
  return invoke("list_projects");
}

export async function getProject(projectId: string): Promise<ProjectData> {
  return invoke("get_project", { projectId });
}

export async function createProject(
  name: string,
  description: string,
  icon: string,
  category: string,
  tags: string[]
): Promise<ProjectData> {
  return invoke("create_project", { name, description, icon, category, tags });
}

export async function updateProject(
  id: string,
  name?: string,
  description?: string,
  icon?: string,
  category?: string,
  tags?: string[]
): Promise<ProjectData> {
  return invoke("update_project", { id, name, description, icon, category, tags });
}

export async function deleteProject(projectId: string): Promise<void> {
  return invoke("delete_project", { projectId });
}

export async function listProjectFiles(projectId: string): Promise<string[]> {
  return invoke("list_project_files", { projectId });
}

export async function getProjectFile(projectId: string, path: string): Promise<string> {
  return invoke("get_project_file", { projectId, path });
}

export async function updateProjectFile(
  projectId: string,
  path: string,
  content: string
): Promise<void> {
  return invoke("update_project_file", { projectId, path, content });
}
