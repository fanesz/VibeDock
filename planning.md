# VibeDock — Technical & Product Specification

> A project-centric developer command center for AI-assisted workflows (especially Claude Code), built on the existing Tauri 2 + React 19 template.
>
> **Status:** Planning. No application code beyond the template's PTY proof-of-concept exists yet.
> **Target platform:** Windows (initial). Architecture avoids gratuitous Windows coupling in the frontend.

---

## 1. Executive Summary

VibeDock is a Windows desktop app that gives developers one window to manage multiple projects, each with its own set of **real interactive terminals**, custom launch commands, file search, a graphical Git manager, and first-class Claude Code launch/resume controls. The goal is to stop opening a full IDE just to get terminals and project tooling.

The template has already made the load-bearing technical choices, and they are good ones:

- **Shell:** Tauri 2 (Rust backend) + React 19 + TypeScript + Vite 7 + Tailwind 4.
- **State:** Zustand (client/UI state) + SWR (async/derived server-ish state).
- **Terminal:** `@xterm/xterm` 6 (frontend) over `portable-pty` 0.9 (Rust), which uses **ConPTY** on Windows. A working single-session PoC already exists in `src-tauri/src/lib.rs` (`pty_spawn` / `pty_write` / `pty_resize` + `pty://output` event) and `src/pages/PowerShell/index.tsx`.

**The single most important architectural task is generalizing that single-session PoC into a keyed, multi-session PTY manager.** Everything in the terminal workspace, custom commands, restart, and Claude Code depends on it. This plan treats the PoC as the seed of the whole product and reuses the rest of the template stack verbatim.

Recommended additions (small, official, or already-standard): `git2` (libgit2) + git CLI shell-out for Git; the `ignore` crate + a fuzzy matcher for file search; `@tauri-apps/plugin-store` for JSON persistence; a few more xterm addons. No new frontend framework, no database server, no speculative infrastructure.

---

## 2. Product Goals

1. Manage **multiple projects** in one window with preserved per-project workspace state.
2. Provide **multiple real interactive terminals** per project (PTY-backed, ANSI, Ctrl+C, resize, interactive TUIs).
3. Make **repetitive project commands** (dev servers, DBs, builds) one click via per-project custom commands.
4. Provide **reliable restart** of long-running dev processes, including their child process trees.
5. Make **Claude Code** a first-class launch/resume workflow while keeping the native CLI interaction intact.
6. Provide **fast file discovery** (Ctrl+P) and **read-only preview** with syntax highlighting.
7. Provide a **graphical Git manager** for repos already inside opened projects.
8. **Persist and restore** workspace layout safely, without auto-executing arbitrary commands on startup.
9. Feel **fast, dark-first, keyboard-friendly**, and visually distinct from a VS Code clone.

## 3. Non-Goals

- Not a code editor. No internal editing, no LSP, no IntelliSense, no debugger.
- Not a Claude Code chat-UI replacement. VibeDock wraps the CLI; it does not reimplement its interaction model.
- No cross-platform support in v1 (architecture stays portable where cheap, but macOS/Linux are not tested or shipped).
- No GitHub/GitLab/Bitbucket API integrations in v1 (PRs, issues, cloud auth flows) — Git operations use local git only.
- No remote/SSH terminals, no cloud sync, no multi-user, no plugin marketplace.
- No terminal session *process* persistence across app restart (processes are ephemeral by OS design — only metadata is restored).

---

## 4. User Workflows

**W1 — Open and switch projects.** User picks a folder → it appears in the left sidebar and becomes active. Switching projects swaps the whole workspace (terminals, layout, git, commands) without tearing down the previous project's live terminals.

**W2 — Run a dev stack.** User opens a project, clicks custom command "Backend → `bun run dev`" → new terminal tab spawns in the project cwd running the command. Repeats for "Frontend" and "Database". Splits them into a grid.

**W3 — Restart a crashed/hung dev server.** A terminal running `bun run dev` misbehaves → user clicks **Restart** on that terminal → VibeDock kills the process tree, waits for exit, re-sends the original command in the same tab/cwd.

**W4 — Launch/resume Claude Code.** User clicks "New Claude session" → a terminal opens running `claude` in the project root. Later, user opens the "Claude sessions" list, sees prior sessions for this project, clicks one → a terminal opens running `claude --resume <id>`.

**W5 — Find and peek a file.** User hits Ctrl+P → fuzzy file finder over the project (ignoring `node_modules`, `.git`, build dirs) → arrow keys to a file → read-only preview with highlighting. Optionally "Open in VS Code".

**W6 — Commit work.** User opens the Git panel → sees changed files → stages a subset → writes a message → commits → pushes. Views diff and history inline.

**W7 — Resume after restart.** User reopens VibeDock → prior projects, terminal tabs (names/cwd/layout), and custom commands are restored. Terminal tabs are present but **dormant** (not auto-running); user clicks to (re)start each, or uses a per-tab "restore command" affordance.

---

## 5. Functional Requirements

### 5.1 Project management
- FR-P1 Open a project by selecting a folder (native dialog).
- FR-P2 List open projects and recent projects in a vertical sidebar.
- FR-P3 Switch active project; preserve each project's workspace state in memory.
- FR-P4 Close a project (with confirmation if it has live terminals).
- FR-P5 Reopen from recents; persist open + recent lists across restarts.
- FR-P6 Detect whether the folder is a git repo; surface basic repo info.

### 5.2 Terminal workspace
- FR-T1 Create / close / rename terminals per project.
- FR-T2 Switch between terminals (tabs) and split horizontally/vertically into a resizable grid.
- FR-T3 Full interactive I/O: keyboard, ANSI color, control chars (Ctrl+C etc.), interactive TUIs (Claude Code, vim, etc.).
- FR-T4 Terminal resize propagated to the PTY (ConPTY resize).
- FR-T5 Each terminal runs independently, launched in the project cwd, with a user-selectable shell (default PowerShell; also cmd.exe, Git Bash if installed).
- FR-T6 Show per-terminal running status (idle / running / exited + exit code).

### 5.3 Custom commands (per project)
- FR-C1 CRUD custom commands: name, command string, optional working directory (relative to project root), optional shell override.
- FR-C2 Launch a command directly into a new terminal tab.
- FR-C3 Commands stored per project and persisted.

### 5.4 Process restart
- FR-R1 Restart the process running in a terminal: identify root process, terminate its tree, wait for exit, re-run the original command in the same tab/cwd.
- FR-R2 Works across `bun/npm/yarn/pnpm` dev servers and `docker compose up`.
- FR-R3 Restart never assumes Ctrl+C alone suffices; it terminates the tree explicitly.

### 5.5 Claude Code
- FR-CC1 Launch a new Claude session in the project root (`claude`).
- FR-CC2 List prior sessions for the project where technically possible (read `~/.claude/projects/...`).
- FR-CC3 Resume a session (`claude --resume <id>`) or continue the most recent (`claude --continue`).
- FR-CC4 Always run inside a real terminal; never intercept Claude's I/O.
- FR-CC5 Degrade gracefully if the CLI/version doesn't support a flag: fall back to plain `claude`.

### 5.6 File explorer & quick open
- FR-F1 Browse the project tree (lazy-loaded), respecting ignore rules.
- FR-F2 Ctrl+P fuzzy file finder, keyboard-navigable.
- FR-F3 Read-only preview with syntax highlighting for common dev files.
- FR-F4 "Open in VS Code" for a file or the project.
- FR-F5 Never scan `node_modules`, `.git`, `dist`, `build`, `target`, etc.

### 5.7 Git manager
- FR-G1 Show status and changed files; stage/unstage (including individual files).
- FR-G2 Commit with message; view diffs (working tree and staged).
- FR-G3 Commit history; branch list, create, switch, delete (guarded).
- FR-G4 Push / pull / fetch; show remotes.
- FR-G5 Surface merge-conflict state and useful error messages; offer "open in external Git tool".
- FR-G6 No GitHub API required for any of the above.

### 5.8 Persistence
- FR-S1 Persist: open projects, recents, per-project terminal tab metadata (name, cwd, layout, last command), custom commands, project settings, Claude session pointers.
- FR-S2 Restore layout on launch; **do not auto-run** any command without explicit user config.

---

## 6. Non-Functional Requirements

- **Performance:** cold start < 2s; project switch < 100ms (in-memory state swap); Ctrl+P results < 100ms on a 50k-file repo after first index; terminal input latency imperceptible (<16ms round-trip for local echo through PTY).
- **Reliability:** no data loss on crash; persisted state written atomically; a dead PTY never hangs the UI thread.
- **Security:** no silent destructive actions; project trust model; path validation; no shell string interpolation of untrusted input (see §16).
- **Footprint:** stay within the template's dependency philosophy — add a library only when a few lines won't do.
- **Accessibility:** keyboard-first; focus management; sufficient contrast in the dark theme.
- **Maintainability:** follow existing conventions (`src/pages/*`, `src/stores/{feature}`, `src/common/*`, path aliases, Zustand for UI state).

---

## 7. Recommended Architecture

### 7.1 High-level
```
┌───────────────────────── React (webview) ─────────────────────────┐
│  UI: Projects sidebar · Terminal grid (xterm) · Git · Files · CC   │
│  State: Zustand (workspace/UI)  ·  SWR (git status, file search,   │
│         claude sessions — async reads that benefit from caching)   │
│  IPC: @tauri-apps/api  invoke()  +  event listen()                 │
└───────────────▲───────────────────────────────┬───────────────────┘
        invoke  │ commands            events     │  pty://output/{id},
     (request)  │                  (streaming)   ▼  process://status/{id}
┌───────────────┴─────────────── Rust (Tauri core) ──────────────────┐
│  pty_manager   : HashMap<TermId, Session> (portable-pty / ConPTY)  │
│  process_mgr   : tree kill (taskkill /T /F, Job Object hardening)  │
│  git module    : git2 (read/stage/commit/branch/diff) + git CLI    │
│                  shell-out (push/pull/fetch)                        │
│  fs_search     : ignore crate walk + fuzzy match; file read/preview │
│  store module  : tauri-plugin-store (JSON) for persistence         │
└────────────────────────────────────────────────────────────────────┘
```

### 7.2 Frontend architecture
- Keep the template's `src/pages` + `src/stores/{feature}` + `src/common/*` layout and path aliases.
- **Zustand** holds the live workspace tree (projects → terminals → layout) because it's client-only, mutable, and must survive project switches without refetch. This is the app's spine.
- **SWR** wraps *reads that are async + cacheable + revalidatable*: git status, commit history, file-search index queries, Claude session lists. These map cleanly onto SWR keys and `mutate()` after actions. (This matches the template's stated pattern; the "server" is just the Rust backend via a thin `invoke` fetcher instead of Axios.)
- Terminal rendering stays imperative (xterm owns its DOM); React only manages the container, tab state, and lifecycle — exactly as the PoC does.

### 7.3 Backend architecture (Rust)
Split `lib.rs` into modules: `pty.rs`, `process.rs`, `git.rs`, `search.rs`, `store.rs`, each exposing `#[tauri::command]`s registered in `run()`. State moves from a single `PtyState` to a `Manager` holding `Mutex<HashMap<TermId, Session>>`.

### 7.4 Frontend ↔ backend communication
- **Request/response:** `invoke("cmd", args)` → `Result<T, String>` (template already returns `Result<_, String>`; keep it, but graduate to a typed error enum serialized to a tagged JSON for Git — see §17).
- **Streaming (PTY output, process status):** Tauri events, **namespaced per terminal id**: `pty://output/{id}`, `process://status/{id}`. The current PoC uses a single global `pty://output`; this must become per-id so multiple terminals don't cross-wire.
- **Backpressure:** the reader thread emits chunks as-is (xterm handles its own buffering). For very chatty output, coalesce with a small time/size batch in Rust to avoid event storms (deferred optimization, see §22).

---

## 8. Technology Recommendations

| Concern | Choice | Rationale | Status |
|---|---|---|---|
| App shell | **Tauri 2** (template) | already chosen; small, Rust backend | in template |
| UI | **React 19 + TS + Vite 7** (template) | already chosen | in template |
| Styling | **Tailwind 4** (template) | already chosen | in template |
| UI state | **Zustand** (template) | client-only workspace tree | in template |
| Async/cached reads | **SWR** (template) | git status, search, sessions | in template |
| Terminal UI | **@xterm/xterm 6** (+ addons: fit ✓, `addon-web-links`, `addon-search`, `addon-unicode11`, optional `addon-webgl`) | already chosen; addons are official | fit in template; add rest |
| PTY | **portable-pty 0.9** (ConPTY) | already chosen; real interactive PTY | in template (PoC) |
| Process tree kill | **`taskkill /T /F`** (MVP) → **Windows Job Objects** (hardening) | Ctrl+C insufficient; tree kill required | custom (Rust) |
| Git read/stage/commit | **`git2`** (libgit2 bindings) | in-process, structured, no parsing | new dep |
| Git push/pull/fetch | **git CLI shell-out** | reuses user's credential helpers/SSH agent; libgit2 auth is painful | custom (Rust) |
| File walk | **`ignore` crate** (ripgrep's walker) | respects .gitignore, fast, battle-tested | new dep |
| Fuzzy match | **`nucleo`** or **`fuzzy-matcher`** | fast fuzzy ranking in Rust | new dep |
| Syntax highlight (preview) | **`highlight.js`** (frontend, offline) | zero-config, offline, broad langs; lazy vs Shiki | new dep (JS) |
| Persistence | **`@tauri-apps/plugin-store`** (JSON KV) | official, no infra, atomic writes; enough for MVP | new dep |
| Icons/toasts | **react-icons / sonner** (template) | already chosen | in template |

**Deferred storage note:** if per-project data grows (large command sets, cached search indexes, history), migrate hot data to **SQLite via `tauri-plugin-sql`**. Not needed for MVP — JSON store is simpler and the data is small. `// ponytail: JSON store now; SQLite when a store file crosses ~MBs or needs querying.`

---

## 9. UI/UX Information Architecture

**Dark-first, three-region shell:**

```
┌───────────────────────────────────────────────────────────────────────┐
│ Title bar: VibeDock · active project name · global ⌘K palette          │
├──────────┬────────────────────────────────────────────────────────────┤
│ PROJECTS │  Project workspace (tabs across the top of this pane)       │
│ (rail)   │  ┌ Terminals ┬ Files ┬ Git ┬ Claude ┐                       │
│ ▸ Proj A │  └───────────┴───────┴─────┴────────┘                       │
│ ▸ Proj B │                                                             │
│ ▸ Proj C │   [ Terminal tab bar: + new · split ⬍⬌ · shell ▾ ]          │
│          │   ┌────────────────┬────────────────┐                       │
│ Recents  │   │  Terminal 1    │  Terminal 2    │  (resizable grid)     │
│  · ...   │   │  [Restart][×]  │                │                       │
│          │   ├────────────────┴────────────────┤                       │
│  + Open  │   │           Terminal 3            │                       │
│  folder  │   └────────────────────────────────┘                       │
├──────────┴────────────────────────────────────────────────────────────┤
│ Status bar: git branch ▾ · N running · active cwd · notifications      │
└───────────────────────────────────────────────────────────────────────┘
```

**Key IA decisions (improving on the conceptual sketch):**
- **Left rail = projects only** (not files). Files live inside the project workspace as a tab. This keeps the "projects, not files" identity.
- **Project workspace = tabbed views** (Terminals / Files / Git / Claude), so the window never becomes cluttered. Terminals is the default/home tab.
- **Terminals view = its own tab bar + split grid.** Terminal tabs are *within* the Terminals view, distinct from the top-level view tabs — a two-level model that scales without visual noise.
- **Command palette (⌘K/Ctrl+K):** open project, run custom command, new terminal, launch Claude, quick-open file (Ctrl+P is the file-scoped subset). Keyboard is the primary interaction.
- **Status bar** surfaces the three things a dev glances at: branch, running-process count, cwd.
- **Restart** and **close** are per-terminal affordances on the terminal's own header, not buried in menus.

Visual language: monospace-forward, low-chrome, one accent color, generous terminal area, no file-tree-dominant layout (deliberately un-VS-Code).

---

## 10. Detailed Feature Breakdown

### 10.1 Projects
- Open via `tauri-plugin-dialog` folder picker → validate path exists and is a directory → add to `projects` store + `recents`.
- Each project = an in-memory `ProjectWorkspace` (Zustand) + a persisted `ProjectRecord`.
- Switching = change `activeProjectId`; live terminals of other projects keep running in the background (their xterm instances are unmounted but the PTY sessions persist in Rust, keyed by id).

### 10.2 Terminals (see §12 for lifecycle)
- Generalize the PoC: `pty_spawn` returns a `TermId`; all commands take a `TermId`; output events are `pty://output/{id}`.
- Split layout = a binary/grid layout tree in Zustand; use a resizable-panes approach (CSS grid + drag handles, or a small pane library — evaluate `react-resizable-panels`; lazy default is CSS grid + a thin drag handle to avoid a dep).
- Shell selection: detect available shells at startup (PowerShell always; cmd.exe always; Git Bash by probing `%ProgramFiles%\Git\bin\bash.exe` and PATH). Store default per project.

### 10.3 Custom commands
- Per-project list; CRUD in a small editor UI; persisted in the project record.
- "Run" → `pty_spawn` with `{ shell, cwd, initialCommand }`; Rust writes the command + newline to the PTY after spawn (or launches shell with a run-arg — writing to stdin is simpler and shell-agnostic).

### 10.4 Restart (see §12.3)
- Per-terminal button; disabled if no tracked command.

### 10.5 Claude Code (see §13)

### 10.6 File explorer / quick open (see §15)

### 10.7 Git manager (see §14)

### 10.8 Persistence & restore (see §12.4 and §11)

---

## 11. Data Model

Storage: **`@tauri-apps/plugin-store`**, one JSON store file (`vibedock.json`) in the app data dir, plus optionally one file per project if project records get large (start with a single file).

```ts
// Persisted (survives restart)
type AppState = {
  version: 1;
  openProjectIds: string[];
  recentProjects: RecentProject[];   // capped list, MRU
  activeProjectId: string | null;
  projects: Record<string, ProjectRecord>;
  settings: GlobalSettings;
};

type RecentProject = { id: string; name: string; path: string; lastOpenedAt: string };

type ProjectRecord = {
  id: string;                 // stable hash of absolute path
  name: string;               // folder name, user-renamable
  path: string;               // absolute Windows path
  defaultShell: ShellKind;    // "powershell" | "cmd" | "gitbash"
  customCommands: CustomCommand[];
  terminals: TerminalMeta[];  // METADATA ONLY — not live processes
  layout: LayoutTree | null;  // split arrangement of terminal ids
  git: { isRepo: boolean };   // cheap cached hint; live status is fetched
  claude: { lastSessionId: string | null };
  settings: ProjectSettings;
};

type CustomCommand = {
  id: string;
  name: string;               // "Backend"
  command: string;            // "bun run dev"
  cwd?: string;               // relative to project root; default = root
  shell?: ShellKind;          // override default
};

type TerminalMeta = {
  id: string;
  name: string;               // "Backend", user-renamable
  cwd: string;                // resolved working dir
  shell: ShellKind;
  lastCommand: string | null; // for restore/restart; NOT auto-run
};

type LayoutTree =
  | { kind: "leaf"; terminalId: string }
  | { kind: "split"; dir: "row" | "col"; a: LayoutTree; b: LayoutTree; ratio: number };

type ShellKind = "powershell" | "cmd" | "gitbash";
```

```ts
// Runtime-only (Zustand, NOT persisted)
type ProjectWorkspace = {
  record: ProjectRecord;
  liveTerminals: Record<string, LiveTerminal>; // xterm instance + status
};
type LiveTerminal = {
  id: string;
  status: "starting" | "running" | "exited";
  exitCode: number | null;
  rootPid: number | null;      // for tree-kill on restart
};
```

**Claude session metadata** is *not* stored by VibeDock — it's read live from `~/.claude/projects/<escaped-project-path>/*.jsonl` (see §13). We persist only a `lastSessionId` pointer for a quick "continue" affordance.

**Why JSON store, not SQLite:** data is small (dozens of projects, a handful of commands/terminals each), local-only, read once on startup, written on mutation. A KV JSON store is the lazy correct fit. SQLite is the documented upgrade path, not the starting point.

---

## 12. Terminal & Process Lifecycle Design

### 12.1 Session model (generalize the PoC)
Rust holds:
```rust
struct Session {
    writer: Box<dyn Write + Send>,
    master: Box<dyn MasterPty + Send>,
    child: Box<dyn Child + Send>,   // keep the handle to query/kill
    root_pid: Option<u32>,
}
struct PtyManager { sessions: Mutex<HashMap<String, Session>> }
```
Commands: `pty_spawn(id, shell, cwd, cols, rows) -> Result<u32 pid>`, `pty_write(id, data)`, `pty_resize(id, cols, rows)`, `pty_kill(id)`, `pty_close(id)`. Each spawn starts a reader thread emitting `pty://output/{id}` and, on EOF/exit, `process://status/{id}` with the exit code.

The PoC's `drop(pair.slave)` (so the reader sees EOF) and the resize plumbing carry over unchanged — they're already correct.

### 12.2 Spawn
- Build `CommandBuilder` for the chosen shell, set cwd, inherit env.
- For a custom-command terminal, after spawn write `"{command}\r\n"` to the PTY (shell-agnostic; avoids per-shell run-arg differences).
- Record `root_pid` from the child for later tree operations.

### 12.3 Restart — the hard part (Windows process trees)
**Problem:** killing the shell (or sending Ctrl+C) does *not* reliably kill grandchildren. `bun run dev` → node → esbuild/workers; `docker compose up` → docker CLI attached to the daemon. Ctrl+C via ConPTY works for some but not all, and detached children survive.

**MVP approach — `taskkill /T /F`:**
1. Look up the terminal's `root_pid`.
2. Run `taskkill /PID <root_pid> /T /F` (`/T` = whole tree, `/F` = force). This is the most reliable, dependency-free tree kill on Windows.
3. Wait for the child handle to report exit (bounded timeout, e.g. 5s) so we don't restart into a port-still-bound state.
4. Re-send the original `lastCommand` into the *same* terminal session (same cwd/shell), or respawn the session if the shell itself died.

**Graceful-first refinement:** try a soft stop before force — send Ctrl+C (`\x03`) to the PTY, wait ~1–2s; if still alive, `taskkill /T /F`. Gives well-behaved processes a clean shutdown.

**Hardening (Phase 6 / post-MVP) — Windows Job Objects:** assign each spawned process tree to a Job Object with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`. Closing the job kills the entire tree atomically, no PID enumeration races. This is the "correct" long-term mechanism; `taskkill /T` is the pragmatic MVP. `// ponytail: taskkill /T /F for MVP; Job Objects when detached-child leaks show up.`

**Docker caveat:** `docker compose up` in the foreground responds to Ctrl+C by stopping containers; force-killing the CLI leaves containers running. Document that "Restart" on a compose terminal should prefer the Ctrl+C-then-wait path, and consider a compose-aware restart (`docker compose restart`) as a special case later. Surface this rather than silently orphaning containers.

### 12.4 Persistence boundary
- **Persist:** terminal metadata (name, cwd, shell, lastCommand) + layout tree.
- **Do NOT persist:** live processes (impossible/unsafe). On restart, recreate tabs as **dormant** leaves showing "Not running — click to start / restore command". Never auto-run — this is both a safety rule (§16) and a correctness one (a stale command may be destructive).

---

## 13. Claude Code Integration Strategy

**Principle:** Claude Code is just a CLI run inside a normal VibeDock terminal. VibeDock adds convenience controls around it, never intercepts its I/O.

**Verified-capability approach (avoid undocumented assumptions):**
- **New session:** spawn a terminal in project root running `claude`.
- **Continue most recent:** `claude --continue` (a.k.a. `-c`).
- **Resume specific:** `claude --resume <session-id>` (a.k.a. `-r`). When run without an id, `--resume` shows an interactive picker — a valid fallback if we can't enumerate sessions.
- **Session discovery:** Claude Code stores transcripts as JSONL under `~/.claude/projects/<escaped-cwd>/<session-uuid>.jsonl` (the project dir name is the absolute path with separators replaced). VibeDock reads that directory for the active project, lists sessions (uuid + mtime + first user message as a label parsed from the JSONL), and offers resume. This is **read-only inspection of files on disk**, not an undocumented API.

**Version dependency & fallback (documented):**
- Flags and the on-disk layout depend on the installed Claude Code version. VibeDock must not hard-fail:
  - If `claude` isn't on PATH → show an install hint, still allow manual terminal use.
  - If `~/.claude/projects/...` is absent or the JSONL schema differs → hide the session list, keep "New" and "Continue"/`--resume` (interactive picker) working.
  - Treat parsed labels as best-effort; never block launch on parse success.
- **Do not** depend on any non-CLI/private API. Everything routes through the documented CLI and on-disk transcript files, both of which the user already has.

**UI:** a "Claude" view per project with: `New session`, `Continue last`, and a session list (label, time) → each opens a terminal with the right command. No custom chat UI.

`// ponytail: session list is a nice-to-have; New + Continue + --resume picker cover the workflow if the JSONL format ever shifts.`

---

## 14. Git Manager Strategy

**Hybrid: `git2` (libgit2) for structured local ops, git CLI for network ops.**

- **Use `git2` for:** status, staged/unstaged diff, stage/unstage (index add/remove), commit, branch list/create/checkout/delete, log/history, remote listing, conflict detection. These are structured, synchronous, and painful to get right by parsing porcelain.
- **Use git CLI shell-out for:** `push`, `pull`, `fetch`. Reason: authentication. The user's `git` already has credential helpers (Windows Credential Manager), SSH agents, and 2FA/token flows configured. Reimplementing auth through libgit2 callbacks is the classic time-sink and a source of "works in terminal, fails in app" bugs. Shell out and stream stderr/stdout for progress + real error messages.
- **Merge conflicts:** detect via `git2` index conflict entries; present the conflicted file list; offer "open in VS Code" or an external merge tool. Do **not** build an in-app 3-way merge editor in v1 (that's editor territory — a non-goal).
- **Errors:** surface git's actual stderr for CLI ops and libgit2 error messages for local ops, mapped to a typed error (§17) with an actionable hint where common (e.g., "no upstream — set with `git push -u`").
- **No GitHub API.** PR/issue integrations are explicitly deferred.

**Data flow:** Git reads go through SWR keys per project (`git:status:{projectId}`, `git:log:{projectId}`, `git:branches:{projectId}`); mutations (stage/commit/push) call `invoke` then `mutate()` the affected keys. This matches the template's SWR mutation pattern.

`// ponytail: git2 for local, git CLI for network — don't fight libgit2 auth.`

---

## 15. File Search & Preview Strategy

**Walk & index (Rust, `ignore` crate):**
- On first Ctrl+P (or project open), build a file list with the `ignore` crate's `WalkBuilder`, which honors `.gitignore` and lets us hard-exclude `node_modules`, `.git`, `dist`, `build`, `target`, `.next`, etc.
- Cache the list in memory per project; invalidate on a debounced filesystem watch (`notify` crate) or simply on explicit refresh (MVP: refresh on project focus + manual refresh; watcher is a later optimization).

**Fuzzy query:**
- Match/rank with `nucleo` (or `fuzzy-matcher`) in Rust; return top N to the frontend. Keeps ranking fast and off the UI thread. Command palette calls `invoke("search_files", { projectId, query })` behind an SWR key or a debounced call.

**Preview (read-only):**
- `invoke("read_file", { path, maxBytes })` returns text (guard size, e.g. refuse > ~2MB, and detect binary → show "binary file" placeholder).
- Highlight on the frontend with **highlight.js** (offline, zero-config, language auto/by-extension). Markdown/JSON/TS/JS/etc. covered. `// ponytail: highlight.js over Shiki — offline, no build step, good enough for read-only preview.`
- **Open in VS Code:** `code <path>` via shell-out if `code` is on PATH; otherwise the `tauri-plugin-opener` (already a dependency) as fallback. Detect availability and hide the action if neither works.

**Boundaries:** all paths validated to stay within the project root (§16); search never escapes the project.

---

## 16. Security Considerations

VibeDock runs shell commands and touches the filesystem, so:

- **Project trust:** opening a folder is an explicit user action = trust boundary. Custom commands are user-authored and stored per project; treat them as trusted-by-user but **never auto-execute on startup** (restore = dormant tabs).
- **No blind command interpolation:** custom commands are written to a PTY as the user typed them (that's the point — a terminal). But any VibeDock-*constructed* command line (git operations, taskkill, `code <path>`, claude flags) must pass arguments as **argv arrays** (`CommandBuilder`/`std::process::Command` with `.arg()`), never string-concatenated into a shell, to avoid injection via crafted paths/branch names/session ids.
- **Path validation:** canonicalize and confine file-read/preview and search to the project root; reject `..` escapes and symlinks that leave the root. Reject reads of device paths.
- **Process termination safety:** `taskkill /F` is forceful; scope it to the tracked `root_pid` and its tree only — never a bare name match (`taskkill /IM node.exe` would nuke unrelated processes). Prefer graceful Ctrl+C first.
- **Destructive git ops:** branch delete, force operations, discard-changes must require explicit confirmation; never auto-discard or auto-force. No silent `reset --hard`.
- **External launches:** `code`, external git tools, `opener` receive validated paths only; availability-checked before shown.
- **Secrets:** do not log command contents or env to persisted files; `.env` files may be previewable (read-only) but never transmitted anywhere (app is local-only, no network egress by design).
- **Tauri capabilities:** scope `capabilities/default.json` to exactly the plugins used (dialog, store, opener, fs if used); don't broaden CSP or allowlists beyond need. The template's CSP is currently `null` — set a restrictive CSP before shipping.

---

## 17. Error Handling

- **IPC contract:** commands return `Result<T, AppError>` where `AppError` serializes to a tagged JSON `{ kind, message, hint? }` (upgrade from the PoC's bare `String`). Kinds: `PtySpawnFailed`, `ProcessKillFailed`, `GitError`, `FsError`, `NotFound`, `Unsupported`.
- **Terminal failures:** spawn failure → toast + mark tab "failed" with the error; a PTY read error closes the session cleanly and emits an `exited` status rather than hanging.
- **Git errors:** pass through real stderr/libgit2 messages; add hints for the common cases (no upstream, auth failed, conflicts, detached HEAD).
- **Restart failures:** if tree-kill times out, tell the user which PID is stuck and offer force/give-up; never silently leave a zombie or double-spawn.
- **Claude/VS Code missing:** feature-detect and degrade with a clear, non-blocking message.
- **Persistence:** wrap store writes; on read of a corrupt/older-version store, back it up and start fresh rather than crashing (migrate by `version` field).
- **User-facing surface:** Sonner toasts for transient errors (already a dependency); inline states for panel-level errors (SWR `error`), consistent with the template's retry pattern.

---

## 18. Testing Strategy

Lazy but real — one runnable check per non-trivial mechanism, no framework sprawl:

- **Rust unit/integration (`cargo test`):**
  - PTY manager: spawn → write `echo` → assert output event received → kill → assert `exited`. (The single most important test; it guards the product's spine.)
  - Process tree kill: spawn a shell that spawns a child, `taskkill /T`, assert both gone within timeout.
  - Path confinement: `..`/symlink-escape attempts rejected.
  - Git module against a temp repo fixture: init → stage → commit → branch → log assertions (git2 in-process, no network).
- **Frontend (Vitest + React Testing Library):**
  - Zustand workspace reducer: project switch preserves state; layout tree splits/merges correctly.
  - Command palette / Ctrl+P: keyboard nav and selection.
  - Store (de)serialization round-trip + version migration.
- **Manual/E2E smoke (documented checklist):** run a real `bun run dev`, restart it, confirm port frees and restarts; launch Claude, resume a session; commit + push a change. E2E automation of a PTY GUI is high-effort — keep it a checklist for MVP, revisit `tauri-driver`/WebDriver later. `// ponytail: manual smoke checklist for the GUI path; automate only if regressions recur.`
- **CI:** `cargo test` + `bun run lint` + `bun run build` + Vitest on push.

---

## 19. Development Phases

Order adjusted slightly from the brief: **terminal multi-session is promoted to run right after the shell**, because the PoC already exists and everything depends on it. Each phase below lists objectives, features, tasks, dependencies, deliverables, acceptance.

### Phase 1 — Foundation
- **Objectives:** app shell, project management, persistence backbone, core dark UI.
- **Features:** open/switch/close/reopen projects; recents; persisted lists; three-region layout; command palette skeleton.
- **Tasks:** add `tauri-plugin-dialog` + `@tauri-apps/plugin-store`; build Zustand workspace store + persistence sync; projects rail; view-tab shell; status bar; dark theme pass.
- **Dependencies:** template (done).
- **Deliverables:** you can open multiple folders, switch, and they survive restart.
- **Acceptance:** open 3 projects → restart → all 3 + active selection restored; no terminals yet.

### Phase 2 — Terminal (spine)
- **Objectives:** multi-session PTY, tabs, splits, status, shell selection.
- **Features:** FR-T1..T6; shell detection.
- **Tasks:** refactor `lib.rs` → `pty.rs` with keyed `HashMap` sessions; per-id output/status events; xterm-per-tab component (generalize the PoC page); layout tree + resizable grid; shell picker; wire cwd = project root.
- **Dependencies:** Phase 1 workspace store; PoC (done).
- **Deliverables:** multiple independent terminals per project, splittable, ANSI + Ctrl+C + interactive TUIs work.
- **Acceptance:** run `vim`/an interactive TUI in one pane while `ping -t` streams in another; resize reflows; closing a tab kills its process.

### Phase 3 — Project Tools
- **Objectives:** custom commands, restart, file search/preview, open in VS Code.
- **Features:** FR-C1..C3, FR-R1..R3, FR-F1..F5.
- **Tasks:** custom-command CRUD + persistence + "run into terminal"; restart (Ctrl+C→wait→`taskkill /T /F`→re-run) with `root_pid` tracking; `search.rs` (`ignore` walk + `nucleo`); Ctrl+P palette; read-only preview + highlight.js; `code`/opener launch.
- **Dependencies:** Phase 2 sessions.
- **Deliverables:** one-click dev stack + reliable restart + Ctrl+P.
- **Acceptance:** launch `bun run dev` via a custom command, Restart it, confirm the port is freed and the server is back; Ctrl+P finds a file in a 20k-file repo < 100ms and previews it highlighted.

### Phase 4 — Git
- **Objectives:** graphical local git.
- **Features:** FR-G1..G6.
- **Tasks:** `git.rs` with git2 (status/diff/stage/commit/branch/log/remotes/conflicts) + CLI shell-out for push/pull/fetch with streamed progress; SWR keys + mutations; diff viewer (read-only, reuse highlight.js); branch UI with guarded delete; error mapping.
- **Dependencies:** Phase 1 (project = repo path).
- **Deliverables:** stage/commit/push/pull/branch/history/diff in-app.
- **Acceptance:** make a change → stage subset → commit → push to a real remote using existing credentials; switch and create branches; view a diff and history.

### Phase 5 — Claude Code
- **Objectives:** first-class launch/resume.
- **Features:** FR-CC1..CC5.
- **Tasks:** `claude` new/continue launchers; read `~/.claude/projects/...` JSONL → session list with labels; `--resume <id>`; feature-detection + fallbacks; Claude view UI.
- **Dependencies:** Phase 2 (runs in a terminal).
- **Deliverables:** New / Continue / Resume-from-list, all in real terminals.
- **Acceptance:** start a Claude session, close it, reopen VibeDock, resume that exact session from the list; graceful behavior when `claude` is absent.

### Phase 6 — Polish
- **Objectives:** restore UX, perf, errors, shortcuts, packaging, tests.
- **Features:** FR-S1..S2 restore polish; keyboard map; Windows installer; output batching; Job Object hardening; restrictive CSP.
- **Tasks:** dormant-tab restore UX; output coalescing; Job Objects for tree kill; keybinding layer; Tauri bundler → NSIS/MSI installer; test suite + CI; error-message pass.
- **Dependencies:** all prior.
- **Deliverables:** shippable signed-ish installer, restored workspaces, hardened kill, tests green.
- **Acceptance:** fresh install → open projects → restart app → layout restored (dormant tabs); process trees never leak; `cargo test` + Vitest + build green in CI.

---

## 20. MVP Scope

**MVP = Phases 1–3 + a thin slice of Phase 5.**

The product's core promise ("stop opening VS Code just for terminals + tools") is met by: multi-project management, real multi-session terminals, per-project custom commands, reliable restart, Ctrl+P search/preview, and Claude Code launch/resume. Git (Phase 4) is high-value but the app is *useful and shippable* without it; ship MVP, then Git, then polish.

**Explicitly out of MVP:** Git manager (Phase 4), Job Object hardening, filesystem-watch auto-refresh, installer signing, session-label parsing niceties. All are on the roadmap, none block first use.

---

## 21. Future Features

- Full Git manager (if deferred out of MVP), then GitHub/GitLab/Bitbucket API integrations (PRs, issues, clone).
- SQLite persistence migration if data outgrows the JSON store.
- Filesystem watcher for live search index + git status refresh.
- Windows Job Objects for atomic tree kill (moved up if leaks appear).
- Cross-platform (macOS/Linux) — architecture already avoids most coupling; the Windows-specific bits are shell detection and `taskkill`/Job Objects (swap for POSIX process groups + `SIGTERM`/`SIGKILL`).
- Terminal profiles, env-var sets per project, `.vibedock/` project config file (checked-in, shareable commands).
- Compose-aware restart; per-service controls.
- Themeable UI; light mode.

---

## 22. Technical Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| **Child process trees survive kill** (bun/node workers, docker) | Restart leaves ports bound / zombies | `taskkill /T /F` on the tracked root PID; graceful Ctrl+C first; Job Objects as hardening; document docker-compose special case |
| **Per-id event wiring** (PoC is single global event) | Terminals cross-wire output | Namespace events `pty://output/{id}`; scope listeners per component; test with 3+ concurrent terminals |
| **libgit2 auth for push/pull** | "works in terminal, fails in app" | Shell out to git CLI for network ops; reuse user credential helpers |
| **Claude CLI/format drift** | Session list breaks across versions | Feature-detect; fall back to `New`/`--continue`/`--resume` picker; treat JSONL parse as best-effort |
| **Search perf on huge repos** | UI jank on Ctrl+P | `ignore` crate excludes; index once in memory; fuzzy rank in Rust; cap results |
| **Output event storms** (verbose builds) | UI lag, dropped frames | Coalesce reader output by time/size batch in Rust (Phase 6); xterm webgl addon |
| **UI thread blocked by big file preview** | Freeze | Size guard + binary detection in Rust; stream/cap bytes |
| **Persisting stale destructive commands** | Auto-run damage on restore | Never auto-run; dormant tabs; explicit user start |
| **Windows path/encoding edge cases** | Broken cwd/paths | Canonicalize in Rust; pass argv arrays; test paths with spaces/unicode |
| **PoC's single `PtyState` mutex** | Contention/serialization at scale | Move to `HashMap` keyed sessions; per-session locks if throughput matters |

---

## 23. Open Questions & Decisions Requiring User Input

1. **Persistence choice — confirm JSON store (`plugin-store`) for MVP** with SQLite as the documented upgrade path? (Recommended: yes.)
2. **Restart default — graceful Ctrl+C→wait→force, or straight force?** (Recommended: graceful-first; force fallback.)
3. **Git in MVP or immediately after?** Plan defers Git to Phase 4 (post-MVP). Confirm that ordering, or promote Git into MVP.
4. **Syntax highlighting — highlight.js (offline, simple) vs Shiki (prettier, heavier)?** (Recommended: highlight.js for read-only preview.)
5. **Split-panes — hand-rolled CSS grid + drag handles vs `react-resizable-panels` dependency?** (Recommended: try CSS-grid first; adopt the lib only if resize UX is painful.)
6. **Claude session list depth — parse JSONL for labels now, or ship New/Continue/Resume-picker first and add the list later?** (Recommended: ship the simple launchers first.)
7. **Shell detection scope for v1 — PowerShell + cmd + Git Bash only, or also WSL/pwsh 7/Nu?** (Recommended: the three named; extend later.)
8. **App identity — rename from template `com.fanes.tauri-template` / `tauri_template` to VibeDock identifier + product name** (bundle/config change; confirm final identifier).
9. **Do you want a checked-in `.vibedock/` project config** (shareable custom commands per repo) in v1, or keep all config in the app's local store? (Recommended: local store for v1, `.vibedock/` later.)

---

### Appendix A — What's already in the template (reused, not rebuilt)
- Tauri 2 shell, React 19/TS/Vite 7/Tailwind 4, Zustand, SWR, Sonner, react-icons, path aliases, ESLint/Prettier.
- **Working PTY PoC:** `portable-pty` + `@xterm/xterm`/`addon-fit`, `pty_spawn/write/resize`, `pty://output` event, `src/pages/PowerShell` reference page. This is the seed of Phase 2.
- Conventions: `src/pages/{Name}/index.tsx`, `src/stores/{feature}` (keys/service/hooks/types), `src/common/*`, `Result<_, String>` command signatures.

### Appendix B — Classification of features
- **Existing libraries cover it:** terminals (xterm+portable-pty), file walk (`ignore`), fuzzy (`nucleo`), git local (`git2`), highlighting (highlight.js), persistence (`plugin-store`), dialogs/opener (Tauri plugins).
- **Custom implementation required:** multi-session PTY manager, process-tree restart, per-project workspace/layout state, git CLI shell-out orchestration, Claude session discovery, command palette.
- **Depends on external software installed:** git (network ops), `claude` CLI, `code` (VS Code), Git Bash (optional shell), docker (for compose commands).
- **Deferred to later phases:** Git manager (Phase 4), Job Objects, FS watcher, installer signing, cross-platform, cloud/API integrations, `.vibedock/` shared config.
