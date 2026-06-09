import { useState, useEffect } from "react";
import {
  Play, Square, Send, Smartphone, Package, RefreshCw, ChevronDown,
  FileCode2, FolderOpen, FolderTree, Save, Plus, FolderInput, Settings,
  Upload, Download, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ScriptEditor } from "@/components/ui/script-editor";
import {
  getConfig, discoverDevices, startSession, executeScript, launchApp, killApp,
  selectFolder, readWorkspaceFiles, readFileContent, writeFileContent,
  loadWorkspaceConfig, saveWorkspaceConfig,
  getProject, publishProject, getProjectDiff, updateProjectFromServer,
  getAuthState, getProjectInstallPath,
  type WorkspaceFile, type WorkspaceConfig,
} from "@/hooks/tauri";
import type { AppConfig, DeviceInfo, ProjectData } from "@/types";

interface EditorPageProps {
  selectedDevice: string | null;
  onDeviceChange: (id: string | null) => void;
  projectId?: string | null;
  onProjectChange?: (id: string | null) => void;
}

export function EditorPage({ selectedDevice, onDeviceChange, projectId, onProjectChange }: EditorPageProps) {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [workspacePath, setWorkspacePath] = useState<string | null>(null);
  const [workspaceConfig, setWorkspaceConfig] = useState<WorkspaceConfig>({ default_file: "main.js" });
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<WorkspaceFile | null>(null);
  const [code, setCode] = useState("");
  const [output, setOutput] = useState("");
  const [running, setRunning] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [projectInfo, setProjectInfo] = useState<ProjectData | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [diff, setDiff] = useState<{ serverOnly: string[]; localOnly: string[]; different: string[]; same: string[] } | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [checkingDiff, setCheckingDiff] = useState(false);

  useEffect(() => {
    getConfig().then(setConfig).catch(() => {});
    refreshDevices();
  }, []);

  // Load project if projectId is provided
  useEffect(() => {
    if (projectId) {
      loadProject(projectId);
    }
  }, [projectId]);

  const loadProject = async (pid: string) => {
    try {
      const path = await getProjectInstallPath(pid);
      setWorkspacePath(path);
      await loadFiles(path);
      const wsConfig = await loadWorkspaceConfig(path);
      setWorkspaceConfig(wsConfig);

      const proj = await getProject(pid);
      setProjectInfo(proj);

      const auth = await getAuthState();
      setIsOwner(auth.authenticated && auth.username === proj.author);

      checkDiff(pid, path);
    } catch (e) {
      console.error("Failed to load project:", e);
    }
  };

  const checkDiff = async (pid: string, path: string) => {
    setCheckingDiff(true);
    try {
      const d = await getProjectDiff(pid, path);
      setDiff(d);
    } catch (e) {
      console.error("Failed to check diff:", e);
      setDiff(null);
    } finally {
      setCheckingDiff(false);
    }
  };

  const refreshDiff = () => {
    if (projectId && workspacePath) {
      checkDiff(projectId, workspacePath);
    }
  };

  const handlePublish = async () => {
    if (!projectId || !workspacePath) return;
    setPublishing(true);
    try {
      await publishProject(projectId, workspacePath);
      setOutput("Project published to server");
      refreshDiff();
    } catch (e) {
      setOutput("Error publishing: " + e);
    } finally {
      setPublishing(false);
    }
  };

  const handleUpdate = async () => {
    if (!projectId || !workspacePath) return;
    setUpdating(true);
    try {
      await updateProjectFromServer(projectId, workspacePath);
      setOutput("Project synced from server");
      await loadFiles(workspacePath);
      refreshDiff();
    } catch (e) {
      setOutput("Error updating: " + e);
    } finally {
      setUpdating(false);
    }
  };

  const refreshDevices = async () => {
    setRefreshing(true);
    try {
      const devs = await discoverDevices();
      setDevices(devs);
      if (devs.length > 0 && !selectedDevice) {
        onDeviceChange(devs[0].id);
      }
    } catch (e) {
      console.error("Device discovery failed:", e);
    } finally {
      setRefreshing(false);
    }
  };

  const pkg = config?.custom_package || "com.target.app";

  const openWorkspace = async () => {
    const folder = await selectFolder();
    if (folder) {
      setWorkspacePath(folder);
      // Clear project context when opening a local folder
      if (onProjectChange) onProjectChange(null);
      setProjectInfo(null);
      setIsOwner(false);
      setDiff(null);
      await loadFiles(folder);
      const wsConfig = await loadWorkspaceConfig(folder);
      setWorkspaceConfig(wsConfig);
    }
  };

  const loadFiles = async (path: string) => {
    try {
      const fileList = await readWorkspaceFiles(path);
      setFiles(fileList);
    } catch (e) {
      console.error("Failed to load files:", e);
    }
  };

  const refreshFiles = async () => {
    if (workspacePath) {
      await loadFiles(workspacePath);
    }
  };

  const needsUpdate = diff && (diff.serverOnly.length > 0 || diff.different.length > 0);

  const selectFile = async (file: WorkspaceFile) => {
    if (file.isDir || !workspacePath) return;
    setSelectedFile(file);
    try {
      const content = await readFileContent(workspacePath, file.path);
      setCode(content);
    } catch (e) {
      console.error("Failed to read file:", e);
      setCode("");
    }
  };

  const saveFile = async () => {
    if (!selectedFile || !workspacePath) return;
    try {
      await writeFileContent(workspacePath, selectedFile.path, code);
      setOutput("Saved " + selectedFile.name);
    } catch (e) {
      setOutput("Error saving: " + e);
    }
  };

  const addFile = async () => {
    if (!newFileName || !workspacePath) return;
    const name = newFileName.endsWith(".js") ? newFileName : newFileName + ".js";
    try {
      await writeFileContent(workspacePath, name, "// New script\n");
      setNewFileName("");
      await refreshFiles();
    } catch (e) {
      console.error("Failed to create file:", e);
    }
  };

  const handleStart = async () => {
    if (!selectedDevice) return;
    try {
      await startSession(selectedDevice);
      const result = await launchApp(selectedDevice, pkg);
      setOutput(result);
    } catch (e) {
      setOutput("Error: " + e);
    }
  };

  const handleStop = async () => {
    if (!selectedDevice) return;
    try {
      const result = await killApp(selectedDevice, pkg);
      setOutput(result);
    } catch (e) {
      setOutput("Error: " + e);
    }
  };

  const handleExecute = async () => {
    if (!selectedDevice) return;
    setRunning(true);
    try {
      let codeToRun = code;
      if (!selectedFile && workspacePath) {
        const defaultPath = workspaceConfig.default_file || "main.js";
        codeToRun = await readFileContent(workspacePath, defaultPath);
      }
      const result = await executeScript(selectedDevice, codeToRun);
      setOutput(result);
    } catch (e) {
      setOutput("Error: " + e);
    } finally {
      setRunning(false);
    }
  };

  const saveWorkspaceSettings = async () => {
    if (!workspacePath) return;
    try {
      await saveWorkspaceConfig(workspacePath, workspaceConfig);
      setOutput("Workspace settings saved");
      setShowSettings(false);
    } catch (e) {
      setOutput("Error saving settings: " + e);
    }
  };

  const renderTree = (items: WorkspaceFile[], depth = 0) => {
    return items.map((item) => (
      <div key={item.path} style={{ paddingLeft: depth * 16 }}>
        <button
          onClick={() => selectFile(item)}
          className={
            "flex w-full items-center gap-2 rounded px-2 py-1 text-xs transition-colors " +
            (selectedFile?.path === item.path
              ? "bg-accent text-accent-foreground"
              : "hover:bg-accent/50")
          }
        >
          {item.isDir ? (
            <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <FileCode2 className="h-3.5 w-3.5 text-primary" />
          )}
          <span className="truncate">{item.name}</span>
        </button>
      </div>
    ));
  };

  return (
    <div className="flex h-full flex-col">
      {/* Top Toolbar */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-3">
          <div className="relative">
            <select
              value={selectedDevice || ""}
              onChange={(e) => onDeviceChange(e.target.value || null)}
              className="appearance-none rounded-md border border-border bg-background py-1.5 pl-8 pr-8 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {devices.length === 0 ? (
                <option value="">No devices</option>
              ) : (
                devices.map((dev) => (
                  <option key={dev.id} value={dev.id}>
                    {dev.model || dev.id} ({dev.status})
                  </option>
                ))
              )}
            </select>
            <Smartphone className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={refreshDevices} disabled={refreshing}>
            <RefreshCw className={"h-3.5 w-3.5" + (refreshing ? " animate-spin" : "")} />
          </Button>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Package className="h-3 w-3" />
            {projectInfo?.name || pkg}
          </span>
          {projectInfo && (
            <span className="text-[10px] text-muted-foreground">
              {isOwner ? "(Owner)" : `by ${projectInfo.author}`}
            </span>
          )}
        </div>
        <div className="flex gap-1.5">
          {/* Project actions */}
          {isOwner && workspacePath && (
            <Button
              size="sm"
              variant="default"
              onClick={handlePublish}
              disabled={publishing}
              title="Upload local files to server"
            >
              {publishing ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <Upload className="mr-1 h-3 w-3" />
              )}
              Publish
            </Button>
          )}
          {needsUpdate && (
            <Button
              size="sm"
              variant="secondary"
              onClick={handleUpdate}
              disabled={updating}
              title="Download latest files from server"
            >
              {updating ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <Download className="mr-1 h-3 w-3" />
              )}
              Update
            </Button>
          )}
          {checkingDiff && (
            <Button size="sm" variant="ghost" disabled>
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              Checking...
            </Button>
          )}
          <div className="w-px bg-border mx-0.5" />
          <Button size="sm" onClick={handleStart} disabled={!selectedDevice}>
            <Play className="mr-1 h-3 w-3" />
            Start
          </Button>
          <Button variant="destructive" size="sm" onClick={handleStop} disabled={!selectedDevice}>
            <Square className="mr-1 h-3 w-3" />
            Stop
          </Button>
          <Button variant="secondary" size="sm" onClick={handleExecute} disabled={!selectedDevice || running}>
            <Send className="mr-1 h-3 w-3" />
            Execute
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* File Explorer */}
        <div className="flex w-52 flex-col border-r border-border bg-sidebar">
          <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
            <span className="text-xs font-medium flex items-center gap-1.5">
              <FolderTree className="h-3.5 w-3.5" />
              {workspacePath ? "Workspace" : "Files"}
            </span>
            <div className="flex gap-1">
              {workspacePath && (
                <Button variant="ghost" size="icon" className="h-5 w-5" onClick={refreshFiles}>
                  <RefreshCw className="h-3 w-3" />
                </Button>
              )}
              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={openWorkspace}>
                <FolderInput className="h-3 w-3" />
              </Button>
              {workspacePath && (
                <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setShowSettings(!showSettings)}>
                  <Settings className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>

          {/* Workspace Settings */}
          {showSettings && workspacePath && (
            <div className="border-b border-border p-2 space-y-2">
              <div className="text-xs font-medium">Workspace Settings</div>
              <div>
                <label className="text-[10px] text-muted-foreground">Default File</label>
                <Input
                  value={workspaceConfig.default_file}
                  onChange={(e) => setWorkspaceConfig({ ...workspaceConfig, default_file: e.target.value })}
                  className="h-6 text-xs"
                />
              </div>
              <Button size="sm" className="h-6 text-xs w-full" onClick={saveWorkspaceSettings}>
                Save
              </Button>
            </div>
          )}

          <ScrollArea className="flex-1 p-1.5">
            {workspacePath ? (
              renderTree(files)
            ) : (
              <div className="flex h-full items-center justify-center p-4 text-center text-muted-foreground">
                <div>
                  <FolderInput className="mx-auto h-8 w-8 mb-2 opacity-20" />
                  <p className="text-xs">Open a folder to start</p>
                </div>
              </div>
            )}
          </ScrollArea>
          {workspacePath && (
            <div className="border-t border-border p-1.5">
              <div className="flex gap-1">
                <Input
                  placeholder="new file.js"
                  value={newFileName}
                  onChange={(e) => setNewFileName(e.target.value)}
                  className="h-6 text-xs"
                  onKeyDown={(e) => e.key === "Enter" && addFile()}
                />
                <Button size="sm" className="h-6 px-1.5" onClick={addFile}>
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Editor + Output */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
            <div className="flex items-center gap-2 text-xs">
              <FileCode2 className="h-3.5 w-3.5 text-primary" />
              {selectedFile ? selectedFile.name : workspacePath ? workspaceConfig.default_file || "main.js" : "No file open"}
            </div>
            <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={saveFile} disabled={!selectedFile}>
              <Save className="mr-1 h-3 w-3" />
              Save
            </Button>
          </div>

          <div className="flex-1 overflow-hidden">
            {selectedFile || workspacePath ? (
              <ScriptEditor value={code} onChange={setCode} onSave={saveFile} />
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <FileCode2 className="mx-auto h-10 w-10 mb-2 opacity-20" />
                  <p className="text-sm">Open a folder or select a file</p>
                </div>
              </div>
            )}
          </div>

          {output && (
            <div className="border-t border-border max-h-[120px] overflow-auto">
              <pre className="bg-muted p-2 text-xs font-mono whitespace-pre-wrap">{output}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
