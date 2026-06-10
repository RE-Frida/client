import { useState, useEffect, useRef, useCallback } from "react";
import {
  Smartphone, RefreshCw, ChevronDown, Play, Square, Terminal,
  FileCode2, Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getConfig, discoverDevices, startSession, executeScriptConsole,
  stopFridaConsole, sendFridaInput, launchApp, killApp,
} from "@/hooks/tauri";
import { open } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { showToast } from "@/lib/toast";
import type { DeviceInfo, AppConfig } from "@/types";

interface InjectionPageProps {
  selectedDevice: string | null;
  onDeviceChange: (id: string | null) => void;
}

export function InjectionPage({ selectedDevice, onDeviceChange }: InjectionPageProps) {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [scriptPath, setScriptPath] = useState<string | null>(null);
  const [output, setOutput] = useState("");
  const [inputBuffer, setInputBuffer] = useState("");
  const [consoleRunning, setConsoleRunning] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);
  const unlistenRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    getConfig().then((c) => { setConfig(c); }).catch(() => {});
    refreshDevices();
    return () => {
      if (unlistenRef.current) {
        unlistenRef.current();
      }
    };
  }, []);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output, inputBuffer]);

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
    }
  };

  const startListening = useCallback(async () => {
    if (unlistenRef.current) {
      unlistenRef.current();
    }
    const unlines: (() => void)[] = [];

    const un1 = await listen<{ line: string; source: string }>("frida-line", (event) => {
      setOutput((prev) => prev + event.payload.line + "\n");
    });
    unlines.push(un1);

    const un2 = await listen<{ success: boolean }>("frida-done", () => {
      setConsoleRunning(false);
      setInputBuffer("");
      setOutput((prev) => prev + "\n[Process exited]\n");
    });
    unlines.push(un2);

    unlistenRef.current = () => unlines.forEach((u) => u());
  }, []);

  const handleExecute = async () => {
    if (!selectedDevice || !scriptPath) {
      showToast("Select a script first", "info");
      return;
    }
    try {
      await startListening();
      const name = scriptPath.split("/").pop() || "script.js";
      setOutput(`❯ frida -D ${selectedDevice} -n Gadget -l ${name}\n`);
      setConsoleRunning(true);
      const result = await executeScriptConsole(selectedDevice, scriptPath);
      showToast(result, "success");
    } catch (e) {
      setConsoleRunning(false);
      setOutput((prev) => prev + "Error: " + e + "\n");
      showToast("Execute failed: " + e, "error");
    }
  };

  const handleStart = async () => {
    if (!selectedDevice) return;
    try {
      showToast("Starting session...", "info");
      const result = await startSession(selectedDevice);
      showToast(result, "success");
      if (pkg) {
        const launch = await launchApp(selectedDevice, pkg);
        showToast(launch, "success");
      }
    } catch (e) {
      showToast("Start failed: " + e, "error");
    }
  };

  const handleStop = async () => {
    if (!selectedDevice) return;
    try {
      const result = await stopFridaConsole();
      setConsoleRunning(false);
      setInputBuffer("");
      showToast(result, "info");
      if (pkg) {
        await killApp(selectedDevice, pkg);
      }
    } catch (e) {
      showToast("Stop failed: " + e, "error");
    }
  };

  const sendLine = useCallback(async (line: string) => {
    setOutput((prev) => prev + "> " + line + "\n");
    setInputBuffer("");
    try {
      await sendFridaInput(line);
    } catch (e) {
      setOutput((prev) => prev + "Error: " + e + "\n");
    }
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!consoleRunning) return;

    if (e.key === "Enter") {
      e.preventDefault();
      if (inputBuffer.trim()) {
        sendLine(inputBuffer);
      } else {
        setOutput((prev) => prev + "> \n");
      }
      return;
    }

    if (e.key === "Backspace") {
      e.preventDefault();
      setInputBuffer((prev) => prev.slice(0, -1));
      return;
    }

    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      setInputBuffer((prev) => prev + e.key);
    }
  }, [consoleRunning, inputBuffer, sendLine]);

  const displayText = output + (consoleRunning ? "\n> " + inputBuffer + "\u2588" : "");

  return (
    <div className="flex h-full flex-col p-4">
      {/* Top toolbar */}
      <div className="flex shrink-0 items-center gap-3 rounded-lg border border-border bg-card p-3">
        <div className="flex items-center gap-2 shrink-0">
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

        <div className="text-xs text-muted-foreground/50 shrink-0">|</div>

        <div className="flex items-center gap-2 min-w-0 flex-1">
          <FileCode2 className="h-4 w-4 text-muted-foreground shrink-0" />
          <Button variant="outline" size="sm" onClick={handleSelectScript} className="h-7 text-xs shrink-0">
            {scriptPath ? "Change" : "Select Script"}
          </Button>
          {scriptPath && (
            <span className="truncate text-xs text-muted-foreground min-w-0">{scriptPath}</span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            size="sm"
            onClick={handleStart}
            disabled={!selectedDevice}
            className="h-7 text-xs px-2"
          >
            <Play className="mr-1 h-3 w-3" />
            Start
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={handleExecute}
            disabled={!selectedDevice || !scriptPath}
            className="h-7 text-xs px-2"
          >
            <Send className="mr-1 h-3 w-3" />
            Execute
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleStop}
            disabled={!selectedDevice}
            className="h-7 text-xs px-2"
          >
            <Square className="mr-1 h-3 w-3" />
            Stop
          </Button>
        </div>
      </div>

      {/* Console - click to focus, type directly */}
      <div className="flex-1 min-h-0 mt-3">
        <div className="h-full rounded-lg border border-border overflow-hidden bg-background flex flex-col">
          <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
            <Terminal className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Frida Console</span>
            {consoleRunning && (
              <span className="ml-auto flex items-center gap-1 text-xs text-green-500">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                Running
              </span>
            )}
          </div>

          <div
            ref={outputRef}
            tabIndex={0}
            onKeyDown={handleKeyDown}
            className="flex-1 overflow-y-auto p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap outline-none cursor-text select-text"
          >
            {displayText || (
              <span className="text-muted-foreground italic">
                Click Start (port forward + launch app), then Execute to run a script
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
