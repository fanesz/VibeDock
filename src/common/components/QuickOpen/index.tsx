import { useEffect, useMemo, useRef, useState } from "react";
import hljs from "highlight.js";
import { toast } from "sonner";
import { useUI } from "@stores/ui";
import { useWorkspace } from "@stores/workspace";
import { invoke } from "@tauri-apps/api/core";
import { cn } from "@utils/cn";
import { fuzzyScore } from "@utils/fuzzy";
import "highlight.js/styles/github-dark.css";
import { VscCode } from "react-icons/vsc";

type Preview = { content: string; truncated: boolean; binary: boolean };

const fileCache = new Map<string, string[]>();

const EXT_LANG: Record<string, string> = {
  ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript", mjs: "javascript",
  json: "json", md: "markdown", rs: "rust", py: "python", go: "go", java: "java", rb: "ruby",
  css: "css", scss: "scss", html: "xml", xml: "xml", yml: "yaml", yaml: "yaml", toml: "ini",
  sh: "bash", bash: "bash", ps1: "powershell", sql: "sql", c: "c", cpp: "cpp", h: "cpp",
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function highlight(code: string, file: string): string {
  const ext = file.split(".").pop()?.toLowerCase() ?? "";
  const lang = EXT_LANG[ext];
  try {
    if (lang && hljs.getLanguage(lang)) return hljs.highlight(code, { language: lang }).value;
  } catch {
    /* fall through to plain */
  }
  return escapeHtml(code);
}

export default function QuickOpen() {
  const root = useWorkspace((s) => (s.activeProjectId ? s.projects[s.activeProjectId]?.path : null));
  const close = () => useUI.getState().setQuickOpen(false);

  const [files, setFiles] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [previewFile, setPreviewFile] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!root) return;
    const cached = fileCache.get(root);
    if (cached) {
      setFiles(cached);
      return;
    }
    let cancelled = false;
    invoke<string[]>("list_files", { root })
      .then((f) => {
        if (cancelled) return;
        fileCache.set(root, f);
        setFiles(f);
      })
      .catch((e) => toast.error(String(e)));
    return () => {
      cancelled = true;
    };
  }, [root]);

  const results = useMemo(() => {
    if (!query) return files.slice(0, 100);
    const scored: { f: string; s: number }[] = [];
    for (const f of files) {
      const s = fuzzyScore(query, f);
      if (s === null) continue;
      const base = f.split("/").pop() ?? f;
      const bonus = fuzzyScore(query, base) !== null ? -50 : 0;
      scored.push({ f, s: s + bonus + f.length * 0.01 });
    }
    scored.sort((a, b) => a.s - b.s);
    return scored.slice(0, 100).map((x) => x.f);
  }, [files, query]);

  useEffect(() => setSelected(0), [query]);

  const fullPath = (rel: string) => `${root}\\${rel.replace(/\//g, "\\")}`;

  const openPreview = (rel: string) => {
    setPreviewFile(rel);
    setPreview(null);
    invoke<Preview>("read_file_preview", { path: fullPath(rel) })
      .then(setPreview)
      .catch((e) => toast.error(String(e)));
  };

  const openInVscode = (rel: string) => {
    invoke("open_in_vscode", { path: fullPath(rel) }).catch((e) => toast.error(String(e)));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") return close();
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const rel = results[selected];
      if (rel) openPreview(rel);
    }
  };

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${selected}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const previewHtml = useMemo(
    () => (preview && !preview.binary && previewFile ? highlight(preview.content, previewFile) : ""),
    [preview, previewFile]
  );

  return (
    <div className="absolute inset-0 z-30 flex items-start justify-center bg-black/50 pt-20" onMouseDown={close}>
      <div
        className="flex h-[70vh] w-[52rem] max-w-[92vw] flex-col overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={root ? "Search files…" : "Open a project first"}
          className="border-b border-zinc-800 bg-transparent px-4 py-3 text-sm text-zinc-100 outline-none"
        />
        <div className="flex min-h-0 flex-1">
          <div ref={listRef} className="w-2/5 overflow-y-auto border-r border-zinc-800">
            {results.map((rel, i) => (
              <div
                key={rel}
                data-idx={i}
                onClick={() => {
                  setSelected(i);
                  openPreview(rel);
                }}
                className={cn(
                  "flex cursor-pointer items-center justify-between gap-2 px-3 py-1.5 text-xs",
                  i === selected ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:bg-zinc-800/50"
                )}
              >
                <span className="min-w-0 flex-1 truncate">
                  <span className="text-zinc-200">{rel.split("/").pop()}</span>
                  <span className="ml-1 text-zinc-600">{rel.split("/").slice(0, -1).join("/")}</span>
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    openInVscode(rel);
                  }}
                  title="Open in VS Code"
                  className="shrink-0 rounded p-0.5 text-zinc-500 hover:bg-zinc-700 hover:text-sky-400"
                >
                  <VscCode size={13} />
                </button>
              </div>
            ))}
            {results.length === 0 && <div className="px-3 py-4 text-xs text-zinc-600">No matches.</div>}
          </div>

          <div className="min-w-0 flex-1 overflow-auto bg-[#0d1117]">
            {!previewFile && <div className="p-4 text-xs text-zinc-600">Select a file to preview.</div>}
            {preview?.binary && <div className="p-4 text-xs text-zinc-500">Binary file — no preview.</div>}
            {preview && !preview.binary && (
              <pre className="p-3 text-xs leading-relaxed">
                <code
                  className="hljs bg-transparent"
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
                {preview.truncated && <div className="mt-2 text-zinc-600">… (truncated)</div>}
              </pre>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
