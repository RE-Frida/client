import {
  LayoutDashboard,
  Store,
  Send,
  ScrollText,
  Settings,
  LogOut,
  User,
} from "lucide-react";
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
  { id: "injection", label: "Injection", icon: Send },
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

  const handleLogout = async () => {
    try {
      await logout();
      onLogout();
    } catch (e) {
      console.error("Logout failed:", e);
    }
  };

  return (
    <aside className="flex h-full w-48 flex-col border-r border-sidebar-border bg-sidebar">
      {/* Navigation */}
      <nav className="flex-1 space-y-0.5 px-2 py-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors",
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
      <div className="border-t border-sidebar-border px-3 py-2">
        <div className="flex items-center gap-2">
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
