// Terminal "engines" live OUTSIDE React so a terminal's xterm instance + PTY
// session survive when React remounts its <TerminalView> (which happens whenever
// the pane tree restructures — split, unsplit, tab switch). We just re-parent the
// xterm DOM node instead of tearing it down, so nothing respawns or "refreshes".
import { enqueuePty, registerRestarter, useTerminals, type TerminalTab } from "@stores/terminals";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";

const delay = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

type Engine = { term: Terminal; fit: FitAddon; alive: boolean; cleanup: () => void };

const engines = new Map<string, Engine>();
// A release (React unmount) schedules disposal; a re-acquire within the grace
// window cancels it. That's what distinguishes a remount (split/tab switch —
// keep alive) from a real close/project-close (no remount — dispose).
const pendingDispose = new Map<string, ReturnType<typeof setTimeout>>();

function createEngine(container: HTMLDivElement, tab: TerminalTab): Engine {
  const term = new Terminal({
    fontFamily: "Consolas, 'Courier New', monospace", // match VS Code's default terminal font
    fontSize: 14,
    cursorBlink: true,
    scrollback: 5000,
    // Without this, xterm mishandles ConPTY's cursor/wrap sequences and
    // full-screen TUIs (Claude Code, vim) render blank/garbled.
    windowsPty: { backend: "conpty" },
    theme: { background: "#09090b", foreground: "#e4e4e7" },
  });
  const fit = new FitAddon();
  term.loadAddon(fit);
  term.open(container);

  const id = tab.id;

  // Ctrl+Enter / Shift+Enter → insert newline instead of submit. xterm sends
  // plain `\r` for both (no ctrl/shift handling on Enter), so Claude Code submits.
  // Send meta+Enter (ESC CR), which Claude Code reads as "insert newline".
  // preventDefault is REQUIRED: returning false alone doesn't stop the browser
  // inserting a newline into xterm's hidden <textarea>, which it then forwards as
  // a second keystroke → a submit. (That's why Shift+Enter misbehaved but not Ctrl.)
  term.attachCustomKeyEventHandler((e) => {
    if (e.type === "keydown" && e.key === "Enter" && (e.ctrlKey || e.shiftKey)) {
      e.preventDefault();
      void invoke("pty_write", { id, data: "\x1b\r" });
      return false; // suppress xterm's default `\r`
    }
    // VS Code-style Ctrl+C: copy when text is selected, else fall through so the
    // shell still gets SIGINT (Ctrl+C with no selection interrupts as normal).
    if (e.type === "keydown" && e.ctrlKey && !e.shiftKey && !e.altKey && e.key === "c" && term.hasSelection()) {
      void navigator.clipboard.writeText(term.getSelection());
      e.preventDefault();
      return false;
    }
    return true;
  });
  // Only fit if the pane is actually laid out. On a hidden pane (a set opens
  // several tabs; only one is visible) the element measures 0 and FitAddon clamps
  // to a 2x1 PTY — which garbles the shell. xterm's 80x24 default is valid until
  // the visible-effect refit runs when the tab is shown.
  if (container.offsetParent !== null) fit.fit();

  const engine: Engine = { term, fit, alive: true, cleanup: () => {} };

  // Auto-title: sniff the command line the user types at a shell prompt. Gated on
  // the NORMAL buffer so a full-screen TUI (Claude Code, vim) never pollutes it.
  let lineBuf = "";
  let esc = 0; // escape-sequence state: 0 none · 1 saw ESC · 2 in CSI (ESC[) · 3 in SS3 (ESCO)
  term.onData((d) => {
    void invoke("pty_write", { id, data: d });
    if (term.buffer.active.type !== "normal") {
      lineBuf = "";
      esc = 0;
      return;
    }
    for (const ch of d) {
      const code = ch.charCodeAt(0);
      // Skip whole escape sequences (arrows, focus/cursor reports) — not typed text.
      if (esc === 1) {
        esc = ch === "[" ? 2 : ch === "O" ? 3 : 0;
        continue;
      }
      if (esc === 2) {
        if (code >= 0x40 && code <= 0x7e) esc = 0; // CSI final byte
        continue;
      }
      if (esc === 3) {
        esc = 0; // SS3 is ESC O <one char>
        continue;
      }
      if (ch === "\x1b") esc = 1;
      else if (ch === "\r" || ch === "\n") {
        const cmd = lineBuf.trim();
        lineBuf = "";
        if (cmd) useTerminals.getState().noteCommand(id, cmd);
      } else if (ch === "\x7f" || ch === "\b") lineBuf = lineBuf.slice(0, -1);
      else if (ch === "\x03") lineBuf = ""; // Ctrl+C — abandon the line
      else if (code >= 0x20) lineBuf += ch;
    }
  });

  const outP = listen<string>(`pty://output/${id}`, (e) => term.write(e.payload));
  const exitP = listen<number | null>(`pty://exit/${id}`, (e) => {
    const code = e.payload;
    term.write(`\r\n\x1b[90m[process exited${code == null ? "" : ` with code ${code}`}]\x1b[0m\r\n`);
    useTerminals.getState().markExited(id);
  });

  const spawn = async (cols: number, rows: number) => {
    try {
      await invoke("pty_spawn", { id, shell: tab.shell, cwd: tab.cwd, cols, rows });
    } catch (e) {
      term.write(`\r\n\x1b[31m[failed to start: ${e}]\x1b[0m\r\n`);
      useTerminals.getState().markExited(id);
      throw e;
    }
  };
  const writeCommand = async (cmd: string) => {
    await delay(350); // let the shell print its prompt first
    if (engine.alive) await invoke("pty_write", { id, data: cmd + "\r\n" });
  };

  // Initial spawn + optional auto-run, serialized on this id.
  void enqueuePty(id, async () => {
    await spawn(term.cols, term.rows);
    if (tab.command) await writeCommand(tab.command);
  });

  // Restart = kill the whole process tree, re-spawn this same id, re-send command.
  const doRestart = () =>
    void enqueuePty(id, async () => {
      const cmd = useTerminals.getState().terminals[id]?.command;
      term.reset();
      await invoke("pty_kill_tree", { id });
      await spawn(term.cols, term.rows);
      useTerminals.getState().markRunning(id);
      if (cmd) await writeCommand(cmd);
    });
  const unregister = registerRestarter(id, doRestart);

  engine.cleanup = () => {
    void outP.then((f) => f());
    void exitP.then((f) => f());
    unregister();
  };
  return engine;
}

// Mount into (or re-parent to) a container. Idempotent — safe under StrictMode.
export function acquireEngine(container: HTMLDivElement, tab: TerminalTab): void {
  const pd = pendingDispose.get(tab.id);
  if (pd) {
    clearTimeout(pd);
    pendingDispose.delete(tab.id);
  }
  let e = engines.get(tab.id);
  if (!e) {
    e = createEngine(container, tab);
    engines.set(tab.id, e);
  } else if (e.term.element && e.term.element.parentElement !== container) {
    container.appendChild(e.term.element); // move the live xterm DOM to the new pane
  }
  fitEngine(tab.id);
}

// React unmount: keep the engine alive briefly. A remount cancels the dispose;
// a genuine close lets it fire.
export function releaseEngine(id: string): void {
  if (pendingDispose.has(id)) return;
  const t = setTimeout(() => {
    pendingDispose.delete(id);
    disposeEngine(id);
  }, 250);
  pendingDispose.set(id, t);
}

function disposeEngine(id: string): void {
  const e = engines.get(id);
  if (!e) return;
  e.alive = false;
  e.cleanup();
  engines.delete(id);
  void enqueuePty(id, () => invoke("pty_close", { id }));
  e.term.dispose();
}

// Run a command in an ALREADY-LIVE terminal (types it at the prompt). Returns
// false if that terminal has no live engine (dormant/closed) so the caller can
// fall back to opening a fresh terminal instead.
export function sendToTerminal(id: string, command: string): boolean {
  const e = engines.get(id);
  if (!e || !e.alive) return false;
  const ts = useTerminals.getState();
  ts.setCommand(id, command); // so Restart re-runs it
  ts.noteCommand(id, command); // auto-title the tab from the command
  void enqueuePty(id, () => invoke("pty_write", { id, data: command + "\r\n" }));
  e.term.focus();
  return true;
}

export function fitEngine(id: string, focus = false): void {
  const e = engines.get(id);
  if (!e || !e.term.element || e.term.element.offsetParent === null) return; // hidden → dims are 0
  e.fit.fit();
  void invoke("pty_resize", { id, cols: e.term.cols, rows: e.term.rows });
  if (focus) e.term.focus();
}
