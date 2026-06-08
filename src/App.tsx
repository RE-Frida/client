import { useState, useEffect, useCallback } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { TitleBar } from "@/components/layout/TitleBar";
import { Dashboard } from "@/components/pages/Dashboard";
import { LogsPage } from "@/components/pages/LogsPage";
import { Marketplace } from "@/components/pages/MarketplacePage";
import { EditorPage } from "@/components/pages/EditorPage";
import { SettingsPage } from "@/components/pages/SettingsPage";
import { LoginPage } from "@/components/pages/LoginPage";
import { getAuthState, isConnected, discoverDevices } from "@/hooks/tauri";
import type { TabId, AuthState, DeviceInfo } from "@/types";

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [connected, setConnected] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [devices, setDevices] = useState<DeviceInfo[]>([]);

  const pollAuth = useCallback(() => {
    getAuthState().then(setAuth).catch(() => {});
    isConnected().then(setConnected).catch(() => {});
  }, []);

  const pollDevices = useCallback(() => {
    discoverDevices().then((devs) => {
      setDevices(devs);
      if (devs.length > 0 && !selectedDevice) {
        setSelectedDevice(devs[0].id);
      }
      if (selectedDevice && !devs.find((d) => d.id === selectedDevice)) {
        setSelectedDevice(devs.length > 0 ? devs[0].id : null);
      }
    }).catch(() => {});
  }, [selectedDevice]);

  useEffect(() => {
    pollAuth();
    const authPoll = setInterval(pollAuth, 2000);
    return () => clearInterval(authPoll);
  }, [pollAuth]);

  useEffect(() => {
    if (auth?.authenticated) {
      pollDevices();
      const devicePoll = setInterval(pollDevices, 5000);
      return () => clearInterval(devicePoll);
    }
  }, [auth?.authenticated, pollDevices]);

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

  const renderContent = () => {
    switch (activeTab) {
      case "dashboard":
        return <Dashboard selectedDevice={selectedDevice} />;
      case "logs":
        return <LogsPage />;
      case "marketplace":
        return <Marketplace onUseScript={(_code) => setActiveTab("dashboard")} />;
      case "editor":
        return <EditorPage onLog={() => {}} />;
      case "settings":
        return <SettingsPage />;
      default:
        return <Dashboard selectedDevice={selectedDevice} />;
    }
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <TitleBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          auth={auth}
          devices={devices}
          selectedDevice={selectedDevice}
          onDeviceChange={setSelectedDevice}
          onLogout={() => {
            setAuth({ authenticated: false, username: null, avatar_url: null, token: null });
          }}
        />
        <main className="flex-1 overflow-auto">
          {renderContent()}
        </main>
      </div>
    </div>
  );
}
