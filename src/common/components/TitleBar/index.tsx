import { useEffect, useRef, useState } from "react";
import type { CommandSet, CustomCommand, Project, ShellKind } from "@types";
import { toast } from "sonner";
import useSWR from "swr";
import { sendToTerminal } from "@components/TerminalView/engine";
import { useTerminals } from "@stores/terminals";
import { useUI } from "@stores/ui";
import { useWorkspace } from "@stores/workspace";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { cn } from "@utils/cn";
import {
  VscChromeClose,
  VscChromeMaximize,
  VscChromeMinimize,
  VscChromeRestore,
  VscClose,
  VscHistory,
  VscHubot,
  VscListSelection,
  VscTools,
  VscWarning,
} from "react-icons/vsc";

const win = getCurrentWindow();

type Session = { id: string; label: string; mtime: number };

export default function TitleBar() {
  const [maxed, setMaxed] = useState(false);
  const [killPortOpen, setKillPortOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const project = useWorkspace((s) => (s.activeProjectId ? s.projects[s.activeProjectId] : null));

  useEffect(() => {
    void win.isMaximized().then(setMaxed);
    const un = win.onResized(() => void win.isMaximized().then(setMaxed));
    return () => void un.then((f) => f());
  }, []);

  return (
    <div
      data-tauri-drag-region
      className="relative flex h-8 shrink-0 items-center justify-between border-b border-zinc-800 bg-zinc-950 pl-2 select-none"
    >
      {/* Left: logo + menus */}
      <div className="z-10 flex items-center gap-1">
        <img src="/images/logo.png" alt="VibeDock" className="h-5 w-5 rounded" draggable={false} />

        <Menu label="Tools" icon={<VscTools size={12} />}>
          {(close) => (
            <MenuItem
              onClick={() => {
                setKillPortOpen(true);
                close();
              }}
            >
              Kill port…
            </MenuItem>
          )}
        </Menu>

        <Menu label="Claude Code" icon={<VscHubot size={12} />} width="w-56">
          {(close) => <ClaudeMenu project={project} onHistory={() => setHistoryOpen(true)} close={close} />}
        </Menu>

        <Menu label="Commands" icon={<VscListSelection size={12} />} width="w-64">
          {(close) => <CommandsMenu project={project} close={close} />}
        </Menu>
      </div>

      {/* Center: app name (click-through so the drag region still works) */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs font-medium text-zinc-400">
        VibeDock
      </div>

      {/* Right: window controls */}
      <div className="z-10 flex items-center">
        <WinBtn onClick={() => void win.minimize()} title="Minimize">
          <VscChromeMinimize size={14} />
        </WinBtn>
        <WinBtn onClick={() => void win.toggleMaximize()} title={maxed ? "Restore" : "Maximize"}>
          {maxed ? <VscChromeRestore size={14} /> : <VscChromeMaximize size={14} />}
        </WinBtn>
        <WinBtn onClick={() => void win.close()} title="Close" danger>
          <VscChromeClose size={14} />
        </WinBtn>
      </div>

      {killPortOpen && <KillPortModal onClose={() => setKillPortOpen(false)} />}
      {historyOpen && project && (
        <HistoryModal project={project} onClose={() => setHistoryOpen(false)} />
      )}
    </div>
  );
}

// --- Launch helpers (the top bar has no view of its own; it acts on the active project) ---

// The focused terminal's id IF it's live and idle (at a prompt, no running
// process) — so a command can reuse it instead of opening a new tab. Returns
// null when it's dormant/exited or busy (claude, bun run dev, …).
async function idleFocusedId(project: Project): Promise<string | null> {
  const ts = useTerminals.getState();
  const fid = ts.focusedByProject[project.id];
  const f = fid ? ts.terminals[fid] : null;
  if (!fid || !f || f.status === "exited" || !ts.started[fid]) return null;
  try {
    return (await invoke<boolean>("pty_is_idle", { id: fid })) ? fid : null;
  } catch {
    return null;
  }
}

// Run a command, reusing the focused terminal if it's idle — else a fresh tab.
async function runCommand(project: Project, command: string, shell?: ShellKind) {
  const reuse = await idleFocusedId(project);
  if (!(reuse && sendToTerminal(reuse, command))) {
    useTerminals.getState().addTerminal(project.id, project.path, { shell, command });
  }
  useUI.getState().setView("terminals");
}

// A set opens one terminal per command; the first reuses an idle focused
// terminal (so no blank tab), the rest open fresh.
async function runSet(project: Project, s: CommandSet) {
  const cmds = s.commands.map((c) => c.trim()).filter(Boolean);
  if (cmds.length === 0) return;
  const ts = useTerminals.getState();
  const reuse = await idleFocusedId(project);
  let start = 0;
  if (reuse && sendToTerminal(reuse, cmds[0])) start = 1;
  for (let i = start; i < cmds.length; i++) {
    ts.addTerminal(project.id, project.path, { shell: s.shell, command: cmds[i] });
  }
  useUI.getState().setView("terminals");
}

function ClaudeMenu({
  project,
  onHistory,
  close,
}: {
  project: Project | null;
  onHistory: () => void;
  close: () => void;
}) {
  const skip = useWorkspace((s) => s.claudeSkipPermissions);
  const setSkip = useWorkspace((s) => s.setClaudeSkipPermissions);

  const launch = (command: string) => {
    if (!project) return;
    void runCommand(project, skip ? `${command} --dangerously-skip-permissions` : command);
    close();
  };

  if (!project) return <MenuNote>Open a project first.</MenuNote>;
  return (
    <>
      <label className="flex cursor-pointer items-start gap-2 px-3 py-1.5 hover:bg-zinc-800">
        <input
          type="checkbox"
          checked={skip}
          onChange={(e) => setSkip(e.target.checked)}
          className="mt-0.5 accent-amber-500"
        />
        <span className="flex items-center gap-1.5 text-xs text-zinc-200">
          <VscWarning size={12} className={skip ? "text-amber-500" : "text-zinc-600"} />
          Dangerously skip permissions
        </span>
      </label>
      <MenuSep />
      <MenuItem onClick={() => launch("claude")}>New session</MenuItem>
      <MenuItem onClick={() => launch("claude --continue")}>Continue last session</MenuItem>
      <MenuSep />
      <MenuItem
        onClick={() => {
          onHistory();
          close();
        }}
      >
        <span className="flex items-center gap-1.5">
          <VscHistory size={12} /> Show history…
        </span>
      </MenuItem>
    </>
  );
}

function CommandsMenu({ project, close }: { project: Project | null; close: () => void }) {
  const globalCommands = useWorkspace((s) => s.globalCommands);
  if (!project) return <MenuNote>Open a project first.</MenuNote>;

  const sets = project.commandSets ?? [];
  const local = project.customCommands ?? [];
  const empty = sets.length === 0 && globalCommands.length === 0 && local.length === 0;
  if (empty) return <MenuNote>No commands yet — add some in the Commands view.</MenuNote>;

  const run = (c: CustomCommand) => {
    void runCommand(project, c.command, c.shell);
    close();
  };

  let needSep = false;
  const group = (label: string, node: React.ReactNode) => (
    <>
      {needSep && <MenuSep />}
      <MenuLabel>{label}</MenuLabel>
      {node}
    </>
  );

  const chunks: React.ReactNode[] = [];
  if (sets.length) {
    chunks.push(
      group(
        "Command Sets",
        sets.map((s) => (
          <MenuItem
            key={s.id}
            onClick={() => {
              void runSet(project, s);
              close();
            }}
          >
            <CmdRow name={s.name} sub={`${s.commands.length} terminal${s.commands.length > 1 ? "s" : ""}`} />
          </MenuItem>
        ))
      )
    );
    needSep = true;
  }
  if (globalCommands.length) {
    chunks.push(
      group(
        "Global",
        globalCommands.map((c) => (
          <MenuItem key={c.id} onClick={() => run(c)}>
            <CmdRow name={c.name} sub={c.command} />
          </MenuItem>
        ))
      )
    );
    needSep = true;
  }
  if (local.length) {
    chunks.push(
      group(
        project.name,
        local.map((c) => (
          <MenuItem key={c.id} onClick={() => run(c)}>
            <CmdRow name={c.name} sub={c.command} />
          </MenuItem>
        ))
      )
    );
  }
  return <div className="max-h-[70vh] overflow-y-auto">{chunks.map((c, i) => <div key={i}>{c}</div>)}</div>;
}

function CmdRow({ name, sub }: { name: string; sub: string }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-zinc-200">{name}</div>
      <div className="truncate text-[10px] text-zinc-500">{sub}</div>
    </div>
  );
}

// --- Generic dropdown menu (button + panel + outside-click close) ---

function Menu({
  label,
  icon,
  width = "w-44",
  children,
}: {
  label: string;
  icon: React.ReactNode;
  width?: string;
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex items-center gap-1 rounded px-2 py-0.5 text-xs text-zinc-300 hover:bg-zinc-800",
          open && "bg-zinc-800"
        )}
      >
        {icon} {label}
      </button>
      {open && (
        <div
          className={cn(
            "vd-pop absolute top-7 left-0 z-50 overflow-hidden rounded border border-zinc-700 bg-zinc-900 py-1 shadow-lg",
            width
          )}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

function MenuItem({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="block w-full px-3 py-1.5 text-left text-xs text-zinc-300 hover:bg-zinc-800"
    >
      {children}
    </button>
  );
}

function MenuLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 pt-1.5 pb-0.5 text-[10px] font-semibold tracking-widest text-zinc-500 uppercase">
      {children}
    </div>
  );
}

function MenuNote({ children }: { children: React.ReactNode }) {
  return <div className="px-3 py-2 text-[11px] text-zinc-500">{children}</div>;
}

function MenuSep() {
  return <div className="my-1 border-t border-zinc-800" />;
}

function WinBtn({
  onClick,
  title,
  danger,
  children,
}: {
  onClick: () => void;
  title: string;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        "flex h-8 w-11 items-center justify-center text-zinc-400 hover:text-zinc-100",
        danger ? "hover:bg-red-600 hover:text-white" : "hover:bg-zinc-800"
      )}
    >
      {children}
    </button>
  );
}

function HistoryModal({ project, onClose }: { project: Project; onClose: () => void }) {
  const { data: sessions, isLoading } = useSWR<Session[]>(
    ["claude_sessions", project.path],
    () => invoke<Session[]>("claude_sessions", { root: project.path })
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const resume = (id: string) => {
    const skip = useWorkspace.getState().claudeSkipPermissions;
    void runCommand(project, `claude --resume ${id}${skip ? " --dangerously-skip-permissions" : ""}`);
    onClose();
  };

  return (
    <div className="vd-fade fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="vd-scale-in flex max-h-[80vh] w-full max-w-lg flex-col rounded-lg border border-zinc-700 bg-zinc-900 shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-zinc-100">
            <VscHistory size={14} /> Claude sessions — {project.name}
          </h2>
          <button onClick={onClose} className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200">
            <VscClose size={16} />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-3">
          {isLoading && <p className="text-sm text-zinc-600">Loading…</p>}
          {sessions && sessions.length === 0 && (
            <p className="text-sm text-zinc-600">
              No sessions found for this project. Start a new one — resume becomes available after Claude
              Code writes its first transcript.
            </p>
          )}
          {sessions?.map((s) => (
            <button
              key={s.id}
              onClick={() => resume(s.id)}
              className="group flex items-center gap-3 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-left hover:border-zinc-700"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-zinc-200">{s.label}</div>
                <div className="text-[11px] text-zinc-600">
                  {new Date(s.mtime * 1000).toLocaleString()} · {s.id.slice(0, 8)}
                </div>
              </div>
              <span className="shrink-0 text-xs text-sky-500 opacity-0 group-hover:opacity-100">Resume →</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function KillPortModal({ onClose }: { onClose: () => void }) {
  const [port, setPort] = useState("");
  const [busy, setBusy] = useState(false);
  const valid = /^\d+$/.test(port.trim());

  const run = async () => {
    if (!valid || busy) return;
    setBusy(true);
    try {
      const out = await invoke<string>("kill_port", { port: port.trim() });
      toast.success(out || `Freed port ${port.trim()}`);
      onClose();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="vd-fade fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="vd-scale-in w-full max-w-xs rounded-lg border border-zinc-700 bg-zinc-900 p-4 shadow-2xl"
      >
        <h2 className="mb-1 text-sm font-semibold text-zinc-100">Kill port</h2>
        <p className="mb-3 text-[11px] text-zinc-500">
          Runs <code>npx kill-port &lt;port&gt;</code> to free a stuck port.
        </p>
        <input
          autoFocus
          value={port}
          onChange={(e) => setPort(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && run()}
          placeholder="5173"
          inputMode="numeric"
          className="w-full rounded bg-zinc-950 px-2 py-1.5 font-mono text-sm text-zinc-100 outline-none ring-1 ring-zinc-800 focus:ring-sky-700"
        />
        <div className="mt-3 flex justify-end gap-2">
          <button onClick={onClose} className="rounded px-3 py-1.5 text-sm text-zinc-400 hover:bg-zinc-800">
            Cancel
          </button>
          <button
            disabled={!valid || busy}
            onClick={run}
            className={cn(
              "rounded px-3 py-1.5 text-sm font-medium text-white",
              valid && !busy ? "bg-sky-600 hover:bg-sky-500" : "cursor-not-allowed bg-zinc-800 text-zinc-500"
            )}
          >
            {busy ? "Killing…" : "Kill"}
          </button>
        </div>
      </div>
    </div>
  );
}
