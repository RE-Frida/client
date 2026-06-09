import { useState, useEffect } from "react";
import {
  Smartphone, RefreshCw, ChevronDown, Play, Square, Send,
  FileCode2, Loader2, Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  getConfig, discoverDevices, startSession, executeScript,
  launchApp, killApp, selectFolder, readFileContent,
} from "@/hooks/tauri";
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
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
  const [scriptCode, setScriptCode] = useState("");
  const [output, setOutput] = useState("");
  const [running, setRunning] = useState(false);

  useEffect(() => {
    getConfig().then(setConfig).catch(() => {});
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

  const pkg = config?.custom_package || "com.target.app";

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
    try {
      const result = await executeScript(selectedDevice, scriptCode);
      setOutput(result);
    } catch (e) {
      setOutput("Error: " + e);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div>
        <h2 className="text-2xl font-bold">Injection</h2>
        <p className="text-sm text-muted-foreground">Select a script and target device to inject</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Smartphone className="h-4 w-4" />
              Device
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <select
                value={selectedDevice || ""}
                onChange={(e) => onDeviceChange(e.target.value || null)}
                className="w-full appearance-none rounded-md border border-border bg-background py-2 pl-3 pr-8 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {devices.length === 0 ? (
                  <option value="">No devices found</option>
                ) : (
                  devices.map((dev) => (
                    <option key={dev.id} value={dev.id}>
                      {dev.model || dev.id} ({dev.status})
                    </option>
                  ))
                )}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {devices.length} device{devices.length !== 1 ? "s" : ""} found
              </span>
              <Button variant="ghost" size="sm" onClick={refreshDevices} disabled={refreshing}>
                <RefreshCw className={"mr-1 h-3 w-3" + (refreshing ? " animate-spin" : "")} />
                Refresh
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Package className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Target: {pkg}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileCode2 className="h-4 w-4" />
              Script
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button variant="outline" onClick={handleSelectScript}>
              <FileCode2 className="mr-2 h-4 w-4" />
              {scriptPath ? "Change Script" : "Select Script"}
            </Button>
            {scriptPath && (
              <p className="text-xs text-muted-foreground truncate">{scriptPath}</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="flex-1 flex flex-col">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Send className="h-4 w-4" />
              Execute
            </CardTitle>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleStart} disabled={!selectedDevice}>
                <Play className="mr-1 h-3 w-3" />
                Start
              </Button>
              <Button variant="destructive" size="sm" onClick={handleStop} disabled={!selectedDevice}>
                <Square className="mr-1 h-3 w-3" />
                Stop
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={handleExecute}
                disabled={!selectedDevice || !scriptCode.trim() || running}
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
        </CardHeader>
        <CardContent className="flex-1 flex flex-col min-h-0">
          <div className="text-xs font-medium text-muted-foreground mb-1">Script Code</div>
          <textarea
            value={scriptCode}
            onChange={(e) => setScriptCode(e.target.value)}
            placeholder="// Paste or select a script..."
            className="w-full min-h-[120px] resize-y rounded-md border border-border bg-background p-3 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {output && (
            <div className="mt-3">
              <div className="text-xs font-medium text-muted-foreground mb-1">Output</div>
              <pre className="max-h-[200px] overflow-auto rounded-md bg-muted p-3 text-xs font-mono whitespace-pre-wrap">
                {output}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
