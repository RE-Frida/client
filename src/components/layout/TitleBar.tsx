import { Minus, Square, X, Zap } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";

export function TitleBar() {
  const appWindow = getCurrentWindow();

  return (
    <div
      data-tauri-drag-region
      className="flex h-8 select-none items-center justify-between border-b border-border bg-sidebar px-2"
    >
      <div className="flex items-center gap-2" data-tauri-drag-region>
        <Zap className="h-4 w-4 text-primary" />
        <span className="text-xs font-medium text-sidebar-foreground" data-tauri-drag-region>
          RE:Frida
        </span>
      </div>
      <div className="flex items-center">
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
