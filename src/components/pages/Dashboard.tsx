import { useState, useEffect, useCallback } from "react";
import {
  RefreshCw, Play, Square, Smartphone, Terminal, Package, Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { discoverDevices, startSession, stopSession, executeScript, listPackages } from "@/hooks/tauri";
import type { DeviceInfo } from "@/types";

interface DashboardProps {
  onLog: (msg: string) => void;
}

export function Dashboard({ onLog }: DashboardProps) {
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [packages, setPackages] = useState<string[]>([]);
  const [scriptCode, setScriptCode] = useState(
    "// Frida script\nJava.perform(function() {\n  var MainActivity = Java.use(\"com.target.app.MainActivity\");\n  MainActivity.onCreate.implementation = function(savedInstanceState) {\n    console.log(\"[*] onCreate called\");\n    this.onCreate(savedInstanceState);\n  };\n});"
  );
  const [isRunning, setIsRunning] = useState(false);
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);

  const refreshDevices = useCallback(async () => {
    setLoading(true);
    try {
      const devs = await discoverDevices();
      setDevices(devs);
      if (devs.length > 0 && !selectedDevice) {
        setSelectedDevice(devs[0].id);
      }
      onLog("Found " + devs.length + " device(s)");
    } catch (e) {
      onLog("Device discovery failed: " + e);
    } finally {
      setLoading(false);
    }
  }, [selectedDevice, onLog]);

  const refreshPackages = useCallback(async () => {
    if (!selectedDevice) return;
    try {
      const pkgs = await listPackages(selectedDevice);
      setPackages(pkgs);
    } catch (e) {
      onLog("Failed to list packages: " + e);
    }
  }, [selectedDevice, onLog]);

  useEffect(() => {
    refreshDevices();
  }, []);

  useEffect(() => {
    if (selectedDevice) {
      refreshPackages();
    }
  }, [selectedDevice]);

  const handleStartSession = async () => {
    if (!selectedDevice) return;
    try {
      const msg = await startSession(selectedDevice);
      setIsRunning(true);
      onLog(msg);
    } catch (e) {
      onLog("Start failed: " + e);
    }
  };

  const handleStopSession = async () => {
    try {
      const msg = await stopSession();
      setIsRunning(false);
      onLog(msg);
    } catch (e) {
      onLog("Stop failed: " + e);
    }
  };

  const handleExecute = async () => {
    if (!selectedDevice) return;
    try {
      const result = await executeScript(selectedDevice, scriptCode);
      setOutput(result);
      onLog("Script executed");
    } catch (e) {
      setOutput("Error: " + e);
      onLog("Script error: " + e);
    }
  };

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Dashboard</h2>
          <p className="text-sm text-muted-foreground">Manage devices and execute scripts</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refreshDevices} disabled={loading}>
            <RefreshCw className={"mr-2 h-4 w-4" + (loading ? " animate-spin" : "")} />
            Refresh
          </Button>
          {!isRunning ? (
            <Button size="sm" onClick={handleStartSession}>
              <Play className="mr-2 h-4 w-4" />
              Start Session
            </Button>
          ) : (
            <Button variant="destructive" size="sm" onClick={handleStopSession}>
              <Square className="mr-2 h-4 w-4" />
              Stop
            </Button>
          )}
        </div>
      </div>

      <div className="grid flex-1 grid-cols-3 gap-4">
        <Card className="col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Smartphone className="h-4 w-4" />
              Devices
            </CardTitle>
            <CardDescription>{devices.length} connected</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[200px]">
              {devices.length === 0 ? (
                <p className="text-sm text-muted-foreground">No devices found</p>
              ) : (
                <div className="space-y-2">
                  {devices.map((dev) => (
                    <button
                      key={dev.id}
                      onClick={() => setSelectedDevice(dev.id)}
                      className={
                        "flex w-full items-center justify-between rounded-lg border p-3 text-left text-sm transition-colors " +
                        (selectedDevice === dev.id
                          ? "border-primary bg-primary/5"
                          : "border-border hover:bg-accent")
                      }
                    >
                      <div>
                        <p className="font-medium">{dev.model || dev.id}</p>
                        <p className="text-xs text-muted-foreground">{dev.id}</p>
                      </div>
                      <Badge variant={dev.status === "device" ? "success" : "secondary"}>
                        {dev.status}
                      </Badge>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Package className="h-4 w-4" />
              Packages
            </CardTitle>
            <CardDescription>{packages.length} installed (3rd party)</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[200px]">
              {packages.length === 0 ? (
                <p className="text-sm text-muted-foreground">Select a device</p>
              ) : (
                <div className="space-y-1">
                  {packages.map((pkg) => (
                    <button
                      key={pkg}
                      onClick={() => {
                        setScriptCode((prev) => prev.replace(/com\.\w+\.\w+/, pkg));
                      }}
                      className="w-full rounded px-2 py-1 text-left text-xs font-mono hover:bg-accent"
                    >
                      {pkg}
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="col-span-1 flex flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Terminal className="h-4 w-4" />
              Script
            </CardTitle>
            <CardDescription>Edit and execute</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-3">
            <Textarea
              value={scriptCode}
              onChange={(e) => setScriptCode(e.target.value)}
              className="flex-1 min-h-[160px] font-mono text-xs"
              placeholder="Enter Frida script..."
            />
            <Button onClick={handleExecute} disabled={!selectedDevice} className="w-full">
              <Send className="mr-2 h-4 w-4" />
              Execute
            </Button>
          </CardContent>
        </Card>
      </div>

      {output && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Output</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="max-h-[120px] overflow-auto rounded bg-muted p-3 text-xs font-mono">
              {output}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
