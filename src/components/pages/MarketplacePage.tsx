import { useState } from "react";
import {
  Search, Download, ThumbsUp, ThumbsDown, User, ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ScriptItem } from "@/types";

const MOCK_SCRIPTS: ScriptItem[] = [
  {
    id: "1",
    name: "SSL Pinning Bypass",
    description: "Bypass SSL certificate pinning on Android applications",
    author: "RE:Frida Team",
    category: "Security",
    downloads: 15420,
    upvotes: 342,
    downvotes: 12,
    user_vote: null,
    code: "// SSL Pinning Bypass\nJava.perform(function() {\n  var TrustManager = Java.registerClass({\n    name: 'com.custom.TrustManager',\n    implements: [Java.use('javax.net.ssl.X509TrustManager')],\n    methods: {\n      checkClientTrusted: function(chain, authType) {},\n      checkServerTrusted: function(chain, authType) {},\n      getAcceptedIssuers: function() { return []; }\n    }\n  });\n});",
  },
  {
    id: "2",
    name: "Root Detection Bypass",
    description: "Bypass common root detection methods",
    author: "SecurityX",
    category: "Anti-Fraud",
    downloads: 8930,
    upvotes: 189,
    downvotes: 5,
    user_vote: null,
    code: "// Root Detection Bypass\nJava.perform(function() {\n  var RootBeer = Java.use('com.scottyab.rootbeer.RootBeer');\n  RootBeer.isRooted.implementation = function() {\n    return false;\n  };\n});",
  },
  {
    id: "3",
    name: "Frida Logger",
    description: "Log all Java method calls in real-time",
    author: "DebugMaster",
    category: "Debugging",
    downloads: 6210,
    upvotes: 134,
    downvotes: 8,
    user_vote: null,
    code: "// Method Logger\nJava.perform(function() {\n  var Activity = Java.use('android.app.Activity');\n  Activity.onResume.implementation = function() {\n    console.log('[*] onResume: ' + this.getClass().getName());\n    this.onResume();\n  };\n});",
  },
];

interface MarketplaceProps {
  onUseScript: (code: string) => void;
}

export function Marketplace({ onUseScript }: MarketplaceProps) {
  const [scripts] = useState<ScriptItem[]>(MOCK_SCRIPTS);
  const [search, setSearch] = useState("");
  const [selectedScript, setSelectedScript] = useState<ScriptItem | null>(null);

  const filtered = scripts.filter(
    (s) =>
      !search ||
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.description.toLowerCase().includes(search.toLowerCase())
  );

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

      <div className="grid flex-1 grid-cols-3 gap-4">
        <ScrollArea className="col-span-2">
          <div className="space-y-3 pr-4">
            {filtered.map((script) => (
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
            ))}
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
                    onClick={() => onUseScript(selectedScript.code)}
                  >
                    Use Script
                  </Button>
                  <Button variant="outline" size="icon">
                    <ThumbsUp className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon">
                    <ThumbsDown className="h-4 w-4" />
                  </Button>
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
