import { useState, useEffect, useCallback } from "react";
import { Wifi, WifiOff, Disc, Smartphone, Package, Download, Activity } from "lucide-react";
import { getAuthState, isConnected, listProjects, discoverDevices } from "@/hooks/tauri";
import type { AuthState } from "@/types";

export function Dashboard() {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [connected, setConnected] = useState(false);
  const [projectCount, setProjectCount] = useState(0);
  const [deviceCount, setDeviceCount] = useState(0);
  const [totalDownloads, setTotalDownloads] = useState(0);

  const poll = useCallback(async () => {
    getAuthState().then(setAuth).catch(() => {});
    isConnected().then(setConnected).catch(() => {});
    try {
      const projects = await listProjects();
      setProjectCount(projects.length);
      setTotalDownloads(projects.reduce((sum, p) => sum + p.downloads, 0));
    } catch {}
    try {
      const devices = await discoverDevices();
      setDeviceCount(devices.length);
    } catch {}
  }, []);

  useEffect(() => {
    poll();
    const interval = setInterval(poll, 10000);
    return () => clearInterval(interval);
  }, [poll]);

  const StatCard = ({ icon: Icon, label, value, accent }: { icon: React.ElementType; label: string; value: string | number; accent: string }) => (
    <div className="rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/30">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${accent}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-2xl font-bold tabular-nums">{value}</p>
          <p className="text-xs text-muted-foreground truncate">{label}</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-full flex-col gap-6 overflow-auto p-6">
      {/* Welcome header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-primary via-primary/80 to-primary/60 bg-clip-text text-transparent">
            Welcome back{auth?.username ? `, ${auth.username}` : ""}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Android reverse-engineering toolkit
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs ${
            connected ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
          }`}>
            {connected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {connected ? "Connected" : "Disconnected"}
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          icon={Smartphone}
          label="Devices"
          value={deviceCount}
          accent="bg-blue-500/10 text-blue-500"
        />
        <StatCard
          icon={Package}
          label="Projects"
          value={projectCount}
          accent="bg-purple-500/10 text-purple-500"
        />
        <StatCard
          icon={Download}
          label="Total Downloads"
          value={totalDownloads.toLocaleString()}
          accent="bg-green-500/10 text-green-500"
        />
        <StatCard
          icon={Activity}
          label="Status"
          value={connected ? "Online" : "Offline"}
          accent={connected ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"}
        />
      </div>

      {/* Account card */}
      {auth?.authenticated && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="relative h-12 w-12 shrink-0">
              {auth.avatar_url ? (
                <img src={auth.avatar_url} alt="" className="h-full w-full rounded-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center rounded-full bg-muted">
                  <Disc className="h-5 w-5 text-muted-foreground" />
                </div>
              )}
            </div>
            <div className="min-w-0">
              <p className="font-semibold truncate">{auth.username}</p>
              <p className="text-xs text-muted-foreground">
                Discord
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
