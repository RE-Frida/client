import { useState } from "react";
import {
  FileCode2, FolderOpen, FolderTree, Save, Play, Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";

interface FileNode {
  name: string;
  type: "file" | "folder";
  children?: FileNode[];
  content?: string;
}

const INITIAL_TREE: FileNode[] = [
  {
    name: "scripts",
    type: "folder",
    children: [
      { name: "bypass-ssl.js", type: "file", content: "// SSL Pinning Bypass\nJava.perform(function() {\n  // Your code here\n});" },
      { name: "hooks", type: "folder", children: [
        { name: "crypto.js", type: "file", content: "// Crypto hooks\nJava.perform(function() {\n  var Cipher = Java.use('javax.crypto.Cipher');\n  Cipher.doFinal.overload('[B').implementation = function(input) {\n    console.log('[*] Cipher.doFinal called');\n    return this.doFinal(input);\n  };\n});" },
      ]},
    ],
  },
];

interface EditorPageProps {
  onLog: (msg: string) => void;
}

export function EditorPage({ onLog }: EditorPageProps) {
  const [tree, setTree] = useState<FileNode[]>(INITIAL_TREE);
  const [selectedFile, setSelectedFile] = useState<FileNode | null>(null);
  const [code, setCode] = useState("");
  const [newFileName, setNewFileName] = useState("");

  const findFile = (nodes: FileNode[], name: string): FileNode | null => {
    for (const node of nodes) {
      if (node.name === name && node.type === "file") return node;
      if (node.children) {
        const found = findFile(node.children, name);
        if (found) return found;
      }
    }
    return null;
  };

  const selectFile = (node: FileNode) => {
    if (node.type === "file") {
      setSelectedFile(node);
      setCode(node.content || "");
    }
  };

  const addFile = () => {
    if (!newFileName) return;
    const name = newFileName.endsWith(".js") ? newFileName : newFileName + ".js";
    const newFile: FileNode = { name, type: "file", content: "// New script\n" };
    setTree((prev) => [...prev, newFile]);
    setNewFileName("");
    onLog("Created " + name);
  };

  const saveFile = () => {
    if (!selectedFile) return;
    selectedFile.content = code;
    onLog("Saved " + selectedFile.name);
  };

  const renderTree = (nodes: FileNode[], depth = 0) => {
    return nodes.map((node) => (
      <div key={node.name} style={{ paddingLeft: depth * 16 }}>
        <button
          onClick={() => selectFile(node)}
          className={
            "flex w-full items-center gap-2 rounded px-2 py-1 text-sm transition-colors " +
            (selectedFile?.name === node.name
              ? "bg-accent text-accent-foreground"
              : "hover:bg-accent/50")
          }
        >
          {node.type === "folder" ? (
            <FolderOpen className="h-4 w-4 text-muted-foreground" />
          ) : (
            <FileCode2 className="h-4 w-4 text-primary" />
          )}
          <span className="truncate">{node.name}</span>
        </button>
        {node.children && renderTree(node.children, depth + 1)}
      </div>
    ));
  };

  return (
    <div className="flex h-full gap-0">
      {/* File Tree */}
      <div className="flex w-64 flex-col border-r border-border bg-sidebar">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <FolderTree className="h-4 w-4" />
            Explorer
          </div>
          <Button variant="ghost" size="icon" className="h-6 w-6">
            <Plus className="h-3 w-3" />
          </Button>
        </div>
        <ScrollArea className="flex-1 p-2">
          {renderTree(tree)}
        </ScrollArea>
        <div className="border-t border-border p-2">
          <div className="flex gap-1">
            <Input
              placeholder="filename.js"
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              className="h-7 text-xs"
              onKeyDown={(e) => e.key === "Enter" && addFile()}
            />
            <Button size="sm" className="h-7 px-2" onClick={addFile}>
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>

      {/* Editor */}
      <div className="flex flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <div className="flex items-center gap-2 text-sm">
            <FileCode2 className="h-4 w-4 text-primary" />
            {selectedFile ? selectedFile.name : "No file open"}
          </div>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={saveFile} disabled={!selectedFile}>
              <Save className="mr-1 h-3 w-3" />
              Save
            </Button>
            <Button variant="ghost" size="sm" disabled={!selectedFile}>
              <Play className="mr-1 h-3 w-3" />
              Run
            </Button>
          </div>
        </div>
        <div className="flex-1">
          {selectedFile ? (
            <Textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="h-full resize-none rounded-none border-0 font-mono text-xs focus-visible:ring-0"
              placeholder="Write your Frida script..."
            />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <div className="text-center">
                <FileCode2 className="mx-auto h-12 w-12 mb-3 opacity-20" />
                <p className="text-sm">Select a file to edit</p>
                <p className="text-xs">or create a new one</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
