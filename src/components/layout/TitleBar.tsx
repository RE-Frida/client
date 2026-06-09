import { useState, useEffect } from "react";
import { Minus, Square, X } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { FridaLogo } from "@/components/ui/FridaLogo";

export function TitleBar() {
  const appWindow = getCurrentWindow();
  const [version, setVersion] = useState("");

  useEffect(() => {
    const cached = localStorage.getItem("refrida_version");
    if (cached) {
      setVersion(cached);
    }
    fetch("https://api.github.com/repos/RE-Frida/client/releases/latest", {
      headers: { Accept: "application/vnd.github.v3+json" },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.tag_name) {
          const v = data.tag_name.replace(/^v/, "");
          setVersion(v);
          localStorage.setItem("refrida_version", v);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div className="flex h-8 select-none items-center justify-between border-b border-border bg-sidebar px-2">
      <div data-tauri-drag-region className="flex h-full flex-1 items-center gap-2">
        <FridaLogo className="h-4 w-4 text-primary" />
      </div>
      <div className="flex items-center gap-2">
        {version && (
          <span className="text-[10px] text-muted-foreground">v{version}</span>
        )}
        <button
          onClick={() => appWindow.minimize()}
          className="flex h-8 w-8 items-center justify-center text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => appWindow.toggleMaximize()}
          className="flex h-8 w-8 items-center justify-center text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
        >
          <Square className="h-3 w-3" />
        </button>
        <button
          onClick={() => appWindow.close()}
          className="flex h-8 w-8 items-center justify-center text-muted-foreground hover:bg-destructive hover:text-destructive-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
