# VibeDock

**A developer command center for AI-assisted workflows.** One window to manage
all your projects — each with real interactive terminals, one-click launch
commands, a graphical Git manager, first-class Claude Code launch/resume, live
subscription-usage limits, and a per-project notepad. Stop opening a full IDE
just to get terminals and project tooling.

> Windows desktop app · Tauri 2 + React 19 · dark-first, keyboard-friendly.

---

## Features

- **Multi-project workspace** — open any number of folders in one window; switch
  between them without tearing down running terminals. Drag to reorder; recents
  and layout persist across restarts.
- **Real terminals** — multiple PTY-backed terminals per project (ConPTY), full
  ANSI/color, `Ctrl+C`, resize, and interactive TUIs (`claude`, `vim`, …). Split
  into a resizable grid, tab between groups, drag to rearrange. Restart a hung
  dev server (whole process tree) in one click.
- **Custom commands & command sets** — save per-project or global launch commands;
  a *command set* opens one terminal per command at once (e.g. backend + frontend
  + db). Launch straight from the top bar.
- **Git manager** — GitHub-Desktop-style: repo picker for child repos, Changes /
  History tabs, checkbox staging, pure diff pane, branch create/switch/merge, and
  a single smart Sync button (pull → push → fetch).
- **Claude Code, first-class** — launch a new session, continue the last, or
  resume any prior session from a history list — all in a real terminal. Optional
  `--dangerously-skip-permissions` toggle.
- **Live usage limits** — a status-bar indicator shows your Claude subscription's
  **5-hour** and **weekly** limits as percentages, with a hover card for reset
  countdowns. Reads the same usage endpoint Claude Code's `/usage` uses.
- **Quick file open** — `Ctrl+P` fuzzy finder with read-only, syntax-highlighted
  preview (respects `.gitignore`; never walks `node_modules`, `.git`, `dist`, …).
- **Per-project notepad** — a scratch pad with a line-number gutter and VS Code-style
  line editing shortcuts.
- **Tools** — kill a stuck port, open the project in VS Code / Explorer, and more.

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+P` | Quick file open |
| `` Ctrl+` `` | New terminal in the active project |
| `Ctrl+/` | Notepad: toggle `//` comment on line(s) |
| `Alt+↑ / ↓` | Notepad: move line(s) |
| `Alt+Shift+↑ / ↓` | Notepad: duplicate line(s) |

## Requirements

- **Windows 10/11** (initial target platform).
- [WebView2 runtime](https://developer.microsoft.com/microsoft-edge/webview2/)
  (preinstalled on current Windows).
- Optional integrations, detected at runtime: **Git**, the **`claude`** CLI,
  **VS Code** (`code` on `PATH`).

## Install

Prebuilt installers are published on the [Releases](../../releases) page. Download
the latest `.msi` / `.exe`, run it, and launch VibeDock.

## Build from source

Prerequisites:

- [Bun](https://bun.sh)
- [Rust](https://rustup.rs) (stable, MSVC toolchain)
- Tauri's Windows prerequisites (MSVC Build Tools + WebView2) —
  see the [Tauri guide](https://tauri.app/start/prerequisites/).

```bash
bun install

# Run the desktop app in dev (HMR for the frontend)
bun run tauri dev

# Produce an installer in src-tauri/target/release/bundle/
bun run tauri build
```

Quality checks:

```bash
bun run build     # tsc + vite
bun run lint      # eslint
cargo check --manifest-path src-tauri/Cargo.toml
```

> Any change under `src-tauri/` (Rust, `tauri.conf.json`, capabilities) needs a
> full `tauri dev` restart — frontend HMR won't pick it up.

## Tech stack

- **Frontend:** React 19 · TypeScript · Vite 7 · Tailwind 4 · Zustand (persisted
  to `localStorage`) · SWR · xterm.js · react-resizable-panels · highlight.js.
- **Backend:** Rust / Tauri 2 — `portable-pty` (ConPTY), `git2` + git CLI, the
  `ignore` crate for file walks, `reqwest` for the usage endpoint.
- No HTTP server: the frontend talks to Rust via `invoke()` + events.

## Data & privacy

VibeDock is a local-only tool. Workspace state (projects, terminals, commands,
notepad) is stored in `localStorage`. The usage-limits indicator reads your
existing Claude OAuth token from `~/.claude/.credentials.json` to call
Anthropic's usage endpoint — nothing is sent anywhere else, and no telemetry is
collected.

## Known limitations

- Windows only for now (the architecture keeps most logic portable).
- Git network ops use the git CLI (reusing your credential helpers); merge
  conflicts are surfaced but there's no in-app 3-way merge editor.
- Not a code editor — no LSP, debugger, or in-app editing (by design).

## License

_No license chosen yet — add a `LICENSE` file before public release._
