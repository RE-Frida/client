import { useState, useEffect, useCallback } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { TitleBar } from "@/components/layout/TitleBar";
import { Dashboard } from "@/components/pages/Dashboard";
import { InjectionPage } from "@/components/pages/InjectionPage";
import { LogsPage } from "@/components/pages/LogsPage";
import { Marketplace } from "@/components/pages/MarketplacePage";
import { SettingsPage } from "@/components/pages/SettingsPage";
import { LoginPage } from "@/components/pages/LoginPage";
import { getAuthState, isConnected, getConfig, reconnect } from "@/hooks/tauri";
import { applyTheme } from "@/lib/theme";
import { subscribeToasts, dismissToast } from "@/lib/toast";
import type { ToastItem } from "@/lib/toast";
import type { TabId, AuthState } from "@/types";

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [connected, setConnected] = useState(false);
  const [connectionFailed, setConnectionFailed] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const pollAuth = useCallback(() => {
    getAuthState().then(setAuth).catch(() => {});
    isConnected().then(setConnected).catch(() => {});
  }, []);

  useEffect(() => {
    pollAuth();
    getConfig().then((config) => applyTheme(config.settings.theme, config.settings.accent_color)).catch(() => {});
    const unsub = subscribeToasts(setToasts);
    const authPoll = setInterval(pollAuth, 2000);
    const failTimer = setTimeout(() => {
      setConnectionFailed(true);
    }, 10000);
    return () => {
      unsub();
      clearInterval(authPoll);
      clearTimeout(failTimer);
    };
  }, [pollAuth]);

  useEffect(() => {
    if (connected) {
      setConnectionFailed(false);
    }
  }, [connected]);

  const handleRetry = async () => {
    setReconnecting(true);
    setConnectionFailed(false);
    try {
      await reconnect();
    } catch (e) {
      console.error("Reconnect failed:", e);
    } finally {
      setReconnecting(false);
    }
  };

  if (!connected || !auth?.authenticated) {
    return (
      <div className="flex h-screen flex-col">
        <TitleBar />
        <LoginPage
          connected={connected}
          connectionFailed={connectionFailed}
          reconnecting={reconnecting}
          onRetry={handleRetry}
          onLoginSuccess={() => {
            getAuthState().then(setAuth).catch(() => {});
          }}
        />
        <ToastContainer toasts={toasts} />
    </div>
  );
}
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <TitleBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          auth={auth}
          onLogout={() => {
            setAuth({ authenticated: false, username: null, avatar_url: null, token: null });
          }}
        />
        <main className="flex-1 overflow-auto">
          <div className={"h-full" + (activeTab === "dashboard" ? "" : " hidden")}>
            <Dashboard />
          </div>
          <div className={"h-full" + (activeTab === "injection" ? "" : " hidden")}>
            <InjectionPage
              selectedDevice={selectedDevice}
              onDeviceChange={setSelectedDevice}
            />
          </div>
          <div className={"h-full" + (activeTab === "logs" ? "" : " hidden")}>
            <LogsPage />
          </div>
          <div className={"h-full" + (activeTab === "marketplace" ? "" : " hidden")}>
            <Marketplace />
          </div>
          <div className={"h-full" + (activeTab === "settings" ? "" : " hidden")}>
            <SettingsPage />
          </div>
        </main>
      </div>

      <ToastContainer toasts={toasts} />
    </div>
  );
}


function ToastContainer({ toasts }: { toasts: ToastItem[] }) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          onClick={() => dismissToast(t.id)}
          className={
            "pointer-events-auto cursor-pointer rounded-lg border-2 px-4 py-3 text-sm shadow-xl animate-fade-in bg-card " +
            (t.type === "success"
              ? "border-green-500 text-green-400"
              : t.type === "error"
                ? "border-red-500 text-red-400"
                : "border-primary text-primary")
          }
        >
          <div className="flex items-center gap-2">
            <span className="font-medium">{t.message}</span>
          </div>
        </div>
      ))}
    </div>
  );
