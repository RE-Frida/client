import { useState, useEffect, useRef } from "react";
import {
  Smartphone, RefreshCw, ChevronDown, Play, Square, Send,
  FileCode2, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getConfig, discoverDevices, startSession, executeScript,
  launchApp, killApp,
} from "@/hooks/tauri";
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { listen } from "@tauri-apps/api/event";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { oneDark } from "@codemirror/theme-one-dark";
import type { DeviceInfo } from "@/types";

interface InjectionPageProps {
  selectedDevice: string | null;
  onDeviceChange: (id: string | null) => void;
}

export function InjectionPage({ selectedDevice, onDeviceChange }: InjectionPageProps) {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [scriptPath, setScriptPath] = useState<string | null>(null);
  const [scriptCode, setScriptCode] = useState("");
  const [output, setOutput] = useState("");
  const [running, setRunning] = useState(false);
  const [currentTheme, setCurrentTheme] = useState("dark");
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getConfig().then((c) => { setConfig(c); setCurrentTheme(c.settings.theme); }).catch(() => {});
    refreshDevices();
  }, []);

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

  const pkg = config?.settings.custom_package || "";

  const handleSelectScript = async () => {
    const selected = await open({
      multiple: false,
      filters: [{ name: "Scripts", extensions: ["js"] }],
    });
    if (selected) {
      setScriptPath(selected);
      try {
        const content = await readTextFile(selected);
        setScriptCode(content);
      } catch (e) {
        setOutput("Error reading script: " + e);
      }
    }
  };

  const handleStart = async () => {
    if (!selectedDevice) return;
    try {
      const result = await startSession(selectedDevice);
      const launch = await launchApp(selectedDevice, pkg);
      setOutput(result + "\n" + launch);
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
    if (!selectedDevice || !scriptCode.trim()) return;
    setRunning(true);
    setOutput("");

    const unlisten = await listen<{ line: string; source: string }>("frida-line", (event) => {
      setOutput((prev) => prev + event.payload.line + "\n");
    });

    try {
      const result = await executeScript(selectedDevice, scriptCode);
      if (result) {
        setOutput((prev) => prev + result);
      }
    } catch (e) {
      setOutput((prev) => prev + "Error: " + e);
    } finally {
      unlisten();
      setRunning(false);
    }
  };

  return (
    <div className="flex h-full flex-col p-4">
      {/* Top toolbar */}
      <div className="flex shrink-0 items-center gap-3 rounded-lg border border-border bg-card p-3">
        <div className="flex items-center gap-2">
          <Smartphone className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="relative">
            <select
              value={selectedDevice || ""}
              onChange={(e) => onDeviceChange(e.target.value || null)}
              className="appearance-none rounded-md border border-border bg-background py-1.5 pl-2 pr-6 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {devices.length === 0 ? (
                <option value="">No devices</option>
              ) : (
                devices.map((dev) => (
                  <option key={dev.id} value={dev.id}>
                    {dev.model || dev.id}
                  </option>
                ))
              )}
            </select>
            <ChevronDown className="pointer-events-none absolute right-1 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          </div>
          <Button variant="ghost" size="sm" onClick={refreshDevices} disabled={refreshing} className="h-7 px-1.5">
            <RefreshCw className={"h-3 w-3" + (refreshing ? " animate-spin" : "")} />
          </Button>
        </div>

        <div className="text-xs text-muted-foreground/50">|</div>

        <div className="flex items-center gap-2">
          <FileCode2 className="h-4 w-4 text-muted-foreground shrink-0" />
          <Button variant="outline" size="sm" onClick={handleSelectScript} className="h-7 text-xs">
            {scriptPath ? "Change Script" : "Select Script"}
          </Button>
          {scriptPath && (
            <span className="max-w-[200px] truncate text-xs text-muted-foreground">{scriptPath}</span>
          )}
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <Button size="sm" onClick={handleStart} disabled={!selectedDevice} className="h-7 text-xs px-2">
            <Play className="mr-1 h-3 w-3" />
            Start
          </Button>
          <Button variant="destructive" size="sm" onClick={handleStop} disabled={!selectedDevice} className="h-7 text-xs px-2">
            <Square className="mr-1 h-3 w-3" />
            Stop
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={handleExecute}
            disabled={!selectedDevice || !scriptCode.trim() || running}
            className="h-7 text-xs px-2"
          >
            {running ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <Send className="mr-1 h-3 w-3" />
            )}
            Execute
          </Button>
        </div>
      </div>

      <div className="flex-1 min-h-0 mt-3">
        <div ref={outputRef} className="h-full rounded-lg border border-border overflow-hidden">
          <CodeMirror
            value={output || "// Output will appear here..."}
            height="100%"
            theme={currentTheme === "light" ? undefined : oneDark}
            extensions={[javascript()]}
            readOnly
            basicSetup={{
              lineNumbers: false,
              foldGutter: false,
              highlightActiveLine: false,
              highlightActiveLineGutter: false,
            }}
          />
        </div>
      </div>
    </div>
  );
}
