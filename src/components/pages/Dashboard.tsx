import { useState, useEffect } from "react";
import {
  Play, Square, Send, Smartphone, Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getConfig, startSession, executeScript, launchApp, killApp } from "@/hooks/tauri";
import type { AppConfig } from "@/types";

interface DashboardProps {
  selectedDevice: string | null;
}

export function Dashboard({ selectedDevice }: DashboardProps) {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [scriptCode, setScriptCode] = useState(
    `// Frida script\nJava.perform(function() {\n  var MainActivity = Java.use("com.target.app.MainActivity");\n  MainActivity.onCreate.implementation = function(savedInstanceState) {\n    console.log("[*] onCreate called");\n    this.onCreate(savedInstanceState);\n  };\n});`
  );
  const [output, setOutput] = useState("");
  const [running, setRunning] = useState(false);

  useEffect(() => {
    getConfig().then(setConfig).catch(() => {});
  }, []);

  const pkg = config?.custom_package || "com.target.app";

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
      const result = await executeScript(selectedDevice, scriptCode);
      setOutput(result);
    } catch (e) {
      setOutput("Error: " + e);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Smartphone className="h-3 w-3" />
            {selectedDevice || "No device"}
          </span>
          <span className="flex items-center gap-1.5">
            <Package className="h-3 w-3" />
            {pkg}
          </span>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={handleStart} disabled={!selectedDevice}>
            <Play className="mr-1.5 h-3.5 w-3.5" />
            Start
          </Button>
          <Button variant="destructive" size="sm" onClick={handleStop} disabled={!selectedDevice}>
            <Square className="mr-1.5 h-3.5 w-3.5" />
            Stop
          </Button>
          <Button variant="secondary" size="sm" onClick={handleExecute} disabled={!selectedDevice || running}>
            <Send className="mr-1.5 h-3.5 w-3.5" />
            Execute
          </Button>
        </div>
      </div>

      {/* Script Editor */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <Textarea
          value={scriptCode}
          onChange={(e) => setScriptCode(e.target.value)}
          className="flex-1 resize-none rounded-none border-0 font-mono text-xs focus-visible:ring-0"
          placeholder="Enter Frida script..."
        />
      </div>

      {/* Output */}
      {output && (
        <div className="border-t border-border">
          <pre className="max-h-[150px] overflow-auto bg-muted p-3 text-xs font-mono">
            {output}
          </pre>
        </div>
      )}
    </div>
  );
}
