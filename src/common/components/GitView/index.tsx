import { useEffect, useRef, useState } from "react";
import type { Project } from "@types";
import { toast } from "sonner";
import type { BranchList, GitFile } from "@stores/git";
import { refreshGit, useGitBranches, useGitLog, useGitRepos, useGitStatus } from "@stores/git";
import { invoke } from "@tauri-apps/api/core";
import { cn } from "@utils/cn";
import {
  VscAdd,
  VscCheck,
  VscChevronDown,
  VscGitCommit,
  VscGitMerge,
  VscRepo,
  VscSearch,
  VscSourceControl,
  VscSync,
} from "react-icons/vsc";

const folderName = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() ?? p;

export default function GitView({ project }: { project: Project }) {
  const { data: repos } = useGitRepos(project.path);
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);
  const root = (selectedRepo && repos?.includes(selectedRepo) ? selectedRepo : repos?.[0]) ?? undefined;
  const { data: status, error } = useGitStatus(root);
  const { data: branches } = useGitBranches(root);
  const { data: log } = useGitLog(root);

  const [tab, setTab] = useState<"changes" | "history">("changes");
  const [message, setMessage] = useState("");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileDiff, setFileDiff] = useState("");
  const [selCommits, setSelCommits] = useState<string[]>([]);
  const [commitDiff, setCommitDiff] = useState("");
  const [syncing, setSyncing] = useState(false);

  const call = async (cmd: string, args: Record<string, unknown>, ok?: string) => {
    if (!root) return;
    try {
      const out = await invoke<string>(cmd, args);
      if (ok) toast.success(out?.trim() ? `${ok}: ${out.trim().split("\n")[0]}` : ok);
      refreshGit(root);
    } catch (e) {
      toast.error(String(e));
    }
  };

  // Keep the selected file's diff in sync with the current stage state.
  useEffect(() => {
    if (tab !== "changes" || !selectedFile || !root || !status) return;
    const f = status.files.find((x) => x.path === selectedFile);
    if (!f) {
      setFileDiff("");
      return;
    }
    const staged = f.worktree === " " && f.index !== " ";
    invoke<string>("git_diff", { root, path: f.path, staged })
      .then(setFileDiff)
      .catch((e) => setFileDiff(String(e)));
  }, [status, selectedFile, root, tab]);

  const selectCommits = async (ids: string[]) => {
    setSelCommits(ids);
    if (!root || ids.length === 0) return;
    try {
      setCommitDiff(
        await invoke<string>("git_commit_diff", { root, oldest: ids[ids.length - 1], newest: ids[0] })
      );
    } catch (e) {
      setCommitDiff(String(e));
    }
  };

  if (!repos) return <Centered>Loading…</Centered>;
  if (repos.length === 0)
    return <Centered>No git repository found in this project or its immediate subfolders.</Centered>;
  if (error) return <Centered>Failed to read repository.</Centered>;

  const files = status?.files ?? [];
  const staged = files.filter((f) => f.index !== " ");
  const allStaged = files.length > 0 && staged.length === files.length;

  const toggle = (f: GitFile) =>
    call(f.index !== " " ? "git_unstage" : "git_stage", { root, path: f.path });
  const toggleAll = () =>
    files.forEach((f) => call(allStaged ? "git_unstage" : "git_stage", { root, path: f.path }));

  const sync = syncAction(status?.ahead ?? 0, status?.behind ?? 0);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Top bar */}
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-zinc-800 bg-zinc-950 px-3 text-sm">
        <VscSourceControl className="text-zinc-500" />
        {repos.length > 1 && (
          <RepoMenu
            repos={repos}
            current={root}
            onSelect={(r) => {
              setSelectedRepo(r);
              setSelectedFile(null);
              setSelCommits([]);
            }}
          />
        )}

        <BranchMenu
          branches={branches}
          current={status?.branch ?? null}
          onCheckout={(name) => call("git_checkout_branch", { root, name })}
          onCreate={(name) => call("git_create_branch", { root, name })}
          onMerge={(name) => call("git_merge", { root, name }, `Merged ${name}`)}
        />

        <div className="ml-auto flex items-center gap-2 text-sm text-zinc-400">
          {status?.upstream && (
            <span className="text-xs text-zinc-500">
              ↑{status.ahead} ↓{status.behind}
            </span>
          )}
          <button
            disabled={syncing}
            onClick={async () => {
              setSyncing(true);
              try {
                await call(sync.cmd, { root }, sync.ok);
              } finally {
                setSyncing(false);
              }
            }}
            title={sync.title}
            className="flex items-center gap-1.5 rounded bg-zinc-800 px-3 py-1.5 text-zinc-200 hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-zinc-800"
          >
            <VscSync size={15} className={cn(syncing && "animate-spin")} />
            {sync.label}
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Left sidebar: Changes / History */}
        <div className="flex w-96 shrink-0 flex-col border-r border-zinc-800">
          <div className="flex h-9 shrink-0 items-center gap-1 border-b border-zinc-800 bg-zinc-950 px-2 text-sm">
            <TabBtn active={tab === "changes"} onClick={() => setTab("changes")}>
              Changes {files.length > 0 && <span className="ml-1 text-zinc-500">{files.length}</span>}
            </TabBtn>
            <TabBtn active={tab === "history"} onClick={() => setTab("history")}>
              History
            </TabBtn>
          </div>

          {tab === "changes" ? (
            <>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {!status ? (
                  <div className="p-3 text-xs text-zinc-600">Loading…</div>
                ) : files.length === 0 ? (
                  <div className="p-3 text-xs text-zinc-600">No local changes.</div>
                ) : (
                  <>
                    <label className="flex cursor-pointer items-center gap-2 border-b border-zinc-900 px-2.5 py-2 text-sm text-zinc-400">
                      <input type="checkbox" checked={allStaged} onChange={toggleAll} className="accent-sky-500" />
                      {staged.length} of {files.length} to commit
                    </label>
                    {files.map((f) => (
                      <div
                        key={f.path}
                        onClick={() => setSelectedFile(f.path)}
                        className={cn(
                          "flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-sm",
                          selectedFile === f.path ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:bg-zinc-900"
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={f.index !== " "}
                          onClick={(e) => e.stopPropagation()}
                          onChange={() => toggle(f)}
                          className="accent-sky-500"
                        />
                        <span
                          className={cn(
                            "w-3 shrink-0 text-center font-mono",
                            f.conflicted ? "text-red-400" : "text-amber-500"
                          )}
                        >
                          {f.conflicted ? "!" : f.worktree !== " " ? f.worktree : f.index}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{f.path}</span>
                      </div>
                    ))}
                  </>
                )}
              </div>

              <div className="shrink-0 border-t border-zinc-800 p-2">
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Summary (required)"
                  rows={3}
                  className="w-full resize-none rounded bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 outline-none ring-1 ring-zinc-800 focus:ring-sky-700"
                />
                <button
                  disabled={!message.trim() || staged.length === 0}
                  onClick={async () => {
                    await call("git_commit", { root, message });
                    setMessage("");
                  }}
                  className={cn(
                    "mt-1.5 flex w-full items-center justify-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium",
                    !message.trim() || staged.length === 0
                      ? "cursor-not-allowed bg-zinc-800 text-zinc-500"
                      : "bg-emerald-700 text-white hover:bg-emerald-600"
                  )}
                >
                  <VscGitCommit size={15} />
                  Commit{status?.branch ? ` to ${status.branch}` : ""}
                  {staged.length > 0 ? ` (${staged.length})` : ""}
                </button>
              </div>
            </>
          ) : (
            <CommitList commits={log ?? []} selected={selCommits} onSelect={selectCommits} />
          )}
        </div>

        {/* Right main pane: pure diff */}
        <div className="flex min-w-0 flex-1 flex-col bg-[#0d1117]">
          {tab === "changes" ? (
            selectedFile ? (
              <>
                <PaneHeader>{selectedFile}</PaneHeader>
                <div className="min-h-0 flex-1 overflow-auto">
                  <DiffView text={fileDiff} />
                </div>
              </>
            ) : (
              <Empty>Select a file to view its diff.</Empty>
            )
          ) : selCommits.length > 0 ? (
            <>
              <PaneHeader>
                {selCommits.length === 1
                  ? "Changes in commit"
                  : `Combined changes across ${selCommits.length} commits`}
              </PaneHeader>
              <div className="min-h-0 flex-1 overflow-auto">
                <DiffView text={commitDiff} />
              </div>
            </>
          ) : (
            <Empty>Select a commit to see its changes. Shift-click to compare a range.</Empty>
          )}
        </div>
      </div>
    </div>
  );
}

function syncAction(ahead: number, behind: number) {
  if (behind > 0)
    return { cmd: "git_pull", ok: "Pulled", label: `Pull origin (${behind})`, title: "Pull incoming commits" };
  if (ahead > 0)
    return { cmd: "git_push", ok: "Pushed", label: `Push origin (${ahead})`, title: "Push your commits" };
  return { cmd: "git_fetch", ok: "Fetched", label: "Fetch origin", title: "Fetch from remote" };
}

function RepoMenu({
  repos,
  current,
  onSelect,
}: {
  repos: string[];
  current?: string;
  onSelect: (repo: string) => void;
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
        className="flex items-center gap-1.5 rounded bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200 ring-1 ring-zinc-800 hover:bg-zinc-800"
      >
        <VscRepo size={15} className="text-zinc-500" />
        <span className="max-w-[10rem] truncate">{current ? folderName(current) : "—"}</span>
        <VscChevronDown size={14} className="text-zinc-500" />
      </button>
      {open && (
        <div className="vd-pop absolute top-9 left-0 z-50 w-64 overflow-hidden rounded-md border border-zinc-700 bg-zinc-900 shadow-xl">
          <div className="border-b border-zinc-800 px-3 py-2 text-xs text-zinc-500">Repository</div>
          <div className="max-h-72 overflow-y-auto py-1">
            {repos.map((r) => {
              const isCurrent = r === current;
              return (
                <button
                  key={r}
                  onClick={() => {
                    if (!isCurrent) onSelect(r);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-zinc-800",
                    isCurrent ? "text-zinc-100" : "text-zinc-300"
                  )}
                >
                  <VscCheck size={13} className={cn("shrink-0", isCurrent ? "text-sky-400" : "opacity-0")} />
                  <span className="truncate">{folderName(r)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function BranchMenu({
  branches,
  current,
  onCheckout,
  onCreate,
  onMerge,
}: {
  branches?: BranchList;
  current: string | null;
  onCheckout: (name: string) => void;
  onCreate: (name: string) => void;
  onMerge: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [mode, setMode] = useState<"switch" | "merge">("switch");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  const reset = () => {
    setOpen(false);
    setFilter("");
    setMode("switch");
    setCreating(false);
    setNewName("");
  };

  const list = (branches?.branches ?? []).filter((b) => b.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200 ring-1 ring-zinc-800 hover:bg-zinc-800"
      >
        <VscGitMerge size={15} className="text-zinc-500" />
        <span className="max-w-[14rem] truncate">{current ?? "—"}</span>
        <VscChevronDown size={14} className="text-zinc-500" />
      </button>

      {open && (
        <div className="vd-pop absolute top-9 left-0 z-50 w-80 overflow-hidden rounded-md border border-zinc-700 bg-zinc-900 shadow-xl">
          {mode === "merge" && (
            <div className="border-b border-zinc-800 px-3 py-2 text-xs text-zinc-400">
              Choose a branch to merge into <span className="text-zinc-200">{current}</span>
            </div>
          )}
          <div className="flex items-center gap-1.5 border-b border-zinc-800 px-2.5 py-2">
            <VscSearch size={13} className="text-zinc-600" />
            <input
              autoFocus
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter branches"
              className="w-full bg-transparent text-sm text-zinc-200 outline-none placeholder:text-zinc-600"
            />
          </div>

          <div className="max-h-72 overflow-y-auto py-1">
            {list.length === 0 && <div className="px-3 py-2 text-sm text-zinc-600">No branches.</div>}
            {list.map((b) => {
              const isCurrent = b === current;
              return (
                <button
                  key={b}
                  disabled={mode === "merge" && isCurrent}
                  onClick={() => {
                    if (mode === "merge") onMerge(b);
                    else if (!isCurrent) onCheckout(b);
                    reset();
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-zinc-800",
                    isCurrent ? "text-zinc-100" : "text-zinc-300",
                    mode === "merge" && isCurrent && "cursor-not-allowed opacity-40"
                  )}
                >
                  <VscCheck size={13} className={cn("shrink-0", isCurrent ? "text-sky-400" : "opacity-0")} />
                  <span className="truncate">{b}</span>
                </button>
              );
            })}
          </div>

          <div className="border-t border-zinc-800 p-1.5">
            {creating ? (
              <div className="flex items-center gap-1">
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newName.trim()) {
                      onCreate(newName.trim());
                      reset();
                    }
                    if (e.key === "Escape") setCreating(false);
                  }}
                  placeholder="new-branch-name"
                  className="w-full rounded bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100 outline-none ring-1 ring-sky-700"
                />
                <button
                  onClick={() => newName.trim() && (onCreate(newName.trim()), reset())}
                  className="rounded bg-sky-600 px-2.5 py-1.5 text-sm text-white hover:bg-sky-500"
                >
                  Create
                </button>
              </div>
            ) : (
              <div className="flex gap-1">
                <MenuAction onClick={() => setCreating(true)}>
                  <VscAdd size={12} /> New branch
                </MenuAction>
                <MenuAction
                  onClick={() => setMode((m) => (m === "merge" ? "switch" : "merge"))}
                  active={mode === "merge"}
                >
                  <VscGitMerge size={12} /> Merge…
                </MenuAction>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MenuAction({
  onClick,
  active,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-1 items-center justify-center gap-1 rounded px-2 py-1.5 text-sm hover:bg-zinc-800",
        active ? "bg-zinc-800 text-sky-400" : "text-zinc-300"
      )}
    >
      {children}
    </button>
  );
}

type CommitRow = { id: string; short: string; summary: string; author: string; time: number };

function CommitList({
  commits,
  selected,
  onSelect,
}: {
  commits: CommitRow[];
  selected: string[];
  onSelect: (ids: string[]) => void;
}) {
  const [anchor, setAnchor] = useState<number | null>(null);
  if (commits.length === 0) return <div className="p-3 text-xs text-zinc-600">No commits yet.</div>;

  const clickAt = (i: number, shift: boolean) => {
    if (shift && anchor !== null) {
      const [a, b] = [Math.min(anchor, i), Math.max(anchor, i)];
      onSelect(commits.slice(a, b + 1).map((c) => c.id));
    } else {
      setAnchor(i);
      onSelect([commits[i].id]);
    }
  };

  return (
    <div className="min-h-0 flex-1 divide-y divide-zinc-900 overflow-y-auto select-none">
      {commits.map((c, i) => (
        <div
          key={c.id}
          onClick={(e) => clickAt(i, e.shiftKey)}
          className={cn(
            "cursor-pointer px-3 py-2",
            selected.includes(c.id) ? "bg-sky-950/60" : "hover:bg-zinc-900"
          )}
        >
          <div className="flex items-center gap-2 text-sm text-zinc-200">
            <code className="text-amber-500">{c.short}</code>
            <span className="truncate">{c.summary}</span>
          </div>
          <div className="text-xs text-zinc-600">
            {c.author} · {new Date(c.time * 1000).toLocaleString()}
          </div>
        </div>
      ))}
    </div>
  );
}

function DiffView({ text }: { text: string }) {
  return (
    <pre className="p-2 text-xs leading-relaxed">
      {text.split("\n").map((line, i) => (
        <div
          key={i}
          className={cn(
            "whitespace-pre-wrap",
            line.startsWith("+") && !line.startsWith("+++") && "bg-emerald-950/40 text-emerald-300",
            line.startsWith("-") && !line.startsWith("---") && "bg-red-950/40 text-red-300",
            line.startsWith("@@") && "text-sky-400",
            !line.startsWith("+") && !line.startsWith("-") && !line.startsWith("@@") && "text-zinc-500"
          )}
        >
          {line || " "}
        </div>
      ))}
    </pre>
  );
}

function PaneHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-9 shrink-0 items-center border-b border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-400">
      <span className="truncate">{children}</span>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full items-center justify-center p-4 text-sm text-zinc-600">{children}</div>;
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn("rounded px-2 py-1", active ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:bg-zinc-900")}
    >
      {children}
    </button>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full items-center justify-center text-sm text-zinc-500">{children}</div>;
}
