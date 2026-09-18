import type { ShellKind } from "@types";
import { create } from "zustand";
import { persist } from "zustand/middleware";

// Metadata (names, shells, cwd, command, layout) IS persisted so tabs restore
// on restart. Live processes are NOT — restored tabs come back DORMANT and only
// spawn when the user clicks Start (see `started`), so nothing auto-runs a
// possibly-destructive command at launch (planning.md §5.8, §16).
export type TerminalTab = {
  id: string;
  projectId: string;
  name: string;
  shell: ShellKind;
  cwd: string;
  status: "running" | "exited";
  command: string | null; // last launched command, for Restart (Phase 3)
  autoName: boolean; // true until the user manually renames; drives auto-titling
};

// A project's terminals are arranged in a resizable pane tree; leaves are
// terminals and all leaves are visible at once (a grid, not tabs).
export type PaneNode =
  | { kind: "leaf"; id: string } // id === terminalId
  | { kind: "split"; id: string; dir: "h" | "v"; children: PaneNode[] };

function containsLeaf(n: PaneNode, id: string): boolean {
  if (n.kind === "leaf") return n.id === id;
  return n.children.some((c) => containsLeaf(c, id));
}

export function leafIds(n: PaneNode): string[] {
  return n.kind === "leaf" ? [n.id] : n.children.flatMap(leafIds);
}

function splitAt(root: PaneNode, target: string, dir: "h" | "v", added: string): PaneNode {
  if (root.kind === "leaf") {
    if (root.id !== target) return root;
    return {
      kind: "split",
      id: crypto.randomUUID(),
      dir,
      children: [{ kind: "leaf", id: target }, { kind: "leaf", id: added }],
    };
  }
  return { ...root, children: root.children.map((c) => splitAt(c, target, dir, added)) };
}

function removeLeaf(root: PaneNode, leaf: string): PaneNode | null {
  if (root.kind === "leaf") return root.id === leaf ? null : root;
  const kids = root.children.map((c) => removeLeaf(c, leaf)).filter((c): c is PaneNode => c !== null);
  if (kids.length === 0) return null;
  if (kids.length === 1) return kids[0]; // collapse a split with one child
  return { ...root, children: kids };
}

type TerminalsState = {
  terminals: Record<string, TerminalTab>;
  byProject: Record<string, string[]>; // projectId -> terminal ids (for counts/iteration)
  // Each project has a LIST of pane groups ("tabs"). A plain new terminal is its
  // own group (shown alone); splitting divides the focused terminal's group into
  // panes shown together. Only the group holding the focused terminal is visible.
  groupsByProject: Record<string, PaneNode[]>;
  focusedByProject: Record<string, string | undefined>;
  started: Record<string, boolean>; // runtime-only: has this terminal's PTY been spawned?

  startTerminal: (id: string) => void;
  addTerminal: (
    projectId: string,
    cwd: string,
    // dir set => split the focused terminal; omitted => new independent tab (no split)
    opts?: { shell?: ShellKind; dir?: "h" | "v"; command?: string | null }
  ) => string;
  closeTerminal: (id: string) => void;
  moveGroup: (projectId: string, from: number, to: number) => void;
  focusTerminal: (projectId: string, id: string) => void;
  renameTerminal: (id: string, name: string) => void;
  noteCommand: (id: string, command: string) => void; // auto-title from a run command
  setCommand: (id: string, command: string) => void;
  markExited: (id: string) => void;
  markRunning: (id: string) => void;
};

export const useTerminals = create<TerminalsState>()(
  persist(
    (set) => ({
      terminals: {},
      byProject: {},
      groupsByProject: {},
      focusedByProject: {},
      started: {},

      startTerminal: (id) => set((s) => ({ started: { ...s.started, [id]: true } })),

      addTerminal: (projectId, cwd, opts = {}) => {
        const id = crypto.randomUUID();
        const { shell = "powershell", dir, command = null } = opts; // no dir => new tab, not a split
        set((s) => {
          const list = s.byProject[projectId] ?? [];
          const launched = command?.trim();
          const tab: TerminalTab = {
            id,
            projectId,
            name: launched || `Terminal ${list.length + 1}`, // auto-titled from the command if any
            shell,
            cwd,
            status: "running",
            command,
            autoName: true,
          };
          const groups = s.groupsByProject[projectId] ?? [];
          const focusedId = s.focusedByProject[projectId];
          const splitTarget =
            dir && focusedId && groups.some((g) => containsLeaf(g, focusedId)) ? focusedId : null;
          const nextGroups: PaneNode[] = splitTarget
            ? groups.map((g) => (containsLeaf(g, splitTarget) ? splitAt(g, splitTarget, dir!, id) : g))
            : [...groups, { kind: "leaf", id }]; // no dir (or nothing to split) → new tab
          return {
            terminals: { ...s.terminals, [id]: tab },
            byProject: { ...s.byProject, [projectId]: [...list, id] },
            groupsByProject: { ...s.groupsByProject, [projectId]: nextGroups },
            focusedByProject: { ...s.focusedByProject, [projectId]: id },
            started: { ...s.started, [id]: true }, // freshly created → live immediately
          };
          // ponytail: PTY spawn happens in TerminalView on mount, once xterm knows
          // its real cols/rows — the store only tracks metadata + layout.
        });
        return id;
      },

      closeTerminal: (id) =>
        set((s) => {
          const tab = s.terminals[id];
          if (!tab) return s;
          const pid = tab.projectId;
          const list = (s.byProject[pid] ?? []).filter((x) => x !== id);
          const nextGroups = (s.groupsByProject[pid] ?? [])
            .map((g) => removeLeaf(g, id))
            .filter((g): g is PaneNode => g !== null); // drops a group emptied by this close
          const { [id]: _drop, ...restTerminals } = s.terminals;
          const focused = s.focusedByProject[pid] === id ? list[list.length - 1] : s.focusedByProject[pid];
          return {
            terminals: restTerminals,
            byProject: { ...s.byProject, [pid]: list },
            groupsByProject: { ...s.groupsByProject, [pid]: nextGroups },
            focusedByProject: { ...s.focusedByProject, [pid]: focused },
          };
          // TerminalView's unmount cleanup calls pty_close for the removed leaf.
        }),

      focusTerminal: (projectId, id) =>
        set((s) => ({ focusedByProject: { ...s.focusedByProject, [projectId]: id } })),

      moveGroup: (projectId, from, to) =>
        set((s) => {
          const groups = s.groupsByProject[projectId];
          if (!groups || from === to || from < 0 || to < 0 || from >= groups.length || to >= groups.length)
            return s;
          const next = groups.slice();
          const [g] = next.splice(from, 1);
          next.splice(to, 0, g);
          return { groupsByProject: { ...s.groupsByProject, [projectId]: next } };
        }),

      renameTerminal: (id, name) =>
        set((s) => {
          const tab = s.terminals[id];
          if (!tab || !name.trim()) return s;
          // Manual rename opts this terminal out of auto-titling.
          return { terminals: { ...s.terminals, [id]: { ...tab, name: name.trim(), autoName: false } } };
        }),

      noteCommand: (id, command) =>
        set((s) => {
          const tab = s.terminals[id];
          const c = command.trim();
          if (!tab || !tab.autoName || !c || tab.name === c) return s;
          return { terminals: { ...s.terminals, [id]: { ...tab, name: c } } };
        }),

      setCommand: (id, command) =>
        set((s) => {
          const tab = s.terminals[id];
          if (!tab) return s;
          return { terminals: { ...s.terminals, [id]: { ...tab, command } } };
        }),

      markExited: (id) =>
        set((s) => {
          const tab = s.terminals[id];
          if (!tab) return s;
          return { terminals: { ...s.terminals, [id]: { ...tab, status: "exited" } } };
        }),

      markRunning: (id) =>
        set((s) => {
          const tab = s.terminals[id];
          if (!tab) return s;
          return { terminals: { ...s.terminals, [id]: { ...tab, status: "running" } } };
        }),
    }),
    {
      name: "vibedock.terminals.v1",
      version: 3,
      migrate: (state, version) => {
        const s = state as Record<string, unknown>;
        // v1 stored a single layout tree per project; v2 stores a list of groups.
        if (version < 2 && s.layoutByProject) {
          const old = s.layoutByProject as Record<string, PaneNode | undefined>;
          const groups: Record<string, PaneNode[]> = {};
          for (const [pid, tree] of Object.entries(old)) if (tree) groups[pid] = [tree];
          s.groupsByProject = groups;
          delete s.layoutByProject;
        }
        // v3 added autoName — default existing terminals to true.
        if (version < 3 && s.terminals) {
          for (const t of Object.values(s.terminals as Record<string, TerminalTab>))
            if (t.autoName === undefined) t.autoName = true;
        }
        return s;
      },
      // `started` is deliberately excluded: on restart every terminal is dormant.
      partialize: (s) => ({
        terminals: s.terminals,
        byProject: s.byProject,
        groupsByProject: s.groupsByProject,
        focusedByProject: s.focusedByProject,
      }),
    }
  )
);

// Per-terminal serialized op queue. PTY lifecycle calls (spawn / close /
// kill+respawn) MUST run in order for a given id — otherwise a StrictMode
// double-mount or a rapid Restart can interleave spawn/close on the same id and
// leave a killed-but-just-respawned (or double-spawned) shell.
const chains = new Map<string, Promise<unknown>>();
export function enqueuePty(id: string, op: () => Promise<unknown>): Promise<unknown> {
  const prev = chains.get(id) ?? Promise.resolve();
  const next = prev.catch(() => {}).then(op);
  chains.set(id, next);
  void next.finally(() => {
    if (chains.get(id) === next) chains.delete(id);
  });
  return next;
}

// Restart handlers are registered by each mounted TerminalView (it owns the
// xterm dims needed to re-spawn). Kept out of the reactive store on purpose.
const restarters = new Map<string, () => void>();
export function registerRestarter(id: string, fn: () => void): () => void {
  restarters.set(id, fn);
  return () => {
    if (restarters.get(id) === fn) restarters.delete(id);
  };
}
export function runRestart(id: string): void {
  restarters.get(id)?.();
}
