import { useState, useEffect, useRef } from "react";
import { Trash2, Download, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getLogs, clearLogs } from "@/hooks/tauri";

export function LogsPage() {
  const [logs, setLogs] = useState("");
  const [filter, setFilter] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const content = await getLogs();
        setLogs(content);
      } catch {
        // ignore
      }
    }, 500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const filteredLines = logs.split("\n").filter((line) =>
    filter ? line.toLowerCase().includes(filter.toLowerCase()) : true
  );

  const handleClear = async () => {
    await clearLogs();
    setLogs("");
  };

  const handleExport = () => {
    const blob = new Blob([logs], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "re-frida-logs-" + new Date().toISOString().slice(0, 10) + ".txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Logs</h2>
          <p className="text-sm text-muted-foreground">Real-time session output</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          <Button variant="outline" size="sm" onClick={handleClear}>
            <Trash2 className="mr-2 h-4 w-4" />
            Clear
          </Button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Filter logs..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="pl-9"
        />
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-auto rounded-lg border bg-card p-4 font-mono text-xs"
      >
        {filteredLines.length === 0 || (filteredLines.length === 1 && !filteredLines[0]) ? (
          <p className="text-muted-foreground">No logs yet. Start a session to see output.</p>
        ) : (
          filteredLines.map((line, i) => (
            <div
              key={i}
              className={
                "whitespace-pre-wrap break-all py-px " +
                (line.includes("[ERROR]") || line.includes("error")
                  ? "text-destructive"
                  : line.includes("[WARN]")
                    ? "text-warning"
                    : line.includes("[*]")
                      ? "text-primary"
                      : "text-foreground")
              }
            >
              {line}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
