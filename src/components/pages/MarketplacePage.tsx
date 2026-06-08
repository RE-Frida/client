import { useState, useEffect, useCallback } from "react";
import {
  Search, Download, ThumbsUp, ThumbsDown, User, ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { listScripts, voteScript, downloadScript, getAuthState } from "@/hooks/tauri";
import type { ScriptData, AuthState } from "@/types";

interface MarketplaceProps {
  onUseScript: (code: string) => void;
}

export function Marketplace({ onUseScript }: MarketplaceProps) {
  const [scripts, setScripts] = useState<ScriptData[]>([]);
  const [search, setSearch] = useState("");
  const [selectedScript, setSelectedScript] = useState<ScriptData | null>(null);
  const [loading, setLoading] = useState(true);
  const [auth, setAuth] = useState<AuthState | null>(null);

  const fetchScripts = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listScripts(search || undefined);
      setScripts(result);
    } catch (e) {
      console.error("Failed to fetch scripts:", e);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    getAuthState().then(setAuth).catch(() => {});
  }, []);

  useEffect(() => {
    fetchScripts();
  }, [fetchScripts]);

  const handleVote = async (scriptId: string, upvote: boolean) => {
    if (!auth?.authenticated) return;
    try {
      await voteScript(scriptId, upvote);
      await fetchScripts();
    } catch (e) {
      console.error("Vote failed:", e);
    }
  };

  const handleDownload = async (script: ScriptData) => {
    try {
      await downloadScript(script.id);
    } catch (e) {
      console.error("Download failed:", e);
    }
  };

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Marketplace</h2>
          <p className="text-sm text-muted-foreground">Browse and use community scripts</p>
        </div>
        <Button variant="outline" size="sm">
          <ExternalLink className="mr-2 h-4 w-4" />
          Open Console
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search scripts..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {!auth?.authenticated && (
        <Card className="border-warning">
          <CardContent className="py-3 text-sm text-muted-foreground">
            Login with Discord to browse and vote on scripts
          </CardContent>
        </Card>
      )}

      <div className="grid flex-1 grid-cols-3 gap-4">
        <ScrollArea className="col-span-2">
          <div className="space-y-3 pr-4">
            {loading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                Loading scripts...
              </div>
            ) : scripts.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                No scripts found
              </div>
            ) : (
              scripts.map((script) => (
                <Card
                  key={script.id}
                  className={
                    "cursor-pointer transition-colors hover:border-primary/50 " +
                    (selectedScript?.id === script.id ? "border-primary" : "")
                  }
                  onClick={() => setSelectedScript(script)}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-base">{script.name}</CardTitle>
                        <CardDescription className="mt-1">
                          {script.description}
                        </CardDescription>
                      </div>
                      <Badge variant="secondary">{script.category}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {script.author}
                      </span>
                      <span className="flex items-center gap-1">
                        <Download className="h-3 w-3" />
                        {script.downloads.toLocaleString()}
                      </span>
                      <span className="flex items-center gap-1">
                        <ThumbsUp className="h-3 w-3" />
                        {script.upvotes}
                      </span>
                      <span className="flex items-center gap-1">
                        <ThumbsDown className="h-3 w-3" />
                        {script.downvotes}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </ScrollArea>

        <Card className="col-span-1 flex flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {selectedScript ? selectedScript.name : "Script Preview"}
            </CardTitle>
            <CardDescription>
              {selectedScript ? selectedScript.description : "Select a script"}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-3">
            {selectedScript ? (
              <>
                <pre className="flex-1 overflow-auto rounded bg-muted p-3 text-xs font-mono">
                  {selectedScript.code}
                </pre>
                <div className="flex gap-2">
                  <Button
                    className="flex-1"
                    onClick={() => {
                      handleDownload(selectedScript);
                      onUseScript(selectedScript.code);
                    }}
                  >
                    Use Script
                  </Button>
                  {auth?.authenticated && (
                    <>
                      <Button
                        variant={selectedScript.user_vote === true ? "default" : "outline"}
                        size="icon"
                        onClick={() => handleVote(selectedScript.id, true)}
                      >
                        <ThumbsUp className="h-4 w-4" />
                      </Button>
                      <Button
                        variant={selectedScript.user_vote === false ? "destructive" : "outline"}
                        size="icon"
                        onClick={() => handleVote(selectedScript.id, false)}
                      >
                        <ThumbsDown className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center text-muted-foreground">
                <p className="text-sm">Select a script to preview</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
