import { Fragment, useEffect, useRef, useState } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import type { ShellKind } from "@types";
import useSWR from "swr";
import TerminalView from "@components/TerminalView";
import type { PaneNode } from "@stores/terminals";
import { leafIds, runRestart, useTerminals } from "@stores/terminals";
import { invoke } from "@tauri-apps/api/core";
import { cn } from "@utils/cn";
import {
  VscAdd,
  VscChevronDown,
  VscClose,
  VscDebugRestart,
  VscDebugStart,
  VscSplitHorizontal,
  VscSplitVertical,
} from "react-icons/vsc";

const EMPTY: string[] = [];
const NO_GROUPS: PaneNode[] = [];

function containsLeaf(n: PaneNode, id: string): boolean {
  if (n.kind === "leaf") return n.id === id;
  return n.children.some((c) => containsLeaf(c, id));
}

const SHELLS: { key: ShellKind; label: string }[] = [
  { key: "powershell", label: "PowerShell" },
  { key: "cmd", label: "Command Prompt" },
  { key: "gitbash", label: "Git Bash" },
];

export default function ProjectTerminals({
  projectId,
  cwd,
  active,
}: {
  projectId: string;
  cwd: string;
  active: boolean;
}) {
  const ids = useTerminals((s) => s.byProject[projectId]) ?? EMPTY;
  const terminals = useTerminals((s) => s.terminals);
  const groups = useTerminals((s) => s.groupsByProject[projectId]) ?? NO_GROUPS;
  const focused = useTerminals((s) => s.focusedByProject[projectId]);
  const started = useTerminals((s) => s.started);
  const addTerminal = useTerminals((s) => s.addTerminal);
  const startTerminal = useTerminals((s) => s.startTerminal);
  const closeTerminal = useTerminals((s) => s.closeTerminal);
  const focusTerminal = useTerminals((s) => s.focusTerminal);
  const renameTerminal = useTerminals((s) => s.renameTerminal);
  const moveGroup = useTerminals((s) => s.moveGroup);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const autoCreated = useRef(false);

  // Only offer shells that are actually installed (Git Bash may be absent).
  const { data: shellKeys } = useSWR("available_shells", () =>
    invoke<string[]>("available_shells")
  );
  const availableShells = shellKeys
    ? SHELLS.filter((s) => shellKeys.includes(s.key))
    : SHELLS;

  // Auto-create the first terminal once per project mount. The ref guards
  // against React StrictMode's double-invoke creating two terminals.
  useEffect(() => {
    if (ids.length === 0 && !autoCreated.current) {
      autoCreated.current = true;
      addTerminal(projectId, cwd);
    }
  }, [ids.length, projectId, cwd, addTerminal]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  const renderPane = (node: PaneNode, groupVisible: boolean): React.ReactNode => {
    if (node.kind === "leaf") {
      const term = terminals[node.id];
      if (!term) return null;
      return (
        <div className="h-full w-full" onMouseDownCapture={() => focusTerminal(projectId, node.id)}>
          {started[node.id] ? (
            <TerminalView term={term} visible={active && groupVisible} focused={focused === node.id} />
          ) : (
            <DormantPane
              name={term.name}
              command={term.command}
              onStart={() => startTerminal(node.id)}
            />
          )}
        </div>
      );
    }
    return (
      <Group orientation={node.dir === "h" ? "horizontal" : "vertical"} className="h-full w-full">
        {node.children.map((child, i) => (
          <Fragment key={child.id}>
            {i > 0 && (
              <Separator
                className={cn("bg-zinc-800 hover:bg-sky-700", node.dir === "h" ? "w-px" : "h-px")}
              />
            )}
            <Panel minSize={10}>{renderPane(child, groupVisible)}</Panel>
          </Fragment>
        ))}
      </Group>
    );
  };

  const renderChip = (t: (typeof terminals)[string]): React.ReactNode => {
    const isFocused = t.id === focused;
    return (
      <div
        key={t.id}
        onClick={() => focusTerminal(projectId, t.id)}
        className={cn(
          "group flex h-7 cursor-pointer items-center gap-1 rounded px-2 text-xs",
          isFocused ? "bg-zinc-700 text-zinc-100" : "text-zinc-400 hover:bg-zinc-800"
        )}
      >
        <span
          className={cn(
            "h-1.5 w-1.5 shrink-0 rounded-full",
            t.status === "exited" ? "bg-zinc-600" : "bg-emerald-500"
          )}
        />
        {renamingId === t.id ? (
          <input
            autoFocus
            defaultValue={t.name}
            onClick={(e) => e.stopPropagation()}
            onBlur={(e) => {
              renameTerminal(t.id, e.target.value);
              setRenamingId(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setRenamingId(null);
            }}
            className="w-24 rounded bg-zinc-950 px-1 text-xs text-zinc-100 outline-none ring-1 ring-sky-600"
          />
        ) : (
          <span
            onDoubleClick={() => setRenamingId(t.id)}
            title={t.name}
            className="w-[6.5rem] shrink-0 truncate"
          >
            {t.name}
          </span>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            closeTerminal(t.id);
          }}
          title="Close terminal"
          className="shrink-0 rounded p-0.5 text-zinc-500 opacity-0 hover:bg-zinc-700 hover:text-zinc-100 group-hover:opacity-100"
        >
          <VscClose size={12} />
        </button>
      </div>
    );
  };

  // Show only the group ("tab") that holds the focused terminal; keep the rest
  // mounted-but-hidden so their engines/scrollback survive tab switches.
  const activeGroup = Math.max(
    0,
    groups.findIndex((g) => (focused ? containsLeaf(g, focused) : false))
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-1 overflow-x-auto border-b border-zinc-800 bg-zinc-950 px-1.5">
        {groups.map((g, gi) => {
          const members = leafIds(g).map((id) => terminals[id]).filter(Boolean);
          if (members.length === 0) return null;
          const isSplit = members.length > 1;
          const renamingHere = members.some((t) => t.id === renamingId);
          return (
            <div
              key={g.id}
              draggable={!renamingHere}
              onDragStart={(e) => {
                setDragIndex(gi);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragEnd={() => {
                setDragIndex(null);
                setDragOverIndex(null);
              }}
              onDragOver={(e) => {
                if (dragIndex === null) return;
                e.preventDefault();
                setDragOverIndex(gi);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragIndex !== null) moveGroup(projectId, dragIndex, gi);
                setDragIndex(null);
                setDragOverIndex(null);
              }}
              title={isSplit ? "Split group — drag to reorder" : "Drag to reorder"}
              className={cn(
                "flex h-7 shrink-0 items-center gap-0.5 rounded-md",
                !renamingHere && "cursor-grab active:cursor-grabbing",
                // A split group sits on a shared track so it reads as one unit.
                isSplit && "bg-zinc-800/60 px-1",
                dragOverIndex === gi && dragIndex !== gi && "ring-1 ring-sky-500"
              )}
            >
              {members.map((t) => renderChip(t))}
            </div>
          );
        })}

        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          <button
            onClick={() => focused && runRestart(focused)}
            disabled={!focused}
            title="Restart focused terminal (kill process tree, re-run command)"
            className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-40"
          >
            <VscDebugRestart size={14} />
          </button>
          <button
            onClick={() => addTerminal(projectId, cwd, { dir: "h" })}
            title="Split right"
            className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
          >
            <VscSplitHorizontal size={14} />
          </button>
          <button
            onClick={() => addTerminal(projectId, cwd, { dir: "v" })}
            title="Split down"
            className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
          >
            <VscSplitVertical size={14} />
          </button>
          <div ref={menuRef} className="relative flex items-center">
            <button
              onClick={() => addTerminal(projectId, cwd)}
              title="New terminal"
              className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
            >
              <VscAdd size={14} />
            </button>
            <button
              onClick={() => setMenuOpen((o) => !o)}
              title="New terminal with shell…"
              className="rounded p-0.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100"
            >
              <VscChevronDown size={12} />
            </button>
            {menuOpen && (
              <div className="vd-pop absolute top-8 right-0 z-10 w-44 overflow-hidden rounded border border-zinc-700 bg-zinc-900 py-1 shadow-lg">
                {availableShells.map((sh) => (
                  <button
                    key={sh.key}
                    onClick={() => {
                      addTerminal(projectId, cwd, { shell: sh.key });
                      setMenuOpen(false);
                    }}
                    className="block w-full px-3 py-1.5 text-left text-xs text-zinc-300 hover:bg-zinc-800"
                  >
                    {sh.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        {groups.map((g, i) => (
          <div key={g.id} className={cn("absolute inset-0", i === activeGroup ? "block" : "hidden")}>
            {renderPane(g, i === activeGroup)}
          </div>
        ))}
      </div>
    </div>
  );
}

// Restored-but-not-yet-running terminal. Nothing spawns until the user clicks
// Start — so no persisted command auto-runs at app launch.
function DormantPane({
  name,
  command,
  onStart,
}: {
  name: string;
  command: string | null;
  onStart: () => void;
}) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-[#09090b] text-center">
      <div className="text-sm text-zinc-400">{name}</div>
      {command && <code className="max-w-[80%] truncate text-xs text-zinc-600">{command}</code>}
      <button
        onClick={onStart}
        className="mt-1 flex items-center gap-1.5 rounded bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700"
      >
        <VscDebugStart size={13} /> Start
      </button>
    </div>
  );
}
