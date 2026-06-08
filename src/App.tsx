import { useState, useCallback } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Dashboard } from "@/components/pages/Dashboard";
import { LogsPage } from "@/components/pages/LogsPage";
import { Marketplace } from "@/components/pages/MarketplacePage";
import { EditorPage } from "@/components/pages/EditorPage";
import { SettingsPage } from "@/components/pages/SettingsPage";
import type { TabId } from "@/types";

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");

  const addLog = useCallback((_msg: string) => {
    // logs are managed per-page now
  }, []);

  const renderContent = () => {
    switch (activeTab) {
      case "dashboard":
        return <Dashboard onLog={addLog} />;
      case "logs":
        return <LogsPage />;
      case "marketplace":
        return <Marketplace onUseScript={(_code) => {
          addLog("Script loaded from marketplace");
          setActiveTab("dashboard");
        }} />;
      case "editor":
        return <EditorPage onLog={addLog} />;
      case "settings":
        return <SettingsPage onLog={addLog} />;
      default:
        return <Dashboard onLog={addLog} />;
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="flex-1 overflow-auto">
        {renderContent()}
      </main>
    </div>
  );
}
