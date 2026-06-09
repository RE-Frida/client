import { useState, useEffect, useCallback } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { TitleBar } from "@/components/layout/TitleBar";
import { Dashboard } from "@/components/pages/Dashboard";
import { InjectionPage } from "@/components/pages/InjectionPage";
import { LogsPage } from "@/components/pages/LogsPage";
import { Marketplace } from "@/components/pages/MarketplacePage";
import { SettingsPage } from "@/components/pages/SettingsPage";
import { LoginPage } from "@/components/pages/LoginPage";
import { getAuthState, isConnected, getConfig } from "@/hooks/tauri";
import type { TabId, AuthState } from "@/types";

function applyTheme(theme: string) {
  if (theme === "light") {
    document.documentElement.setAttribute("data-theme", "light");
  } else if (theme === "system") {
    const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [connected, setConnected] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);

  const pollAuth = useCallback(() => {
    getAuthState().then(setAuth).catch(() => {});
    isConnected().then(setConnected).catch(() => {});
  }, []);

  useEffect(() => {
    pollAuth();
    getConfig().then((config) => applyTheme(config.theme)).catch(() => {});
    const authPoll = setInterval(pollAuth, 2000);
    return () => clearInterval(authPoll);
  }, [pollAuth]);

  if (!connected || !auth?.authenticated) {
    return (
      <div className="flex h-screen flex-col">
        <TitleBar />
        <LoginPage
          connected={connected}
          onLoginSuccess={() => {
            getAuthState().then(setAuth).catch(() => {});
          }}
        />
      </div>
    );
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
            <Dashboard
              selectedDevice={selectedDevice}
              onDeviceChange={setSelectedDevice}
            />
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
    </div>
  );
}
