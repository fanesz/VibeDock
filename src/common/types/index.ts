// VibeDock shared types. VibeDock has no HTTP backend; state is local and
// talks to Rust via Tauri invoke(). Types here describe local workspace data.

export type ShellKind = "powershell" | "cmd" | "gitbash";

export type CustomCommand = {
  id: string;
  name: string; // e.g. "Backend"
  command: string; // e.g. "bun run dev"
  shell?: ShellKind; // overrides project default
};

// A named group that opens one terminal per command at once (per project only),
// e.g. a dev stack: "cd backend && bun run dev", "cd frontend && bun run dev".
export type CommandSet = {
  id: string;
  name: string;
  commands: string[];
  shell?: ShellKind;
};

export type Project = {
  id: string; // canonical absolute path, doubles as the stable id
  name: string; // folder basename, user-renamable
  path: string; // absolute path on disk
  addedAt: number; // epoch ms
  lastOpenedAt: number; // epoch ms
  customCommands: CustomCommand[];
  commandSets?: CommandSet[];
  notepad?: string; // free-form per-project scratch text
};
