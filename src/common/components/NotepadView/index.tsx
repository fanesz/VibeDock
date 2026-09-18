import { useLayoutEffect, useRef } from "react";
import type { Project } from "@types";
import { useWorkspace } from "@stores/workspace";

// Shared text metrics — gutter, backdrop and textarea must line up pixel-for-pixel.
const TEXT = "font-mono text-sm leading-8";

type Edit = { value: string; selStart: number; selEnd: number };

function lineBounds(value: string, start: number, end: number) {
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  let lineEnd = value.indexOf("\n", end);
  if (lineEnd === -1) lineEnd = value.length;
  return { lineStart, lineEnd };
}

function isCommented(line: string): boolean {
  return line.trimStart().startsWith("//");
}

// Toggle a "// " prefix on each selected line (VSCode Ctrl+/). Commented lines
// render struck-through in the backdrop below.
function toggleComment(value: string, start: number, end: number): Edit {
  const { lineStart, lineEnd } = lineBounds(value, start, end);
  const block = value.slice(lineStart, lineEnd);
  const nonBlank = block.split("\n").filter((l) => l.trim() !== "");
  const allCommented = nonBlank.length > 0 && nonBlank.every(isCommented);

  const xform = (l: string) => {
    if (l.trim() === "") return l; // leave blank lines alone
    return allCommented ? l.replace(/^(\s*)\/\/ ?/, "$1") : l.replace(/^(\s*)/, "$1// ");
  };
  const newBlock = block.split("\n").map(xform).join("\n");

  // Keep the caret where it was: transform the text up to each endpoint the same way.
  const remap = (pos: number) => {
    if (pos <= lineStart) return pos;
    if (pos >= lineEnd) return pos + (newBlock.length - block.length);
    return lineStart + value.slice(lineStart, pos).split("\n").map(xform).join("\n").length;
  };
  return {
    value: value.slice(0, lineStart) + newBlock + value.slice(lineEnd),
    selStart: remap(start),
    selEnd: remap(end),
  };
}

function moveLines(value: string, start: number, end: number, dir: -1 | 1): Edit | null {
  const { lineStart, lineEnd } = lineBounds(value, start, end);
  const block = value.slice(lineStart, lineEnd);
  if (dir === -1) {
    if (lineStart === 0) return null;
    // lineStart <= 1 means the previous line is the first line (starts at 0).
    // Guard it: lastIndexOf with a negative fromIndex clamps to 0 and wrongly
    // matches the separator after that empty line.
    const prevStart = lineStart <= 1 ? 0 : value.lastIndexOf("\n", lineStart - 2) + 1;
    const prev = value.slice(prevStart, lineStart - 1);
    const next = value.slice(0, prevStart) + block + "\n" + prev + value.slice(lineEnd);
    const delta = -(lineStart - prevStart);
    return { value: next, selStart: start + delta, selEnd: end + delta };
  }
  if (lineEnd === value.length) return null;
  const nextEnd = value.indexOf("\n", lineEnd + 1);
  const realEnd = nextEnd === -1 ? value.length : nextEnd;
  const following = value.slice(lineEnd + 1, realEnd);
  const next = value.slice(0, lineStart) + following + "\n" + block + value.slice(realEnd);
  const delta = following.length + 1;
  return { value: next, selStart: start + delta, selEnd: end + delta };
}

function duplicateLines(value: string, start: number, end: number): Edit {
  const { lineStart, lineEnd } = lineBounds(value, start, end);
  const block = value.slice(lineStart, lineEnd);
  const delta = block.length + 1;
  return {
    value: value.slice(0, lineEnd) + "\n" + block + value.slice(lineEnd),
    selStart: start + delta,
    selEnd: end + delta,
  };
}

export default function NotepadView({ project }: { project: Project }) {
  const text = useWorkspace((s) => s.projects[project.id]?.notepad ?? "");
  const setNotepad = useWorkspace((s) => s.setNotepad);
  const ref = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const pendingSel = useRef<{ start: number; end: number } | null>(null);
  const lines = text.split("\n");

  // Restore caret/selection after a keyboard-driven edit re-renders the textarea.
  useLayoutEffect(() => {
    const sel = pendingSel.current;
    if (sel && ref.current) {
      ref.current.setSelectionRange(sel.start, sel.end);
      pendingSel.current = null;
    }
  });

  const apply = (edit: Edit | null) => {
    if (!edit) return;
    pendingSel.current = { start: edit.selStart, end: edit.selEnd };
    setNotepad(project.id, edit.value);
  };

  const syncScroll = (el: HTMLTextAreaElement) => {
    if (gutterRef.current) gutterRef.current.scrollTop = el.scrollTop;
    if (backdropRef.current) backdropRef.current.scrollTop = el.scrollTop;
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    const { value, selectionStart: s, selectionEnd: en } = el;

    // Ctrl+/ → toggle "// " comment prefix on selected line(s)
    if ((e.ctrlKey || e.metaKey) && e.key === "/") {
      e.preventDefault();
      apply(toggleComment(value, s, en));
      return;
    }
    // Alt+Shift+↑/↓ → duplicate line(s)
    if (e.altKey && e.shiftKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      apply(duplicateLines(value, s, en));
      return;
    }
    // Alt+↑/↓ → move line(s)
    if (e.altKey && !e.shiftKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      apply(moveLines(value, s, en, e.key === "ArrowUp" ? -1 : 1));
      return;
    }
    // Tab → insert two spaces instead of leaving the field
    if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      apply({ value: value.slice(0, s) + "  " + value.slice(en), selStart: s + 2, selEnd: s + 2 });
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2">
        <h1 className="text-sm font-semibold text-zinc-200">Notepad — {project.name}</h1>
        <span className="text-[11px] text-zinc-600">
          Ctrl+/ comment · Alt+↑↓ move · Alt+Shift+↑↓ duplicate
        </span>
      </div>
      <div className="flex min-h-0 flex-1">
        {/* Gutter: line numbers, scroll-synced with the textarea. */}
        <div
          ref={gutterRef}
          aria-hidden
          className={`select-none overflow-hidden whitespace-pre py-4 pl-3 pr-2 text-right tabular-nums text-zinc-600 ${TEXT}`}
        >
          {lines.map((_, i) => i + 1).join("\n")}
        </div>
        {/* Backdrop shows styled text (commented = struck through); textarea on top drives editing. */}
        <div className="relative min-h-0 flex-1">
          <div
            ref={backdropRef}
            aria-hidden
            className={`pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words py-4 pl-2 pr-4 text-zinc-200 ${TEXT}`}
          >
            {lines.map((line, i) => (
              <span key={i} className={isCommented(line) ? "text-zinc-600 line-through" : undefined}>
                {line + (i < lines.length - 1 ? "\n" : "")}
              </span>
            ))}
          </div>
          <textarea
            ref={ref}
            value={text}
            onChange={(e) => setNotepad(project.id, e.target.value)}
            onKeyDown={onKeyDown}
            onScroll={(e) => syncScroll(e.currentTarget)}
            spellCheck={false}
            placeholder="Notes, todos, scratch…"
            className={`absolute inset-0 resize-none bg-transparent py-4 pl-2 pr-4 text-transparent caret-zinc-200 outline-none placeholder:text-zinc-600 ${TEXT}`}
          />
        </div>
      </div>
    </div>
  );
}
