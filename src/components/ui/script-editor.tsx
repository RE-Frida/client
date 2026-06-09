import { useMemo, useEffect } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { oneDark } from "@codemirror/theme-one-dark";
import { autocompletion, completionKeymap } from "@codemirror/autocomplete";
import { lintKeymap } from "@codemirror/lint";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import {
  indentOnInput,
  bracketMatching,
  foldGutter,
  foldKeymap,
  syntaxHighlighting,
  defaultHighlightStyle,
} from "@codemirror/language";
import { keymap, EditorView } from "@codemirror/view";

interface ScriptEditorProps {
  value: string;
  onChange: (value: string) => void;
  onSave?: () => void;
  height?: string;
}

const fridaCompletions = [
  { label: "Java.perform", type: "function", info: "Execute function when Java VM is ready" },
  { label: "Java.use", type: "function", info: "Get a wrapper for a Java class" },
  { label: "Java.registerClass", type: "function", info: "Register a new Java class" },
  { label: "Java.choose", type: "function", info: "Enumerate live instances of a class" },
  { label: "Java.array", type: "function", info: "Create a Java array" },
  { label: "Java.cast", type: "function", info: "Cast an object to another class wrapper" },
  { label: "Java.enumerateLoadedClasses", type: "function", info: "Enumerate all loaded classes" },
  { label: ".implementation", type: "property", info: "Replace method implementation" },
  { label: ".overload", type: "function", info: "Select method overload by parameter types" },
  { label: "Interceptor.attach", type: "function", info: "Attach to a native function" },
  { label: "Interceptor.detachAll", type: "function", info: "Detach all interceptors" },
  { label: "Interceptor.replace", type: "function", info: "Replace a native function" },
  { label: "Memory.readUtf8String", type: "function", info: "Read UTF-8 string from memory" },
  { label: "Memory.readUtf16String", type: "function", info: "Read UTF-16 string from memory" },
  { label: "Memory.readByteArray", type: "function", info: "Read byte array from memory" },
  { label: "Memory.writeByteArray", type: "function", info: "Write byte array to memory" },
  { label: "Memory.alloc", type: "function", info: "Allocate memory on the heap" },
  { label: "Memory.scan", type: "function", info: "Scan memory for a pattern" },
  { label: "Process.id", type: "property", info: "Process ID" },
  { label: "Process.platform", type: "property", info: "Platform (linux, darwin, windows)" },
  { label: "Process.arch", type: "property", info: "Architecture (ia32, x64, arm, arm64)" },
  { label: "Process.enumerateModules", type: "function", info: "Enumerate loaded modules" },
  { label: "Process.findModuleByName", type: "function", info: "Find module by name" },
  { label: "Module.enumerateExports", type: "function", info: "Enumerate exports of a module" },
  { label: "Module.findExportByName", type: "function", info: "Find export by name" },
  { label: "console.log", type: "function", info: "Log a message" },
  { label: "send", type: "function", info: "Send a message to the Frida client" },
  { label: "recv", type: "function", info: "Receive a message from the Frida client" },
  { label: "hexdump", type: "function", info: "Generate a hex dump of memory" },
  { label: "ptr", type: "function", info: "Create a NativePointer" },
];

function fridaCompletionSource(context: any) {
  const word = context.matchBefore(/[\w.]+/);
  if (!word || (word.from === word.to && !context.explicit)) return null;
  return {
    from: word.from,
    options: fridaCompletions,
  };
}

export function ScriptEditor({ value, onChange, onSave, height = "100%" }: ScriptEditorProps) {
  const theme = typeof document !== "undefined" ? document.documentElement.getAttribute("data-theme") : null;
  const isDark = theme !== "light";

  useEffect(() => {
    if (!onSave) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        onSave();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onSave]);

  const extensions = useMemo(() => [
    javascript(),
    autocompletion({
      override: [fridaCompletionSource],
      activateOnTyping: true,
    }),
    history(),
    indentOnInput(),
    bracketMatching(),
    highlightSelectionMatches(),
    foldGutter({
      openText: "▼",
      closedText: "▶",
    }),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    EditorView.lineWrapping,
    keymap.of([
      ...defaultKeymap,
      ...historyKeymap,
      ...completionKeymap,
      ...lintKeymap,
      ...searchKeymap,
      ...foldKeymap,
      indentWithTab,
    ]),
    EditorView.theme({
      "&": {
        fontSize: "13px",
        height: "100%",
      },
      ".cm-scroller": {
        fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace",
        overflow: "auto",
      },
      ".cm-foldGutter": {
        width: "16px",
      },
    }),
  ], []);

  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      extensions={extensions}
      theme={isDark ? oneDark : "light"}
      height={height}
      style={{ height }}
    />
  );
}
