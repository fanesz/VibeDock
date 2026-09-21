// Central action registry + keyboard-shortcut plumbing. The launch helpers used
// to live inline in TitleBar; they're here now so both the menus AND the global
// shortcut handler dispatch through one place.
import type { CommandSet, Project, ShellKind } from "@types";
import { sendToTerminal } from "@components/TerminalView/engine";
import { useTerminals } from "@stores/terminals";
import { useUI } from "@stores/ui";
import { useWorkspace } from "@stores/workspace";
import { invoke } from "@tauri-apps/api/core";

// --- Launch helpers (act on the active project; no view of their own) ---

// The focused terminal's id IF it's live and idle (at a prompt, no running
// process) — so a command can reuse it instead of opening a new tab.
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
export async function runCommand(project: Project, command: string, shell?: ShellKind) {
  const reuse = await idleFocusedId(project);
  if (!(reuse && sendToTerminal(reuse, command))) {
    useTerminals.getState().addTerminal(project.id, project.path, { shell, command });
  }
  useUI.getState().setView("terminals");
}

// A set opens one terminal per command; the first reuses an idle focused
// terminal (so no blank tab), the rest open fresh.
export async function runSet(project: Project, s: CommandSet) {
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

// --- Actions bindable to keyboard shortcuts ---

export type ActionId =
  | "quickOpen"
  | "settings.open"
  | "terminal.new"
  | "claude.new"
  | "claude.continue"
  | "claude.history"
  | "tools.killPort";

// `defaultKey` uses the same serialized form as eventCombo() below (KeyboardEvent.code).
export const ACTIONS: { id: ActionId; label: string; group: string; defaultKey: string }[] = [
  { id: "quickOpen", label: "Quick open file", group: "General", defaultKey: "Ctrl+KeyP" },
  { id: "settings.open", label: "Open settings", group: "General", defaultKey: "Ctrl+Comma" },
  { id: "terminal.new", label: "New terminal", group: "Terminal", defaultKey: "Ctrl+Backquote" },
  { id: "claude.new", label: "Claude: New session", group: "Claude Code", defaultKey: "Ctrl+Shift+KeyN" },
  { id: "claude.continue", label: "Claude: Continue last session", group: "Claude Code", defaultKey: "Ctrl+Shift+KeyO" },
  { id: "claude.history", label: "Claude: Show history", group: "Claude Code", defaultKey: "Ctrl+Shift+KeyY" },
  { id: "tools.killPort", label: "Tools: Kill port", group: "Tools", defaultKey: "Ctrl+Shift+KeyK" },
];

function activeProject(): Project | null {
  const ws = useWorkspace.getState();
  return ws.activeProjectId ? ws.projects[ws.activeProjectId] : null;
}

function claudeCmd(base: string): string {
  return useWorkspace.getState().claudeSkipPermissions ? `${base} --dangerously-skip-permissions` : base;
}

export function runAction(id: ActionId): void {
  const ui = useUI.getState();
  switch (id) {
    case "quickOpen":
      ui.setQuickOpen(!ui.quickOpen);
      return;
    case "settings.open":
      ui.setModal("settings");
      return;
    case "tools.killPort":
      ui.setModal("killPort");
      return;
  }
  // Project-scoped actions below.
  const p = activeProject();
  if (!p) return;
  switch (id) {
    case "terminal.new":
      useTerminals.getState().addTerminal(p.id, p.path);
      ui.setView("terminals");
      return;
    case "claude.new":
      void runCommand(p, claudeCmd("claude"));
      return;
    case "claude.continue":
      void runCommand(p, claudeCmd("claude --continue"));
      return;
    case "claude.history":
      ui.setModal("history");
      return;
  }
}

// --- Key-combo (de)serialization: uses KeyboardEvent.code so it's layout-stable ---

// Returns null for modifier-only presses (so the recorder waits for a real key).
export function eventCombo(e: KeyboardEvent): string | null {
  const code = e.code;
  if (!code || /^(Control|Alt|Shift|Meta|OS)/.test(code)) return null;
  const parts: string[] = [];
  if (e.ctrlKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  if (e.metaKey) parts.push("Meta");
  parts.push(code);
  return parts.join("+");
}

// Human-friendly rendering of a serialized combo, e.g. "Ctrl+Shift+KeyN" → "Ctrl+Shift+N".
export function prettyCombo(combo: string): string {
  return combo
    .split("+")
    .map((p) =>
      p
        .replace(/^Key/, "")
        .replace(/^Digit/, "")
        .replace("Backquote", "`")
        .replace("Backslash", "\\")
        .replace("Comma", ",")
        .replace("Period", ".")
        .replace("Slash", "/")
        .replace("Minus", "-")
        .replace("Equal", "=")
        .replace("Space", "Space")
    )
    .join("+");
}

// While the settings recorder is capturing a keypress, the global dispatcher
// stands down so recording a combo doesn't also fire the action.
let capturing = false;
export const setCapturing = (b: boolean) => {
  capturing = b;
};
export const isCapturing = () => capturing;
