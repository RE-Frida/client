import { useState, useEffect } from "react";
import {
  Moon, Sun, Monitor, Wifi, Package, Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getConfig, saveConfig } from "@/hooks/tauri";
import type { AppConfig } from "@/types";

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

export function SettingsPage() {
  const [config, setConfig] = useState<AppConfig>({
    settings: { theme: "dark", frida_port: 27042, custom_package: "", advanced_mode: false },
    auth: {},
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getConfig().then(setConfig).catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveConfig(config);
    } catch (e) {
      console.error("Failed to save:", e);
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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Settings</h2>
          <p className="text-sm text-muted-foreground">Configure RE:Frida</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() =>
              setConfig({ ...config, settings: { ...config.settings, advanced_mode: !config.settings.advanced_mode } })
            }
            className="flex items-center gap-2 text-sm"
          >
            <span className={config.settings.advanced_mode ? "text-muted-foreground" : "font-medium"}>
              Basic
            </span>
            <div
              className={`relative h-5 w-9 rounded-full transition-colors ${
                config.settings.advanced_mode ? "bg-primary" : "bg-muted"
              }`}
            >
              <div
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                  config.settings.advanced_mode ? "translate-x-4" : "translate-x-0.5"
                }`}
              />
            </div>
            <span className={config.settings.advanced_mode ? "font-medium" : "text-muted-foreground"}>
              Advanced
            </span>
          </button>
          <Button onClick={handleSave} disabled={saving} size="sm">
            <Save className="mr-1.5 h-3.5 w-3.5" />
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
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
                    onClick={() => {
                      setConfig({ ...config, settings: { ...config.settings, theme: theme.id } });
                      applyTheme(theme.id);
                    }}
                    className={
                      "flex flex-1 flex-col items-center gap-2 rounded-lg border p-4 text-sm transition-colors " +
                      (config.settings.theme === theme.id
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

        {config.settings.advanced_mode && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Wifi className="h-4 w-4" />
                  Frida
                </CardTitle>
                <CardDescription>Frida connection settings</CardDescription>
              </CardHeader>
              <CardContent>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">
                    Port
                  </label>
                  <Input
                    type="number"
                    value={config.settings.frida_port}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        settings: { ...config.settings, frida_port: parseInt(e.target.value) || 27042 },
                      })
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
                    value={config.settings.custom_package}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        settings: { ...config.settings, custom_package: e.target.value },
                      })
                    }
                    placeholder="com.target.app"
                  />
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
