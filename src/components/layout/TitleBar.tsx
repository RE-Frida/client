import { useState, useEffect } from "react";
import { Minus, Square, X } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getVersion } from "@tauri-apps/api/app";
import { FridaLogo } from "@/components/ui/FridaLogo";

export function TitleBar() {
  const appWindow = getCurrentWindow();
  const [version, setVersion] = useState("");

  useEffect(() => {
    const cached = localStorage.getItem("refrida_version");
    if (cached) {
      setVersion(cached);
    }
    (async () => {
      try {
        const v = await getVersion();
        setVersion(v);
        localStorage.setItem("refrida_version", v);
      } catch {
        // ignore
      }
    })();
  }, []);

  return (
    <div className="flex h-8 select-none items-center justify-between border-b border-border bg-sidebar px-2">
      <div data-tauri-drag-region className="flex h-full flex-1 items-center gap-2">
        <FridaLogo className="h-4 w-4" />
        <span className="text-xs font-medium text-sidebar-foreground/80">
          RE:Frida{version ? ` v${version}` : ""}
        </span>
      </div>
      <div className="flex items-center gap-2">
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
