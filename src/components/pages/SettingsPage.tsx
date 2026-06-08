import { useState, useEffect } from "react";
import {
  Moon, Sun, Monitor, Server, Wifi, Package, Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getConfig, saveConfig } from "@/hooks/tauri";
import type { AppConfig } from "@/types";

interface SettingsPageProps {
  onLog: (msg: string) => void;
}

export function SettingsPage({ onLog }: SettingsPageProps) {
  const [config, setConfig] = useState<AppConfig>({
    theme: "dark",
    server_url: "",
    frida_port: 27042,
    custom_package: "",
    advanced_mode: false,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getConfig()
      .then(setConfig)
      .catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveConfig(config);
      onLog("Settings saved");
    } catch (e) {
      onLog("Failed to save settings: " + e);
    } finally {
      setSaving(false);
    }
  };

  const themes = [
    { id: "dark", label: "Dark", icon: Moon },
    { id: "light", label: "Light", icon: Sun },
    { id: "system", label: "System", icon: Monitor },
  ];

  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <div>
        <h2 className="text-2xl font-bold">Settings</h2>
        <p className="text-sm text-muted-foreground">Configure RE:Frida</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Monitor className="h-4 w-4" />
              Appearance
            </CardTitle>
            <CardDescription>Choose your preferred theme</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              {themes.map((theme) => {
                const Icon = theme.icon;
                return (
                  <button
                    key={theme.id}
                    onClick={() => setConfig({ ...config, theme: theme.id })}
                    className={
                      "flex flex-1 flex-col items-center gap-2 rounded-lg border p-4 text-sm transition-colors " +
                      (config.theme === theme.id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-accent")
                    }
                  >
                    <Icon className="h-5 w-5" />
                    {theme.label}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Server className="h-4 w-4" />
              Server
            </CardTitle>
            <CardDescription>Backend connection settings</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Server URL
              </label>
              <Input
                value={config.server_url}
                onChange={(e) =>
                  setConfig({ ...config, server_url: e.target.value })
                }
                placeholder="wss://refrida.rawnullbyte.com"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wifi className="h-4 w-4" />
              Frida
            </CardTitle>
            <CardDescription>Frida connection settings</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Port
              </label>
              <Input
                type="number"
                value={config.frida_port}
                onChange={(e) =>
                  setConfig({ ...config, frida_port: parseInt(e.target.value) || 27042 })
                }
                placeholder="27042"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Package className="h-4 w-4" />
              Target
            </CardTitle>
            <CardDescription>Default target application</CardDescription>
          </CardHeader>
          <CardContent>
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Package ID
              </label>
              <Input
                value={config.custom_package}
                onChange={(e) =>
                  setConfig({ ...config, custom_package: e.target.value })
                }
                placeholder="com.target.app"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          <Save className="mr-2 h-4 w-4" />
          {saving ? "Saving..." : "Save Settings"}
        </Button>
      </div>
    </div>
  );
}
