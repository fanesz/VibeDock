import type { CommandSet, CustomCommand, Project } from "@types";
import { toast } from "sonner";
import { create } from "zustand";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { persist } from "zustand/middleware";

const STORAGE_KEY = "vibedock.workspace.v1";
const MAX_RECENTS = 12;

function basename(p: string): string {
  const parts = p.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? p;
}

type WorkspaceState = {
  projects: Record<string, Project>; // all known (open + recent history)
  openProjectIds: string[]; // currently open, in tab order
  activeProjectId: string | null;
  globalCommands: CustomCommand[]; // available in every project
  claudeSkipPermissions: boolean; // global: append --dangerously-skip-permissions on claude launch
  setClaudeSkipPermissions: (v: boolean) => void;

  openProjectDialog: () => Promise<void>; // pick a folder, create-or-open it
  reopenProject: (id: string) => void; // open a known/recent project by id
  activateProject: (id: string) => void;
  closeProject: (id: string) => void; // keep in history, drop from open
  moveProject: (from: number, to: number) => void; // reorder the open list
  renameProject: (id: string, name: string) => void;
  removeRecent: (id: string) => void; // forget a not-open project entirely
  setNotepad: (projectId: string, text: string) => void; // per-project scratch text

  addCommand: (projectId: string, cmd: Omit<CustomCommand, "id">) => void;
  updateCommand: (projectId: string, cmd: CustomCommand) => void;
  deleteCommand: (projectId: string, commandId: string) => void;

  addGlobalCommand: (cmd: Omit<CustomCommand, "id">) => void;
  updateGlobalCommand: (cmd: CustomCommand) => void;
  deleteGlobalCommand: (commandId: string) => void;

  addCommandSet: (projectId: string, set: Omit<CommandSet, "id">) => void;
  updateCommandSet: (projectId: string, set: CommandSet) => void;
  deleteCommandSet: (projectId: string, setId: string) => void;
};

// ponytail: zustand's own persist middleware IS the "one centralized module"
// over localStorage — no hand-rolled load/save code needed.
export const useWorkspace = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      projects: {},
      openProjectIds: [],
      activeProjectId: null,
      globalCommands: [],
      claudeSkipPermissions: false,

      setClaudeSkipPermissions: (v) => set({ claudeSkipPermissions: v }),

      openProjectDialog: async () => {
        let picked: string | string[] | null;
        try {
          picked = await openDialog({ directory: true, multiple: false, title: "Open project folder" });
        } catch (e) {
          toast.error(`Could not open folder picker: ${e}`);
          return;
        }
        if (typeof picked !== "string") return; // cancelled

        const id = picked; // canonical path doubles as the stable id
        set((s) => {
          const now = Date.now();
          const existing = s.projects[id];
          const project: Project = existing
            ? { ...existing, customCommands: existing.customCommands ?? [], lastOpenedAt: now }
            : { id, name: basename(id), path: id, addedAt: now, lastOpenedAt: now, customCommands: [] };
          return {
            projects: { ...s.projects, [id]: project },
            openProjectIds: s.openProjectIds.includes(id)
              ? s.openProjectIds
              : [...s.openProjectIds, id],
            activeProjectId: id,
          };
        });
      },

      reopenProject: (id) => {
        const proj = get().projects[id];
        if (!proj) return;
        set((s) => ({
          openProjectIds: s.openProjectIds.includes(id)
            ? s.openProjectIds
            : [...s.openProjectIds, id],
          activeProjectId: id,
          projects: { ...s.projects, [id]: { ...proj, lastOpenedAt: Date.now() } },
        }));
      },

      activateProject: (id) =>
        set((s) => {
          const proj = s.projects[id];
          if (!proj) return s;
          return {
            activeProjectId: id,
            projects: { ...s.projects, [id]: { ...proj, lastOpenedAt: Date.now() } },
          };
        }),

      closeProject: (id) =>
        set((s) => {
          const remaining = s.openProjectIds.filter((x) => x !== id);
          const active =
            s.activeProjectId === id ? (remaining[remaining.length - 1] ?? null) : s.activeProjectId;
          return { openProjectIds: remaining, activeProjectId: active };
        }),

      moveProject: (from, to) =>
        set((s) => {
          const ids = s.openProjectIds;
          if (from === to || from < 0 || to < 0 || from >= ids.length || to >= ids.length) return s;
          const next = ids.slice();
          const [id] = next.splice(from, 1);
          next.splice(to, 0, id);
          return { openProjectIds: next };
        }),

      renameProject: (id, name) =>
        set((s) => {
          const proj = s.projects[id];
          if (!proj || !name.trim()) return s;
          return { projects: { ...s.projects, [id]: { ...proj, name: name.trim() } } };
        }),

      removeRecent: (id) =>
        set((s) => {
          if (s.openProjectIds.includes(id)) return s; // guard: never drop an open project
          const { [id]: _drop, ...rest } = s.projects;
          return { projects: rest };
        }),

      setNotepad: (projectId, text) =>
        set((s) => {
          const p = s.projects[projectId];
          if (!p) return s;
          return { projects: { ...s.projects, [projectId]: { ...p, notepad: text } } };
        }),

      addCommand: (projectId, cmd) =>
        set((s) => {
          const p = s.projects[projectId];
          if (!p) return s;
          const next: CustomCommand = { ...cmd, id: crypto.randomUUID() };
          return {
            projects: {
              ...s.projects,
              [projectId]: { ...p, customCommands: [...(p.customCommands ?? []), next] },
            },
          };
        }),

      updateCommand: (projectId, cmd) =>
        set((s) => {
          const p = s.projects[projectId];
          if (!p) return s;
          return {
            projects: {
              ...s.projects,
              [projectId]: {
                ...p,
                customCommands: (p.customCommands ?? []).map((c) => (c.id === cmd.id ? cmd : c)),
              },
            },
          };
        }),

      deleteCommand: (projectId, commandId) =>
        set((s) => {
          const p = s.projects[projectId];
          if (!p) return s;
          return {
            projects: {
              ...s.projects,
              [projectId]: {
                ...p,
                customCommands: (p.customCommands ?? []).filter((c) => c.id !== commandId),
              },
            },
          };
        }),

      addGlobalCommand: (cmd) =>
        set((s) => ({ globalCommands: [...s.globalCommands, { ...cmd, id: crypto.randomUUID() }] })),

      updateGlobalCommand: (cmd) =>
        set((s) => ({
          globalCommands: s.globalCommands.map((c) => (c.id === cmd.id ? cmd : c)),
        })),

      deleteGlobalCommand: (commandId) =>
        set((s) => ({ globalCommands: s.globalCommands.filter((c) => c.id !== commandId) })),

      addCommandSet: (projectId, set_) =>
        set((s) => {
          const p = s.projects[projectId];
          if (!p) return s;
          const next: CommandSet = { ...set_, id: crypto.randomUUID() };
          return {
            projects: {
              ...s.projects,
              [projectId]: { ...p, commandSets: [...(p.commandSets ?? []), next] },
            },
          };
        }),

      updateCommandSet: (projectId, cmdSet) =>
        set((s) => {
          const p = s.projects[projectId];
          if (!p) return s;
          return {
            projects: {
              ...s.projects,
              [projectId]: {
                ...p,
                commandSets: (p.commandSets ?? []).map((x) => (x.id === cmdSet.id ? cmdSet : x)),
              },
            },
          };
        }),

      deleteCommandSet: (projectId, setId) =>
        set((s) => {
          const p = s.projects[projectId];
          if (!p) return s;
          return {
            projects: {
              ...s.projects,
              [projectId]: {
                ...p,
                commandSets: (p.commandSets ?? []).filter((x) => x.id !== setId),
              },
            },
          };
        }),
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      partialize: (s) => ({
        projects: s.projects,
        openProjectIds: s.openProjectIds,
        activeProjectId: s.activeProjectId,
        globalCommands: s.globalCommands,
        claudeSkipPermissions: s.claudeSkipPermissions,
      }),
    }
  )
);

// Pure derivation used by the rail (call inside useMemo over the raw slices).
export function deriveRecents(
  projects: Record<string, Project>,
  openProjectIds: string[]
): Project[] {
  return Object.values(projects)
    .filter((p) => !openProjectIds.includes(p.id))
    .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)
    .slice(0, MAX_RECENTS);
}
