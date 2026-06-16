import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Terminal, ScrollText, RotateCcw, Package, FolderOpen,
  Loader2, Smartphone, RefreshCw, Copy, Check, Wifi,
  WifiOff, Search, X,
} from "lucide-react";
import {
  adbShell, adbLogcat, adbReboot,
  adbInstall, adbUninstall, adbListFiles,
  adbConnect, adbDisconnect, listPackages,
} from "@/hooks/tauri";
import type { DeviceInfo } from "@/types";

interface AdbPageProps {
  selectedDevice: string | null;
  onDeviceChange: (device: string | null) => void;
  devices: DeviceInfo[];
  onRefreshDevices: () => Promise<void>;
}

export function AdbPage({ selectedDevice, onDeviceChange, devices, onRefreshDevices }: AdbPageProps) {
  const [refreshing, setRefreshing] = useState(false);
  const [shellCmd, setShellCmd] = useState("");

  const handleRefreshDevices = async () => {
    setRefreshing(true);
    try {
      await onRefreshDevices();
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => { handleRefreshDevices(); }, []);
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
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  const [wirelessAddr, setWirelessAddr] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [connectResult, setConnectResult] = useState("");
  const [connectedAddr, setConnectedAddr] = useState<string | null>(null);

  const [packages, setPackages] = useState<string[]>([]);
  const [packageFilter, setPackageFilter] = useState("");
  const [packagesLoading, setPackagesLoading] = useState(false);
  const [showPackages, setShowPackages] = useState(false);

  const copyToClipboard = async (text: string, section: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedSection(section);
      setTimeout(() => setCopiedSection(null), 1500);
    } catch (e) {
      console.error("Copy failed:", e);
    }
  };

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

  const handleBrowseApk = async () => {
    const selected = await open({
      multiple: false,
      filters: [{ name: "APK", extensions: ["apk"] }],
    });
    if (selected) {
      setApkPath(selected);
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

  const handleConnect = async () => {
    if (!wirelessAddr.trim()) return;
    setConnecting(true);
    setConnectResult("");
    try {
      const result = await adbConnect(wirelessAddr.trim());
      setConnectResult(result);
      if (result.toLowerCase().includes("connected to")) {
        setConnectedAddr(wirelessAddr.trim());
      }
      await onRefreshDevices();
    } catch (e) {
      setConnectResult(String(e));
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!connectedAddr) return;
    setConnecting(true);
    try {
      const result = await adbDisconnect(connectedAddr);
      setConnectResult(result);
      setConnectedAddr(null);
      await onRefreshDevices();
    } catch (e) {
      setConnectResult(String(e));
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnectAll = async () => {
    setConnecting(true);
    try {
      const result = await adbDisconnect("");
      setConnectResult(result);
      setConnectedAddr(null);
      await onRefreshDevices();
    } catch (e) {
      setConnectResult(String(e));
    } finally {
      setConnecting(false);
    }
  };

  const loadPackages = async () => {
    if (!selectedDevice) return;
    if (showPackages) {
      setShowPackages(false);
      return;
    }
    setPackagesLoading(true);
    try {
      const pkgs = await listPackages(selectedDevice);
      setPackages(pkgs.sort());
      setShowPackages(true);
    } catch (e) {
      console.error(e);
    } finally {
      setPackagesLoading(false);
    }
  };

  return (
    <div className="flex h-full flex-col p-4">
      {/* Device toolbar */}
      <div className="flex shrink-0 items-center gap-3 rounded-lg border border-border bg-card p-3 mb-4">
        <Smartphone className="h-4 w-4 text-muted-foreground shrink-0" />
        <select
          value={selectedDevice || ""}
          onChange={(e) => onDeviceChange(e.target.value || null)}
          className="py-1.5 pl-2 pr-6 text-xs"
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
        <Button variant="ghost" size="sm" onClick={handleRefreshDevices} disabled={refreshing} className="h-7 px-1.5">
          <RefreshCw className={"h-3 w-3" + (refreshing ? " animate-spin" : "")} />
        </Button>
        <div className="text-xs text-muted-foreground/50 shrink-0">|</div>
        <Wifi className="h-4 w-4 text-muted-foreground shrink-0" />
        <Input
          placeholder="ip:port (e.g. 192.168.1.50:5555)"
          value={wirelessAddr}
          onChange={(e) => setWirelessAddr(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleConnect()}
          className="w-44 text-xs"
        />
        <Button size="sm" onClick={handleConnect} disabled={connecting || !wirelessAddr.trim()} className="h-7 text-xs">
          {connecting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
          Connect
        </Button>
        {connectedAddr ? (
          <Button size="sm" variant="secondary" onClick={handleDisconnect} disabled={connecting} className="h-7 text-xs">
            Disconnect
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" onClick={handleDisconnectAll} disabled={connecting} className="h-7 text-xs text-muted-foreground">
          <WifiOff className="h-3 w-3 mr-1" />
          All
        </Button>
        {connectResult && (
          <span className={"text-[10px] truncate max-w-32 " + (connectResult.toLowerCase().includes("connected") ? "text-green-500" : "text-muted-foreground")}>
            {connectResult.trim()}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 overflow-auto pb-4">
        {/* Shell */}
        <div className={sectionClass}>
          <div className={sectionTitle}><Terminal className="h-4 w-4" /> Shell</div>
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
            <div className="relative">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyToClipboard(shellOutput, "shell")}
                className="absolute top-1 right-1 h-6 w-6 p-0 opacity-60 hover:opacity-100"
                title="Copy output"
              >
                {copiedSection === "shell" ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
              </Button>
              <pre className="max-h-48 overflow-auto rounded bg-background p-2 text-[11px] font-mono whitespace-pre-wrap text-muted-foreground">
                {shellOutput}
              </pre>
            </div>
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
            <div className="relative">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyToClipboard(logOutput, "logcat")}
                className="absolute top-1 right-1 h-6 w-6 p-0 opacity-60 hover:opacity-100"
                title="Copy output"
              >
                {copiedSection === "logcat" ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
              </Button>
              <pre className="max-h-48 overflow-auto rounded bg-background p-2 text-[11px] font-mono whitespace-pre-wrap text-muted-foreground">
                {logOutput}
              </pre>
            </div>
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
          <div className="flex items-center justify-between mb-3">
            <div className={sectionTitle}><Package className="h-4 w-4" /> Packages</div>
            <Button size="sm" variant="outline" onClick={loadPackages} disabled={packagesLoading || !selectedDevice} className="h-7 text-xs">
              {packagesLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Search className="h-3 w-3 mr-1" />}
              {showPackages ? "Hide" : "List Installed"}
            </Button>
          </div>

          {showPackages && (
            <div className="mb-3 rounded border border-border bg-background">
              <div className="flex items-center gap-2 border-b border-border px-2 py-1.5">
                <Search className="h-3 w-3 text-muted-foreground shrink-0" />
                <input
                  placeholder="Filter packages..."
                  value={packageFilter}
                  onChange={(e) => setPackageFilter(e.target.value)}
                  className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
                  autoFocus
                />
                <span className="text-[10px] text-muted-foreground">{packages.length} total</span>
              </div>
              <div className="max-h-40 overflow-y-auto">
                {packages
                  .filter((p) => !packageFilter || p.toLowerCase().includes(packageFilter.toLowerCase()))
                  .map((pkg) => (
                    <button
                      key={pkg}
                      onClick={() => { setUninstallPkg(pkg); setShowPackages(false); }}
                      className="w-full px-2 py-1 text-left text-[11px] font-mono text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors truncate"
                      title={pkg}
                    >
                      {pkg}
                    </button>
                  ))}
                {packages.filter((p) => !packageFilter || p.toLowerCase().includes(packageFilter.toLowerCase())).length === 0 && (
                  <p className="px-2 py-3 text-[11px] text-muted-foreground text-center">No packages match filter</p>
                )}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex gap-2 items-center">
              <span className="text-xs w-16 shrink-0">Install:</span>
              <Input
                placeholder="/path/to/app.apk"
                value={apkPath}
                onChange={(e) => setApkPath(e.target.value)}
                className="flex-1 text-xs"
              />
              <Button variant="outline" size="sm" onClick={handleBrowseApk} disabled={!selectedDevice} className="h-8 text-xs">
                Browse
              </Button>
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
            <div className="relative">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyToClipboard(fileOutput, "files")}
                className="absolute top-1 right-1 h-6 w-6 p-0 opacity-60 hover:opacity-100"
                title="Copy output"
              >
                {copiedSection === "files" ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
              </Button>
              <pre className="max-h-48 overflow-auto rounded bg-background p-2 text-[11px] font-mono whitespace-pre-wrap text-muted-foreground">
                {fileOutput}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}