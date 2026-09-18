# VibeDock — Handoff (for bug-fixing & testing)

Status: **all 6 phases implemented; run in the GUI and iterated on.** Actively used
on Windows. See `planning.md` for the original spec.

## What it is
A Windows desktop "developer command center" (Tauri 2 + React 19). Manage multiple
projects, each with real PTY terminals, custom commands, file search, Git, Claude Code,
and a per-project notepad — in one custom-chrome window.

## Stack
- **Frontend:** React 19 + TypeScript + Vite 7 + Tailwind 4, Zustand (persisted to localStorage), SWR (async reads), xterm.js, react-resizable-panels v4, highlight.js.
- **Backend:** Rust / Tauri 2 — portable-pty (ConPTY), git2 + git CLI, `ignore` crate.
- No HTTP backend; frontend ⇄ Rust via `invoke()` + events.

## Run
```
make dev          # or: bun run tauri dev
```
Build checks (all currently pass):
```
bun run build     # tsc + vite
bun run lint      # eslint (0 problems)
cargo check --manifest-path src-tauri/Cargo.toml
```
> Config/Rust changes (tauri.conf.json, capabilities, any `src-tauri` edit) need a full
> `tauri dev` restart — HMR won't pick them up.

## File map
**Rust (`src-tauri/src/`)**
- `lib.rs` — registers all commands + PtyManager
- `pty.rs` — multi-session PTY: `pty_spawn/write/resize/close/kill_tree`, `available_shells`; per-id events `pty://output/{id}`, `pty://exit/{id}`. Sets `TERM=xterm-256color`/`COLORTERM=truecolor` so TUIs render.
- `git.rs` — git2 for status/stage/unstage/commit/diff/branches/log/**commit_diff**/**repos**; git CLI for push/pull/fetch/**merge**
- `tools.rs` — `list_files`, `read_file_preview`, `open_in_vscode`, `open_in_explorer`, `reveal_in_explorer`, `kill_port`
- `claude.rs` — `claude_sessions` (reads `~/.claude/projects/*.jsonl`, matches by `cwd`)

**Frontend (`src/`)**
- `stores/workspace` — projects, open/recent, per-project custom commands + **command sets** + **notepad**, **globalCommands**, **claudeSkipPermissions** (persisted `vibedock.workspace.v1`); `moveProject`, `setNotepad`
- `stores/terminals` — terminal metadata + **per-project list of pane groups** (`groupsByProject`), auto-title, `moveGroup` (persisted `vibedock.terminals.v1`, **v3**); `enqueuePty` op queue, restart registry
- `stores/git` — SWR hooks (`keepPreviousData`), `useGitRepos`; `stores/ui` — active view + quick-open
- `common/components/` — AppShell, **TitleBar**, ProjectsRail, ActivityBar, TerminalsLayer, ProjectTerminals, TerminalView (+ **engine.ts**), CommandsView, GitView, ClaudeView, **NotepadView**, QuickOpen, StatusBar, ErrorBoundary

## Architecture notes (important for debugging)
- **Custom title bar** (`TitleBar`, `decorations: false`): logo · Tools menu (Kill port) · centered "VibeDock" · min/max/close. Drag via `data-tauri-drag-region`; needs the `core:window:*` + `start-dragging` permissions in `capabilities/default.json`. `dragDropEnabled: false` so in-webview HTML5 drag-and-drop works.
- **Terminal engines live outside React** (`TerminalView/engine.ts`): each xterm + PTY is kept in a module registry and its DOM is re-parented on remount, so splitting / closing / tab-switching **never respawns** other terminals. React unmount only *schedules* disposal (250ms grace); a remount cancels it.
- **Tabs-of-groups terminal model**: each project has a *list* of pane groups. A plain new terminal is its own group (shown alone); the split buttons split the focused terminal's group. Only the focused terminal's group is visible; the tab bar switches between them. Split groups render on a shared "track" and drag-reorder as one unit.
- **Hidden panes don't fit** — `createEngine` skips `fit()` when the container is hidden (FitAddon would clamp to a 2×1 PTY and garble the shell); spawns at 80×24 and refits when shown.
- **Auto-title**: a terminal's tab name follows its launched command, or the command you type at the prompt (keystroke capture gated on xterm's *normal* buffer + a CSI/SS3 escape-seq skipper so TUIs/arrows don't pollute it). Manual rename opts out.
- **Terminals stay mounted** across view/project switches (hidden via CSS). **PTY ops serialized per-id** (`enqueuePty`). **Restart** = `pty_kill_tree` → respawn same id → re-send command. **Dormant restore** = restored tabs show "Start"; nothing auto-runs at launch.
- **Git = GitHub-Desktop style**: `git_repos` returns the root repo, or its immediate child repos (backend/, frontend/) if the root isn't one → repo picker. Changes/History tabs; **checkbox staging** (checked = staged); right pane is pure diff; branch dropdown (filter / new / merge); one **sync button** (Pull if behind → Push if ahead → Fetch); history supports single + shift-range diff via `git_commit_diff`. `keepPreviousData` keeps the layout while switching repos.
- **Command sets** (per project): a named group that opens one terminal per command at once; if the only terminal is an untouched default it's replaced instead of leaving a blank tab.
- **Notepad** (`NotepadView`, per project, persisted via `setNotepad`): a plain `<textarea>` with a line-number gutter and VS Code-style editing shortcuts. Individual lines can't be styled inside a textarea, so it renders text twice: a transparent textarea (caret + editing) sits on top of a **backdrop `<div>`** that mirrors the same text with `//`-prefixed lines shown dimmed + `line-through`. Gutter, backdrop and textarea share one `TEXT` metrics class (`font-mono text-sm leading-8`) and identical padding so they align pixel-for-pixel; textarea `onScroll` syncs the other two. Line ops (`Ctrl+/` comment-toggle, `Alt+↑↓` move, `Alt+Shift+↑↓` duplicate) rewrite the string and restore the caret via a `pendingSel` ref in `useLayoutEffect`.
- **Animations**: `vd-pop` (menus), `vd-fade`/`vd-scale-in` (modals), global button color transitions — in `src/index.css`.

## Keyboard
- `Ctrl+P` — quick file open (global) · `Ctrl+`` ` — new terminal in active project
- **Notepad** (when focused): `Ctrl+/` toggle `// ` comment (renders struck-through) · `Alt+↑/↓` move line(s) · `Alt+Shift+↑/↓` duplicate line(s) · `Tab` indent 2 spaces

## Known limitations / prime suspects
1. **CSP is `null`** (tauri.conf.json) — set a restrictive one before shipping (don't mid-testing; breaks xterm/hljs styling).
2. With `decorations: false`, native edge-resize/snap on Windows relies on Tauri's undecorated-but-resizable behavior — verify on the target build; `decorum`/manual handles are the fallback.
3. VS Code / Explorer / kill-port shell out to `code`/`explorer`/`npx` on PATH; a path containing `&` could still confuse `cmd` (rare).
4. Auto-title keystroke capture is a prompt heuristic (abandons the line on arrow keys) — never mislabels, just skips.
5. Merge uses git CLI `--no-edit`; conflicts show as `!` in the file list (resolve in an editor, then stage). No in-app 3-way merge.
6. Git commit-range view shows one combined patch (no per-file sidebar / per-hunk staging yet).
7. Untracked-dir git status recurses per-file (slow on huge non-gitignored dirs). No file-tree browser (search + preview only) — by design.

## Suggested test checklist
- [ ] Open 2–3 folders → drag to reorder → restart app → projects/order/layout/dormant terminals restore
- [ ] Right-click project → Open folder / Reveal in Explorer / Open in VS Code (new window) / Rename / Close-Forget
- [ ] New terminal = new tab (no split); split right/down; drag-resize dividers; drag tabs to reorder (groups move together)
- [ ] Interactive TUI (`claude`, `vim`) renders correctly + `ping -t` in split panes; Ctrl+C works
- [ ] Command set opens N terminals at once; reuses a blank default terminal
- [ ] Global vs per-project custom commands; edit modal can move a command between scopes
- [ ] Claude view: New / Continue / Resume; `--dangerously-skip-permissions` toggle applies
- [ ] Git (root repo AND backend/frontend child repos via picker): checkbox stage → commit; branch switch/new/merge; sync button Pull/Push/Fetch; history single + shift-range diff
- [ ] Title bar: drag, double-click maximize, min/max/close; Tools → Kill port
- [ ] Notepad persists per project; `Ctrl+/` comments+strikes lines; `Alt`/`Alt+Shift` arrow move/duplicate (incl. moving line 2 up into an empty line 1); line numbers track content

## Reset persisted state during testing
Clear localStorage keys `vibedock.workspace.v1` and `vibedock.terminals.v1` (DevTools) if state gets weird.

---

## Changelog — post-spec session (UX/feature pass)
**Terminals**
- Fixed blank/garbled TUIs: `windowsPty: { backend: "conpty" }`, `TERM`/`COLORTERM` env, scrollback 5000, hidden-pane fit guard. Font → Consolas 14 (VS Code default).
- Fixed terminal collapsing to ~1 row (`TerminalsLayer` `flex-1` under a non-flex parent → `h-full`).
- Rewrote split model to tabs-of-groups (default no split; split only via buttons).
- Moved xterm+PTY into an engine registry so add/remove/split no longer respawns other terminals.
- Tab bar: auto-title from command, visual grouping of splits, drag-reorder, fixed width, restart moved to the top-right toolbar.

**Custom commands**
- Global + per-project scopes; removed the working-dir field; modal add/edit UI.
- **Command sets** — launch multiple terminals at once (per project); reuses an untouched default terminal.

**Git** — full GitHub-Desktop-style rewrite: child-repo detection + repo picker, Changes/History tabs, checkbox staging, pure diff pane, rich branch dropdown (new/merge), combined sync button, commit-range diff, `keepPreviousData` loading fix.

**Claude** — global `--dangerously-skip-permissions` toggle.

**Shell / window** — custom VS Code-style title bar (`decorations:false`) with Tools menu + Kill port; app icons generated from `public/images/logo.png`; window 1360×860; `dragDropEnabled:false`.

**Projects** — drag-reorder; right-click context menu (open folder / reveal / VS Code / rename / close-forget). Fixed `open_in_vscode` double-quote bug (now `-n` new window) and added Explorer commands.

**Polish** — dark + smaller toasts; pop/fade/scale animations + button transitions; activity bar order Git-before-Commands.

**Notepad** — new per-project view (activity bar). Plain textarea + line-number gutter + strikethrough-backdrop overlay. Shortcuts: `Ctrl+/` toggles a `// ` prefix (rendered struck-through in the backdrop — no Unicode combining chars), `Alt+↑↓` move line(s), `Alt+Shift+↑↓` duplicate line(s), `Tab` indent. Fixed move-up bug when the target is an empty first line (`lastIndexOf` negative-fromIndex clamp).
