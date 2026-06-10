import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Shell, ScrollText, RotateCcw, Package, FolderOpen,
  Loader2, Smartphone, RefreshCw, ChevronDown,
} from "lucide-react";
import {
  adbShell, adbLogcat, adbReboot,
  adbInstall, adbUninstall, adbListFiles,
  discoverDevices,
} from "@/hooks/tauri";

interface AdbPageProps {
  selectedDevice: string | null;
  onDeviceChange: (device: string | null) => void;
}

export function AdbPage({ selectedDevice, onDeviceChange }: AdbPageProps) {
  const [devices, setDevices] = useState<{ id: string; model: string | null; status: string }[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [shellCmd, setShellCmd] = useState("");

  const refreshDevices = async () => {
    setRefreshing(true);
    try {
      const list = await discoverDevices();
      setDevices(list);
      if (list.length === 1 && !selectedDevice) {
        onDeviceChange(list[0].id);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => { refreshDevices(); }, []);
  const [shellOutput, setShellOutput] = useState("");
  const [shelling, setShelling] = useState(false);


  const [logFilter, setLogFilter] = useState("");
  const [logLines, setLogLines] = useState(50);
  const [logOutput, setLogOutput] = useState("");
  const [logLoading, setLogLoading] = useState(false);

  const [rebooting, setRebooting] = useState(false);

  const [apkPath, setApkPath] = useState("");
  const [installing, setInstalling] = useState(false);
  const [uninstallPkg, setUninstallPkg] = useState("");
  const [uninstalling, setUninstalling] = useState(false);

  const [filePath, setFilePath] = useState("/sdcard");
  const [fileOutput, setFileOutput] = useState("");
  const [fileLoading, setFileLoading] = useState(false);

  const runShell = async () => {
    if (!selectedDevice || !shellCmd.trim()) return;
    setShelling(true);
    try {
      const result = await adbShell(selectedDevice, shellCmd);
      setShellOutput(result);
    } catch (e) {
      setShellOutput(String(e));
    } finally {
      setShelling(false);
    }
  };



  const fetchLogcat = async () => {
    if (!selectedDevice) return;
    setLogLoading(true);
    try {
      const result = await adbLogcat(selectedDevice, logFilter, logLines);
      setLogOutput(result);
    } catch (e) {
      setLogOutput(String(e));
    } finally {
      setLogLoading(false);
    }
  };

  const handleReboot = async (mode: string) => {
    if (!selectedDevice) return;
    setRebooting(true);
    try {
      await adbReboot(selectedDevice, mode);
    } catch (e) {
      console.error(e);
    } finally {
      setRebooting(false);
    }
  };

  const handleInstall = async () => {
    if (!selectedDevice || !apkPath.trim()) return;
    setInstalling(true);
    try {
      const result = await adbInstall(selectedDevice, apkPath);
      setApkPath(result);
    } catch (e) {
      setApkPath(String(e));
    } finally {
      setInstalling(false);
    }
  };

  const handleUninstall = async () => {
    if (!selectedDevice || !uninstallPkg.trim()) return;
    setUninstalling(true);
    try {
      await adbUninstall(selectedDevice, uninstallPkg);
      setUninstallPkg("Uninstalled");
    } catch (e) {
      setUninstallPkg(String(e));
    } finally {
      setUninstalling(false);
    }
  };

  const listFiles = async () => {
    if (!selectedDevice) return;
    setFileLoading(true);
    try {
      const result = await adbListFiles(selectedDevice, filePath);
      setFileOutput(result);
    } catch (e) {
      setFileOutput(String(e));
    } finally {
      setFileLoading(false);
    }
  };

  const sectionClass = "rounded-lg border border-border bg-card p-4";
  const sectionTitle = "mb-3 text-sm font-semibold flex items-center gap-2";

  return (
    <div className="flex h-full flex-col p-4">
      {/* Device toolbar */}
      <div className="flex shrink-0 items-center gap-3 rounded-lg border border-border bg-card p-3 mb-4">
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

      <div className="grid grid-cols-1 gap-4 overflow-auto pb-4">
        {/* Shell */}
        <div className={sectionClass}>
          <div className={sectionTitle}><Shell className="h-4 w-4" /> Shell</div>
          <div className="flex gap-2 mb-2">
            <Input
              placeholder="Enter command (e.g. getprop ro.build.version.sdk)"
              value={shellCmd}
              onChange={(e) => setShellCmd(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runShell()}
              className="flex-1 text-xs"
            />
            <Button size="sm" onClick={runShell} disabled={shelling || !selectedDevice} className="h-8 text-xs">
              {shelling ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              Run
            </Button>
          </div>
          {shellOutput && (
            <pre className="max-h-48 overflow-auto rounded bg-background p-2 text-[11px] font-mono whitespace-pre-wrap text-muted-foreground">
              {shellOutput}
            </pre>
          )}
        </div>

        {/* Logcat */}
        <div className={sectionClass}>
          <div className={sectionTitle}><ScrollText className="h-4 w-4" /> Logcat</div>
          <div className="flex gap-2 mb-2">
            <Input
              placeholder="Filter (e.g. ActivityManager)"
              value={logFilter}
              onChange={(e) => setLogFilter(e.target.value)}
              className="flex-1 text-xs"
            />
            <Input
              type="number"
              placeholder="Lines"
              value={logLines}
              onChange={(e) => setLogLines(Number(e.target.value))}
              className="w-20 text-xs"
            />
            <Button size="sm" onClick={fetchLogcat} disabled={logLoading || !selectedDevice} className="h-8 text-xs">
              {logLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              Fetch
            </Button>
          </div>
          {logOutput && (
            <pre className="max-h-48 overflow-auto rounded bg-background p-2 text-[11px] font-mono whitespace-pre-wrap text-muted-foreground">
              {logOutput}
            </pre>
          )}
        </div>

        {/* Reboot */}
        <div className={sectionClass}>
          <div className={sectionTitle}><RotateCcw className="h-4 w-4" /> Reboot</div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => handleReboot("system")} disabled={rebooting || !selectedDevice} className="h-8 text-xs">
              {rebooting ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              Reboot
            </Button>
            <Button size="sm" variant="secondary" onClick={() => handleReboot("recovery")} disabled={rebooting || !selectedDevice} className="h-8 text-xs">
              Recovery
            </Button>
            <Button size="sm" variant="secondary" onClick={() => handleReboot("bootloader")} disabled={rebooting || !selectedDevice} className="h-8 text-xs">
              Bootloader
            </Button>
          </div>
        </div>

        {/* Package Management */}
        <div className={sectionClass}>
          <div className={sectionTitle}><Package className="h-4 w-4" /> Packages</div>
          <div className="space-y-2">
            <div className="flex gap-2 items-center">
              <span className="text-xs w-16 shrink-0">Install:</span>
              <Input
                placeholder="/path/to/app.apk"
                value={apkPath}
                onChange={(e) => setApkPath(e.target.value)}
                className="flex-1 text-xs"
              />
              <Button size="sm" onClick={handleInstall} disabled={installing || !selectedDevice} className="h-8 text-xs">
                {installing ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                Install
              </Button>
            </div>
            <div className="flex gap-2 items-center">
              <span className="text-xs w-16 shrink-0">Uninstall:</span>
              <Input
                placeholder="com.example.app"
                value={uninstallPkg}
                onChange={(e) => setUninstallPkg(e.target.value)}
                className="flex-1 text-xs"
              />
              <Button size="sm" variant="destructive" onClick={handleUninstall} disabled={uninstalling || !selectedDevice} className="h-8 text-xs">
                {uninstalling ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                Uninstall
              </Button>
            </div>
          </div>
        </div>

        {/* File Browser */}
        <div className={sectionClass}>
          <div className={sectionTitle}><FolderOpen className="h-4 w-4" /> File Browser</div>
          <div className="flex gap-2 mb-2">
            <Input
              placeholder="/sdcard"
              value={filePath}
              onChange={(e) => setFilePath(e.target.value)}
              className="flex-1 text-xs"
            />
            <Button size="sm" onClick={listFiles} disabled={fileLoading || !selectedDevice} className="h-8 text-xs">
              {fileLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              List
            </Button>
          </div>
          {fileOutput && (
            <pre className="max-h-48 overflow-auto rounded bg-background p-2 text-[11px] font-mono whitespace-pre-wrap text-muted-foreground">
              {fileOutput}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}