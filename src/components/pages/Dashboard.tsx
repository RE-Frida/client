import { useState, useEffect, useCallback } from "react";
import {
  Play, Square, Send, Smartphone, Package, RefreshCw,
  FileCode2, FolderOpen, FolderTree, Save, Plus, ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ScriptEditor } from "@/components/ui/script-editor";
import {
  getConfig, discoverDevices, startSession, executeScript, launchApp, killApp,
} from "@/hooks/tauri";
import type { AppConfig, DeviceInfo } from "@/types";

interface FileNode {
  name: string;
  type: "file" | "folder";
  children?: FileNode[];
  content?: string;
}

const INITIAL_TREE: FileNode[] = [
  {
    name: "scripts",
    type: "folder",
    children: [
      { name: "main.js", type: "file", content: "// Frida script\nJava.perform(function() {\n  var MainActivity = Java.use(\"com.target.app.MainActivity\");\n  MainActivity.onCreate.implementation = function(savedInstanceState) {\n    console.log(\"[*] onCreate called\");\n    this.onCreate(savedInstanceState);\n  };\n});" },
      { name: "hooks", type: "folder", children: [
        { name: "crypto.js", type: "file", content: "// Crypto hooks\nJava.perform(function() {\n  var Cipher = Java.use('javax.crypto.Cipher');\n  Cipher.doFinal.overload('[B').implementation = function(input) {\n    console.log('[*] Cipher.doFinal called');\n    return this.doFinal(input);\n  };\n});" },
      ]},
    ],
  },
];

interface DashboardProps {
  selectedDevice: string | null;
  onDeviceChange: (id: string | null) => void;
}

export function Dashboard({ selectedDevice, onDeviceChange }: DashboardProps) {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [tree, setTree] = useState<FileNode[]>(INITIAL_TREE);
  const [selectedFile, setSelectedFile] = useState<FileNode | null>(null);
  const [code, setCode] = useState("");
  const [output, setOutput] = useState("");
  const [running, setRunning] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    getConfig().then(setConfig).catch(() => {});
    refreshDevices();
  }, []);

  const refreshDevices = useCallback(async () => {
    setRefreshing(true);
    try {
      const devs = await discoverDevices();
      setDevices(devs);
      if (devs.length > 0 && !selectedDevice) {
        onDeviceChange(devs[0].id);
      }
      if (selectedDevice && !devs.find((d) => d.id === selectedDevice)) {
        onDeviceChange(devs.length > 0 ? devs[0].id : null);
      }
    } catch (e) {
      console.error("Device discovery failed:", e);
    } finally {
      setRefreshing(false);
    }
  }, [selectedDevice, onDeviceChange]);

  const pkg = config?.custom_package || "com.target.app";

  const selectFile = (node: FileNode) => {
    if (node.type === "file") {
      setSelectedFile(node);
      setCode(node.content || "");
    }
  };

  const saveFile = () => {
    if (!selectedFile) return;
    selectedFile.content = code;
    setOutput("Saved " + selectedFile.name);
  };

  const addFile = () => {
    if (!newFileName) return;
    const name = newFileName.endsWith(".js") ? newFileName : newFileName + ".js";
    const newFile: FileNode = { name, type: "file", content: "// New script\n" };
    setTree((prev) => [...prev, newFile]);
    setNewFileName("");
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
    if (!selectedDevice || !selectedFile) return;
    setRunning(true);
    try {
      const result = await executeScript(selectedDevice, code);
      setOutput(result);
    } catch (e) {
      setOutput("Error: " + e);
    } finally {
      setRunning(false);
    }
  };

  const renderTree = (nodes: FileNode[], depth = 0) => {
    return nodes.map((node) => (
      <div key={node.name + depth} style={{ paddingLeft: depth * 16 }}>
        <button
          onClick={() => selectFile(node)}
          className={
            "flex w-full items-center gap-2 rounded px-2 py-1 text-xs transition-colors " +
            (selectedFile?.name === node.name
              ? "bg-accent text-accent-foreground"
              : "hover:bg-accent/50")
          }
        >
          {node.type === "folder" ? (
            <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <FileCode2 className="h-3.5 w-3.5 text-primary" />
          )}
          <span className="truncate">{node.name}</span>
        </button>
        {node.children && renderTree(node.children, depth + 1)}
      </div>
    ));
  };

  return (
    <div className="flex h-full flex-col">
      {/* Top Toolbar */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-3">
          {/* Device Picker */}
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
            {pkg}
          </span>
        </div>
        <div className="flex gap-1.5">
          <Button size="sm" onClick={handleStart} disabled={!selectedDevice}>
            <Play className="mr-1 h-3 w-3" />
            Start
          </Button>
          <Button variant="destructive" size="sm" onClick={handleStop} disabled={!selectedDevice}>
            <Square className="mr-1 h-3 w-3" />
            Stop
          </Button>
          <Button variant="secondary" size="sm" onClick={handleExecute} disabled={!selectedDevice || !selectedFile || running}>
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
              Files
            </span>
          </div>
          <ScrollArea className="flex-1 p-1.5">
            {renderTree(tree)}
          </ScrollArea>
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
        </div>

        {/* Editor + Output */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* File Header */}
          <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
            <div className="flex items-center gap-2 text-xs">
              <FileCode2 className="h-3.5 w-3.5 text-primary" />
              {selectedFile ? selectedFile.name : "No file open"}
            </div>
            <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={saveFile} disabled={!selectedFile}>
              <Save className="mr-1 h-3 w-3" />
              Save
            </Button>
          </div>

          {/* Code Editor */}
          <div className="flex-1 overflow-hidden">
            {selectedFile ? (
              <ScriptEditor value={code} onChange={setCode} />
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <FileCode2 className="mx-auto h-10 w-10 mb-2 opacity-20" />
                  <p className="text-sm">Select a file to edit</p>
                </div>
              </div>
            )}
          </div>

          {/* Output */}
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
