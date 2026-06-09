import { useState, useEffect } from "react";
import {
  Moon, Sun, Monitor, Wifi, Package, Save, Palette,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getConfig, saveConfig } from "@/hooks/tauri";
import { applyTheme, ACCENT_PRESETS } from "@/lib/theme";
import type { AppConfig } from "@/types";

export function SettingsPage() {
  const [config, setConfig] = useState<AppConfig>({
    settings: { theme: "dark", frida_port: 27042, custom_package: "org.refrida.apk", advanced_mode: false },
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

  const themeGroups = [
    {
      label: "Standard",
      themes: [
        { id: "dark", label: "Dark", icon: Moon },
        { id: "light", label: "Light", icon: Sun },
        { id: "system", label: "System", icon: Monitor },
      ],
    },
    {
      label: "Community",
      themes: [
        { id: "catppuccin", label: "Catppuccin", icon: Palette },
        { id: "tokyo-night", label: "Tokyo Night", icon: Palette },
        { id: "rose-pine", label: "Rose Pine", icon: Palette },
        { id: "kawaii", label: "Kawaii", icon: Palette },
        { id: "nord", label: "Nord", icon: Palette },
        { id: "gruvbox", label: "Gruvbox", icon: Palette },
        { id: "dracula", label: "Dracula", icon: Palette },
        { id: "solarized-dark", label: "Solarized", icon: Palette },
      ],
    },
  ];

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-4 pb-8">
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
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Palette className="h-4 w-4" />
              Appearance
            </CardTitle>
            <CardDescription>Choose your preferred theme</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {themeGroups.map((group) => (
              <div key={group.label}>
                <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {group.label}
                </p>
                <div className="flex flex-wrap gap-2">
                  {group.themes.map((theme) => {
                    const Icon = theme.icon;
                    return (
                      <button
                        key={theme.id}
                        onClick={() => {
                          const newSettings = { ...config.settings, theme: theme.id };
                          setConfig({ ...config, settings: newSettings });
                          applyTheme(theme.id, newSettings.accent_color, newSettings.background_image);
                        }}
                        className={
                          "flex flex-col items-center gap-2 rounded-lg border p-3 text-sm transition-colors min-w-[90px] " +
                          (config.settings.theme === theme.id
                            ? "border-primary bg-primary/10"
                            : "border-border hover:bg-accent")
                        }
                      >
                        <Icon className="h-5 w-5" />
                        <span className="text-xs">{theme.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Background Image
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {config.settings.background_image ? (
                  <span className="max-w-[200px] truncate text-xs text-muted-foreground">
                    {config.settings.background_image.split("/").pop()}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">None</span>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={async () => {
                    const { open } = await import("@tauri-apps/plugin-dialog");
                    const selected = await open({
                      multiple: false,
                      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp"] }],
                    });
                    if (selected) {
                      const newSettings = { ...config.settings, background_image: selected };
                      setConfig({ ...config, settings: newSettings });
                      applyTheme(config.settings.theme, newSettings.accent_color, selected);
                    }
                  }}
                >
                  {config.settings.background_image ? "Change" : "Select Image"}
                </Button>
                {config.settings.background_image && (
                  <button
                    onClick={() => {
                      const newSettings = { ...config.settings, background_image: undefined };
                      setConfig({ ...config, settings: newSettings });
                      applyTheme(config.settings.theme, newSettings.accent_color);
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Accent Color
              </p>
                <div className="flex flex-wrap items-center gap-2">
                  {ACCENT_PRESETS.map((preset) => (
                    <button
                      key={preset.value}
                      onClick={() => {
                        const newSettings = { ...config.settings, accent_color: preset.value };
                        setConfig({ ...config, settings: newSettings });
                        applyTheme(config.settings.theme, preset.value, newSettings.background_image);
                      }}
                      className={
                        "h-7 w-7 rounded-full border-2 transition-transform hover:scale-110 " +
                        (config.settings.accent_color === preset.value
                          ? "border-foreground scale-110"
                          : "border-transparent")
                      }
                      style={{ backgroundColor: preset.value }}
                      title={preset.name}
                    />
                  ))}
                  <input
                    type="color"
                    value={config.settings.accent_color || "#ef6456"}
                    onChange={(e) => {
                      const newSettings = { ...config.settings, accent_color: e.target.value };
                      setConfig({ ...config, settings: newSettings });
                      applyTheme(config.settings.theme, e.target.value, newSettings.background_image);
                    }}
                    className="h-7 w-7 cursor-pointer rounded-full border-0 p-0"
                  />
                  {config.settings.accent_color && config.settings.accent_color !== "#ef6456" && (
                    <button
                      onClick={() => {
                        const newSettings = { ...config.settings, accent_color: "#ef6456" };
                        setConfig({ ...config, settings: newSettings });
                        applyTheme(config.settings.theme, "#ef6456", newSettings.background_image);
                      }}
                      className="text-xs text-muted-foreground hover:text-foreground ml-1"
                    >
                      Reset
                    </button>
                  )}
                </div>
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
                    placeholder="org.refrida.apk"
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
