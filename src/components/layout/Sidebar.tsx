import { useState } from "react";
import {
  LayoutDashboard,
  Store,
  Syringe,
  ScrollText,
  Settings,
  LogOut,
  User,
  PanelLeftOpen,
  PanelLeftClose,
  Terminal,
  Disc,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { logout } from "@/hooks/tauri";
import type { TabId, AuthState } from "@/types";

interface SidebarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  auth: AuthState;
  onLogout: () => void;
}

const navItems: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "injection", label: "Injection", icon: Syringe },
  { id: "adb", label: "ADB", icon: Terminal },
  { id: "marketplace", label: "Marketplace", icon: Store },
  { id: "logs", label: "Logs", icon: ScrollText },
  { id: "settings", label: "Settings", icon: Settings },
];

export function Sidebar({
  activeTab,
  onTabChange,
  auth,
  onLogout,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(() =>
    localStorage.getItem("sidebar_collapsed") === "true"
  );
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("sidebar_collapsed", String(next));
      return next;
    });
  };

  const handleLogout = async () => {
    try {
      await logout();
      onLogout();
    } catch (e) {
      console.error("Logout failed:", e);
    }
  };

  return (
    <aside
      className={cn(
        "group relative z-20 flex h-full flex-col border-r border-sidebar-border bg-sidebar transition-all duration-200",
        collapsed ? "w-14" : "w-48"
      )}
    >
      {/* Collapse Toggle */}
      <button
        onClick={toggle}
        className={cn(
          "absolute top-1 z-10 rounded-md p-1 text-sidebar-foreground/40 hover:text-sidebar-foreground",
          collapsed ? "inset-x-0 mx-auto w-fit" : "right-1"
        )}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? (
          <PanelLeftOpen className="h-4 w-4" />
        ) : (
          <PanelLeftClose className="h-4 w-4" />
        )}
      </button>

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5 px-1.5 pt-8">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={cn(
                "flex w-full items-center rounded-lg text-sm font-medium transition-colors",
                collapsed
                  ? "justify-center px-0 py-2"
                  : "gap-2.5 px-2.5 py-1.5",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              )}
              title={collapsed ? item.label : undefined}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && item.label}
            </button>
          );
        })}
      </nav>

      {/* Auth Section */}
      <div className="border-t border-sidebar-border px-1.5 py-2">
        <div
          className={cn(
            "flex items-center gap-2 group/account",
            collapsed ? "justify-center" : ""
          )}
        >
          <div className="relative h-6 w-6 shrink-0">
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
              <User className="h-3 w-3 text-muted-foreground" />
            </div>
          </div>
          {!collapsed && (
            <div className="flex flex-1 min-w-0 items-center gap-1">
              <span className="truncate text-xs font-medium text-sidebar-foreground group-hover/account:hidden">
                {auth.username}
              </span>
              <span className="hidden truncate text-[10px] text-sidebar-foreground/60 group-hover/account:block">
                <Disc className="mr-1 inline h-2.5 w-2.5" />
                {auth.discord_id ? `ID: ${auth.discord_id}` : "Discord"}
              </span>
              <button
                onClick={() => setShowLogoutConfirm(true)}
                className="rounded p-1 text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground shrink-0"
                title="Logout"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Logout Confirmation */}
      {showLogoutConfirm && (
        <div className="absolute bottom-14 left-2 right-2 z-30 rounded-lg border border-border bg-card p-3 shadow-lg">
          <p className="mb-2 text-xs font-medium">Log out of RE:Frida?</p>
          <div className="flex gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className="flex-1 h-7 text-xs"
              onClick={() => setShowLogoutConfirm(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="flex-1 h-7 text-xs"
              onClick={() => { setShowLogoutConfirm(false); handleLogout(); }}
            >
              Logout
            </Button>
          </div>
        </div>
      )}
    </aside>
  );
}
