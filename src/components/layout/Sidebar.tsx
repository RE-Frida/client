import {
  LayoutDashboard,
  Store,
  Code2,
  ScrollText,
  Settings,
  Zap,
  LogOut,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { logout } from "@/hooks/tauri";
import type { TabId, AuthState, DeviceInfo } from "@/types";

interface SidebarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  auth: AuthState;
  devices: DeviceInfo[];
  selectedDevice: string | null;
  onDeviceChange: (deviceId: string | null) => void;
  onLogout: () => void;
}

const navItems: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "marketplace", label: "Marketplace", icon: Store },
  { id: "editor", label: "Editor", icon: Code2 },
  { id: "logs", label: "Logs", icon: ScrollText },
  { id: "settings", label: "Settings", icon: Settings },
];

export function Sidebar({
  activeTab,
  onTabChange,
  auth,
  devices,
  selectedDevice,
  onDeviceChange,
  onLogout,
}: SidebarProps) {
  const handleLogout = async () => {
    try {
      await logout();
      onLogout();
    } catch (e) {
      console.error("Logout failed:", e);
    }
  };

  return (
    <aside className="flex h-full w-56 flex-col border-r border-sidebar-border bg-sidebar">
      {/* Logo */}
      <div className="flex items-center gap-2 border-b border-sidebar-border px-4 py-4">
        <Zap className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-sm font-bold text-sidebar-foreground">
            RE:Frida
          </h1>
          <p className="text-[10px] text-muted-foreground">v0.1.6</p>
        </div>
      </div>

      {/* Device Selector */}
      <div className="border-b border-sidebar-border px-4 py-3">
        <div className="relative">
          <select
            value={selectedDevice || ""}
            onChange={(e) => onDeviceChange(e.target.value || null)}
            className="w-full appearance-none rounded-md border border-border bg-background py-1.5 pl-3 pr-8 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
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
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-2 py-3">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Auth Section */}
      <div className="border-t border-sidebar-border px-4 py-3">
        <div className="flex items-center gap-2">
          {auth.avatar_url && (
            <img
              src={auth.avatar_url}
              alt="avatar"
              className="h-6 w-6 rounded-full"
            />
          )}
          <span className="flex-1 truncate text-xs font-medium text-sidebar-foreground">
            {auth.username}
          </span>
          <button
            onClick={handleLogout}
            className="rounded p-1 text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
            title="Logout"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}
