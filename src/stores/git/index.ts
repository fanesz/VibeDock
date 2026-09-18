import useSWR, { mutate } from "swr";
import { invoke } from "@tauri-apps/api/core";

export type GitFile = { path: string; index: string; worktree: string; conflicted: boolean };
export type GitStatus = {
  isRepo: boolean;
  branch: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
  files: GitFile[];
};
export type BranchList = { current: string | null; branches: string[] };
export type Commit = { id: string; short: string; summary: string; author: string; time: number };

const statusKey = (root: string) => ["git_status", root];
const branchesKey = (root: string) => ["git_branches", root];
const logKey = (root: string) => ["git_log", root];

// Repos to manage for a project: the root, or its immediate child repos.
export function useGitRepos(projectPath?: string) {
  return useSWR<string[]>(projectPath ? ["git_repos", projectPath] : null, () =>
    invoke<string[]>("git_repos", { root: projectPath })
  );
}

// keepPreviousData keeps the last repo's data visible while a new repo loads, so
// switching repos doesn't blank the whole panel into a loading state.
export function useGitStatus(root?: string) {
  return useSWR<GitStatus>(
    root ? statusKey(root) : null,
    () => invoke<GitStatus>("git_status", { root }),
    { refreshInterval: 4000, keepPreviousData: true }
  );
}
export function useGitBranches(root?: string) {
  return useSWR<BranchList>(
    root ? branchesKey(root) : null,
    () => invoke<BranchList>("git_branches", { root }),
    { keepPreviousData: true }
  );
}
export function useGitLog(root?: string) {
  return useSWR<Commit[]>(
    root ? logKey(root) : null,
    () => invoke<Commit[]>("git_log", { root, limit: 50 }),
    { keepPreviousData: true }
  );
}

// Lightweight branch read for the status bar — shares the status cache key, so
// no extra polling when the Git view is also mounted.
export function useGitBranch(root?: string) {
  const { data } = useSWR<GitStatus>(root ? statusKey(root) : null, () =>
    invoke<GitStatus>("git_status", { root })
  );
  return data?.isRepo ? data.branch : null;
}

export function refreshGit(root: string) {
  void mutate(statusKey(root));
  void mutate(branchesKey(root));
  void mutate(logKey(root));
}
