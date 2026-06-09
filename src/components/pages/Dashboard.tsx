import { useState, useEffect, useCallback } from "react";
import {
  Smartphone, RefreshCw, ChevronDown, User, Cpu, Wifi, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { discoverDevices, getAuthState, isConnected, getConfig } from "@/hooks/tauri";
import type { DeviceInfo, AuthState, AppConfig } from "@/types";

interface DashboardProps {
  selectedDevice: string | null;
  onDeviceChange: (id: string | null) => void;
  onNavigateToEditor: () => void;
}

export function Dashboard({ selectedDevice, onDeviceChange, onNavigateToEditor }: DashboardProps) {
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [connected, setConnected] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    getAuthState().then(setAuth).catch(() => {});
    isConnected().then(setConnected).catch(() => {});
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

  const selectedDev = devices.find((d) => d.id === selectedDevice);

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div>
        <h2 className="text-2xl font-bold">Dashboard</h2>
        <p className="text-sm text-muted-foreground">Device management and overview</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Device Picker */}
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
            {selectedDev && (
              <div className="rounded-lg border border-border p-3 text-xs">
                <div className="font-medium">{selectedDev.model || "Unknown Model"}</div>
                <div className="text-muted-foreground">{selectedDev.id}</div>
                <div className="mt-1">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    selectedDev.status === "device" ? "bg-green-500/10 text-green-500" : "bg-muted text-muted-foreground"
                  }`}>
                    {selectedDev.status}
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Account Info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <User className="h-4 w-4" />
              Account
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {auth?.authenticated ? (
              <div className="flex items-center gap-3">
                <div className="relative h-10 w-10 shrink-0">
                  {auth.avatar_url ? (
                    <img
                      src={auth.avatar_url}
                      alt="avatar"
                      className="h-full w-full rounded-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).classList.add("hidden");
                        (e.target as HTMLImageElement).parentElement!.querySelector(".fallback")?.classList.remove("hidden");
                      }}
                    />
                  ) : null}
                  <div className={"fallback flex h-full w-full items-center justify-center rounded-full bg-muted" + (auth.avatar_url ? " hidden" : "")}>
                    <User className="h-5 w-5 text-muted-foreground" />
                  </div>
                </div>
                <div>
                  <div className="font-medium">{auth.username}</div>
                  <div className="text-xs text-muted-foreground">Discord</div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">Not logged in</div>
            )}
          </CardContent>
        </Card>

        {/* Connection Status */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Wifi className="h-4 w-4" />
              Connection
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <div className={`h-2.5 w-2.5 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`} />
              <span className="text-sm">{connected ? "Connected to server" : "Disconnected"}</span>
            </div>
            <div className="text-xs text-muted-foreground">
              Package: {config?.custom_package || "com.target.app"}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Zap className="h-4 w-4" />
            Quick Actions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <Button onClick={onNavigateToEditor}>
              <Cpu className="mr-2 h-4 w-4" />
              Open Editor
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
