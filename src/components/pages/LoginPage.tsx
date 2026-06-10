import { useState } from "react";
import { Loader2, LogIn, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { startLogin } from "@/hooks/tauri";
import { FridaLogo } from "@/components/ui/FridaLogo";

interface LoginPageProps {
  connected: boolean;
  connectionFailed: boolean;
  reconnecting: boolean;
  clientVersionError?: string | null;
  onRetry: () => void;
  onLoginSuccess: () => void;
}

export function LoginPage({ connected, connectionFailed, reconnecting, clientVersionError, onRetry, onLoginSuccess }: LoginPageProps) {
  const [loggingIn, setLoggingIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    setLoggingIn(true);
    setError(null);
    try {
      await startLogin();
      onLoginSuccess();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoggingIn(false);
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-6 rounded-2xl border border-border bg-card p-10 shadow-lg">
        <div className="flex items-center gap-3">
          <FridaLogo className="h-10 w-10 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">RE:Frida</h1>
            <p className="text-sm text-muted-foreground">Android Reverse Engineering</p>
          </div>
        </div>

        {!connected && !connectionFailed ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Connecting to server...</p>
          </div>
        ) : !connected && connectionFailed ? (
          <div className="flex flex-col items-center gap-4">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <div className="text-center">
              {clientVersionError ? (
                <>
                  <p className="text-sm font-medium text-destructive">Client update required</p>
                  <p className="text-xs text-muted-foreground mt-1">{clientVersionError}</p>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium text-destructive">Failed to connect to server</p>
                  <p className="text-xs text-muted-foreground mt-1">Please check your internet connection and try again</p>
                </>
              )}
            </div>
            <Button onClick={onRetry} disabled={reconnecting} size="lg" className="gap-2">
              {reconnecting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {reconnecting ? "Reconnecting..." : "Retry Connection"}
            </Button>
            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <p className="text-sm text-muted-foreground">
              Sign in with Discord to continue
            </p>
            <Button
              onClick={handleLogin}
              disabled={loggingIn}
              size="lg"
              className="gap-2"
            >
              {loggingIn ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LogIn className="h-4 w-4" />
              )}
              {loggingIn ? "Logging in..." : "Login with Discord"}
            </Button>
            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
