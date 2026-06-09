import { useState, useEffect, useCallback } from "react";
import { User, Wifi, WifiOff } from "lucide-react";
import { getAuthState, isConnected } from "@/hooks/tauri";
import { FridaLogo } from "@/components/ui/FridaLogo";
import type { AuthState } from "@/types";

export function Dashboard() {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [connected, setConnected] = useState(false);

  const poll = useCallback(() => {
    getAuthState().then(setAuth).catch(() => {});
    isConnected().then(setConnected).catch(() => {});
  }, []);

  useEffect(() => {
    poll();
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [poll]);

  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="flex w-full max-w-lg flex-col items-center gap-10">
        {/* Logo + Title */}
        <div className="flex flex-col items-center gap-3">
          <FridaLogo className="h-12 w-12 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">RE:Frida</h1>
          <p className="text-sm text-muted-foreground">
            Android reverse-engineering toolkit
          </p>
        </div>

        {/* Account Card */}
        <div className="w-full rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="relative h-14 w-14 shrink-0">
              {auth?.authenticated && auth?.avatar_url ? (
                <img
                  src={auth.avatar_url}
                  alt="avatar"
                  className="h-full w-full rounded-full object-cover ring-2 ring-primary/20"
                  onError={(e) => {
                    (e.target as HTMLImageElement).classList.add("hidden");
                    (e.target as HTMLImageElement).parentElement!.querySelector(".fallback")?.classList.remove("hidden");
                  }}
                />
              ) : null}
              <div
                className={
                  "fallback flex h-full w-full items-center justify-center rounded-full bg-muted ring-2 ring-primary/20" +
                  (auth?.authenticated && auth?.avatar_url ? " hidden" : "")
                }
              >
                <User className="h-6 w-6 text-muted-foreground" />
              </div>
              {auth?.authenticated && (
                <span className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full border-2 border-card bg-green-500" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              {auth?.authenticated ? (
                <>
                  <h2 className="text-lg font-semibold truncate">{auth.username}</h2>
                  <p className="text-xs text-muted-foreground">Discord</p>
                </>
              ) : (
                <>
                  <h2 className="text-lg font-semibold">Not logged in</h2>
                  <p className="text-xs text-muted-foreground">Connect Discord to continue</p>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Connection Status */}
        <div className="w-full rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <div
              className={
                "flex h-12 w-12 items-center justify-center rounded-full " +
                (connected
                  ? "bg-green-500/10 text-green-500"
                  : "bg-red-500/10 text-red-500")
              }
            >
              {connected ? (
                <Wifi className="h-5 w-5" />
              ) : (
                <WifiOff className="h-5 w-5" />
              )}
            </div>
            <div>
              <h2 className="text-lg font-semibold">
                {connected ? "Connected" : "Disconnected"}
              </h2>
              <p className="text-xs text-muted-foreground">
                {connected
                  ? "WebSocket connection established"
                  : "Unable to reach server"}
              </p>
            </div>
            <div className="ml-auto">
              <span
                className={
                  "inline-flex h-2.5 w-2.5 rounded-full " +
                  (connected ? "bg-green-500" : "bg-red-500")
                }
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
