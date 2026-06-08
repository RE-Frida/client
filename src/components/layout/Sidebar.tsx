import {
  LayoutDashboard,
  Store,
  Code2,
  ScrollText,
  Settings,
  Smartphone,
  Cpu,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { TabId } from "@/types";

interface SidebarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  connected: boolean;
}

const navItems: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "marketplace", label: "Marketplace", icon: Store },
  { id: "editor", label: "Editor", icon: Code2 },
  { id: "logs", label: "Logs", icon: ScrollText },
  { id: "settings", label: "Settings", icon: Settings },
];

export function Sidebar({ activeTab, onTabChange, connected }: SidebarProps) {
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

      {/* Connection Status */}
      <div className="border-b border-sidebar-border px-4 py-3">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "h-2 w-2 rounded-full",
              connected ? "bg-success" : "bg-muted-foreground"
            )}
          />
          <span className="text-xs text-sidebar-foreground">
            {connected ? "Connected" : "Disconnected"}
          </span>
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

      {/* Device Indicator */}
      <div className="border-t border-sidebar-border px-4 py-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Smartphone className="h-3 w-3" />
          <span>No device</span>
        </div>
        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          <Cpu className="h-3 w-3" />
          <span>Frida: idle</span>
        </div>
      </div>
    </aside>
  );
}
