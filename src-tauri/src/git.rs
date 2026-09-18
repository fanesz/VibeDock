// Git manager: git2 (libgit2) for structured local operations, the git CLI for
// network operations (push/pull/fetch) so the user's existing credential
// helpers / SSH agent just work — see planning.md §14.

use git2::{BranchType, DiffFormat, DiffOptions, Repository, Status, StatusOptions};
use serde::Serialize;

#[derive(Serialize)]
pub struct GitFile {
    path: String,
    index: char,    // staged change: A/M/D/R/T or ' '
    worktree: char, // unstaged change: ?/M/D/R/T or ' '
    conflicted: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatus {
    is_repo: bool,
    branch: Option<String>,
    upstream: Option<String>,
    ahead: usize,
    behind: usize,
    files: Vec<GitFile>,
}

fn index_char(s: Status) -> char {
    if s.contains(Status::INDEX_NEW) {
        'A'
    } else if s.contains(Status::INDEX_MODIFIED) {
        'M'
    } else if s.contains(Status::INDEX_DELETED) {
        'D'
    } else if s.contains(Status::INDEX_RENAMED) {
        'R'
    } else if s.contains(Status::INDEX_TYPECHANGE) {
        'T'
    } else {
        ' '
    }
}

fn wt_char(s: Status) -> char {
    if s.contains(Status::WT_NEW) {
        '?'
    } else if s.contains(Status::WT_MODIFIED) {
        'M'
    } else if s.contains(Status::WT_DELETED) {
        'D'
    } else if s.contains(Status::WT_RENAMED) {
        'R'
    } else if s.contains(Status::WT_TYPECHANGE) {
        'T'
    } else {
        ' '
    }
}

/// Repos to manage for a project: the root itself if it's a repo, otherwise any
/// immediate child directory that is one (monorepo layout: backend/, frontend/).
#[tauri::command]
pub fn git_repos(root: String) -> Result<Vec<String>, String> {
    if Repository::open(&root).is_ok() {
        return Ok(vec![root]);
    }
    let mut repos = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&root) {
        for e in entries.flatten() {
            let p = e.path();
            // Repository::open doesn't search parents, so this only matches a repo
            // rooted exactly at the child dir.
            if p.is_dir() && Repository::open(&p).is_ok() {
                if let Some(s) = p.to_str() {
                    repos.push(s.to_string());
                }
            }
        }
    }
    repos.sort();
    Ok(repos)
    // ponytail: depth-1 scan covers the backend/ + frontend/ case; go deeper only
    // if nested monorepos (apps/*/) actually show up.
}

#[tauri::command]
pub fn git_status(root: String) -> Result<GitStatus, String> {
    let repo = match Repository::open(&root) {
        Ok(r) => r,
        Err(_) => {
            return Ok(GitStatus {
                is_repo: false,
                branch: None,
                upstream: None,
                ahead: 0,
                behind: 0,
                files: vec![],
            })
        }
    };

    let mut branch = None;
    let mut upstream = None;
    let mut ahead = 0;
    let mut behind = 0;
    if let Ok(head) = repo.head() {
        branch = head.shorthand().map(str::to_string);
        if let Some(name) = branch.as_deref() {
            if let Ok(local) = repo.find_branch(name, BranchType::Local) {
                if let Ok(up) = local.upstream() {
                    upstream = up.name().ok().flatten().map(str::to_string);
                    if let (Some(l), Some(u)) = (head.target(), up.get().target()) {
                        if let Ok((a, b)) = repo.graph_ahead_behind(l, u) {
                            ahead = a;
                            behind = b;
                        }
                    }
                }
            }
        }
    }

    let mut opts = StatusOptions::new();
    opts.include_untracked(true).recurse_untracked_dirs(true);
    let statuses = repo.statuses(Some(&mut opts)).map_err(|e| e.to_string())?;
    let mut files = Vec::new();
    for e in statuses.iter() {
        let s = e.status();
        if s.is_ignored() {
            continue;
        }
        files.push(GitFile {
            path: e.path().unwrap_or("").to_string(),
            index: index_char(s),
            worktree: wt_char(s),
            conflicted: s.contains(Status::CONFLICTED),
        });
    }

    Ok(GitStatus { is_repo: true, branch, upstream, ahead, behind, files })
}

#[tauri::command]
pub fn git_stage(root: String, path: String) -> Result<(), String> {
    let repo = Repository::open(&root).map_err(|e| e.to_string())?;
    let mut index = repo.index().map_err(|e| e.to_string())?;
    let p = std::path::Path::new(&path);
    // Deleted files must be removed from the index; everything else is add.
    if repo.workdir().map(|w| w.join(p).exists()).unwrap_or(false) {
        index.add_path(p).map_err(|e| e.to_string())?;
    } else {
        index.remove_path(p).map_err(|e| e.to_string())?;
    }
    index.write().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn git_unstage(root: String, path: String) -> Result<(), String> {
    let repo = Repository::open(&root).map_err(|e| e.to_string())?;
    let head = repo.head().and_then(|h| h.peel(git2::ObjectType::Commit));
    match head {
        Ok(obj) => repo
            .reset_default(Some(&obj), [std::path::Path::new(&path)])
            .map_err(|e| e.to_string()),
        // No commits yet: unstaging means removing from the index.
        Err(_) => {
            let mut index = repo.index().map_err(|e| e.to_string())?;
            index.remove_path(std::path::Path::new(&path)).map_err(|e| e.to_string())?;
            index.write().map_err(|e| e.to_string())
        }
    }
}

#[tauri::command]
pub fn git_commit(root: String, message: String) -> Result<String, String> {
    if message.trim().is_empty() {
        return Err("Commit message is empty".into());
    }
    let repo = Repository::open(&root).map_err(|e| e.to_string())?;
    let sig = repo
        .signature()
        .map_err(|_| "No git identity — set user.name and user.email".to_string())?;
    let mut index = repo.index().map_err(|e| e.to_string())?;
    let tree_oid = index.write_tree().map_err(|e| e.to_string())?;
    let tree = repo.find_tree(tree_oid).map_err(|e| e.to_string())?;
    let parent = repo.head().ok().and_then(|h| h.peel_to_commit().ok());
    let parents: Vec<&git2::Commit> = parent.as_ref().map(|c| vec![c]).unwrap_or_default();
    let oid = repo
        .commit(Some("HEAD"), &sig, &sig, &message, &tree, &parents)
        .map_err(|e| e.to_string())?;
    Ok(oid.to_string())
}

#[tauri::command]
pub fn git_diff(root: String, path: String, staged: bool) -> Result<String, String> {
    let repo = Repository::open(&root).map_err(|e| e.to_string())?;
    let mut opts = DiffOptions::new();
    opts.pathspec(&path);
    // Show new/untracked files as all-additions instead of an empty diff.
    opts.include_untracked(true).recurse_untracked_dirs(true).show_untracked_content(true);
    let diff = if staged {
        let head_tree = repo.head().and_then(|h| h.peel_to_tree()).ok();
        repo.diff_tree_to_index(head_tree.as_ref(), None, Some(&mut opts))
    } else {
        repo.diff_index_to_workdir(None, Some(&mut opts))
    }
    .map_err(|e| e.to_string())?;

    let mut buf = String::new();
    diff.print(DiffFormat::Patch, |_delta, _hunk, line| {
        if matches!(line.origin(), '+' | '-' | ' ') {
            buf.push(line.origin());
        }
        buf.push_str(&String::from_utf8_lossy(line.content()));
        true
    })
    .map_err(|e| e.to_string())?;
    Ok(buf)
}

/// Combined patch for a commit (oldest == newest) or a range of commits.
/// Diffs the oldest selected commit's parent tree against the newest's tree, so
/// the changes introduced by the whole selection are shown (GitHub-Desktop style).
#[tauri::command]
pub fn git_commit_diff(root: String, oldest: String, newest: String) -> Result<String, String> {
    let repo = Repository::open(&root).map_err(|e| e.to_string())?;
    let newest_tree = repo
        .revparse_single(&newest)
        .and_then(|o| o.peel_to_commit())
        .and_then(|c| c.tree())
        .map_err(|e| e.to_string())?;
    let oldest_commit = repo
        .revparse_single(&oldest)
        .and_then(|o| o.peel_to_commit())
        .map_err(|e| e.to_string())?;
    // base = parent of the oldest commit (None for the very first commit → diff vs empty).
    let base_tree = oldest_commit.parent(0).ok().and_then(|p| p.tree().ok());

    let mut opts = DiffOptions::new();
    let diff = repo
        .diff_tree_to_tree(base_tree.as_ref(), Some(&newest_tree), Some(&mut opts))
        .map_err(|e| e.to_string())?;

    let mut buf = String::new();
    diff.print(DiffFormat::Patch, |_delta, _hunk, line| {
        if matches!(line.origin(), '+' | '-' | ' ') {
            buf.push(line.origin());
        }
        buf.push_str(&String::from_utf8_lossy(line.content()));
        true
    })
    .map_err(|e| e.to_string())?;
    Ok(buf)
}

#[derive(Serialize)]
pub struct BranchList {
    current: Option<String>,
    branches: Vec<String>,
}

#[tauri::command]
pub fn git_branches(root: String) -> Result<BranchList, String> {
    let repo = Repository::open(&root).map_err(|e| e.to_string())?;
    let mut current = None;
    let mut branches = Vec::new();
    for b in repo.branches(Some(BranchType::Local)).map_err(|e| e.to_string())?.flatten() {
        let (branch, _) = b;
        if let Ok(Some(name)) = branch.name() {
            if branch.is_head() {
                current = Some(name.to_string());
            }
            branches.push(name.to_string());
        }
    }
    Ok(BranchList { current, branches })
}

#[tauri::command]
pub fn git_checkout_branch(root: String, name: String) -> Result<(), String> {
    let repo = Repository::open(&root).map_err(|e| e.to_string())?;
    let obj = repo
        .revparse_single(&format!("refs/heads/{name}"))
        .map_err(|e| e.to_string())?;
    repo.checkout_tree(&obj, None).map_err(|e| e.to_string())?;
    repo.set_head(&format!("refs/heads/{name}")).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn git_create_branch(root: String, name: String) -> Result<(), String> {
    let repo = Repository::open(&root).map_err(|e| e.to_string())?;
    let commit = repo.head().and_then(|h| h.peel_to_commit()).map_err(|e| e.to_string())?;
    repo.branch(&name, &commit, false).map_err(|e| e.to_string())?;
    git_checkout_branch(root, name)
}

#[tauri::command]
pub fn git_delete_branch(root: String, name: String) -> Result<(), String> {
    let repo = Repository::open(&root).map_err(|e| e.to_string())?;
    let mut b = repo.find_branch(&name, BranchType::Local).map_err(|e| e.to_string())?;
    if b.is_head() {
        return Err("Cannot delete the current branch".into());
    }
    b.delete().map_err(|e| e.to_string())
}

#[derive(Serialize)]
pub struct Commit {
    id: String,
    short: String,
    summary: String,
    author: String,
    time: i64,
}

#[tauri::command]
pub fn git_log(root: String, limit: usize) -> Result<Vec<Commit>, String> {
    let repo = Repository::open(&root).map_err(|e| e.to_string())?;
    let mut walk = repo.revwalk().map_err(|e| e.to_string())?;
    if walk.push_head().is_err() {
        return Ok(vec![]); // no commits yet
    }
    let mut out = Vec::new();
    for oid in walk.take(limit) {
        let oid = oid.map_err(|e| e.to_string())?;
        let c = repo.find_commit(oid).map_err(|e| e.to_string())?;
        out.push(Commit {
            id: oid.to_string(),
            short: oid.to_string()[..7].to_string(),
            summary: c.summary().unwrap_or("").to_string(),
            author: c.author().name().unwrap_or("").to_string(),
            time: c.time().seconds(),
        });
    }
    Ok(out)
}

fn run_git(root: &str, args: &[&str]) -> Result<String, String> {
    let mut cmd = std::process::Command::new("git");
    cmd.arg("-C").arg(root).args(args);
    // Fail fast instead of hanging on a credential prompt we can't answer
    // (the process has no TTY under CREATE_NO_WINDOW).
    cmd.env("GIT_TERMINAL_PROMPT", "0");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    let out = cmd.output().map_err(|e| e.to_string())?;
    let stdout = String::from_utf8_lossy(&out.stdout);
    let stderr = String::from_utf8_lossy(&out.stderr);
    if out.status.success() {
        Ok(format!("{stdout}{stderr}").trim().to_string())
    } else {
        Err(format!("{stderr}{stdout}").trim().to_string())
    }
}

#[tauri::command]
pub fn git_merge(root: String, name: String) -> Result<String, String> {
    // CLI merge: gives fast-forward handling, sensible messages, and leaves the
    // repo in the standard conflicted state we already surface via status.
    run_git(&root, &["merge", "--no-edit", &name])
}

#[tauri::command]
pub fn git_push(root: String) -> Result<String, String> {
    run_git(&root, &["push"])
}

#[tauri::command]
pub fn git_pull(root: String) -> Result<String, String> {
    run_git(&root, &["pull"])
}

#[tauri::command]
pub fn git_fetch(root: String) -> Result<String, String> {
    run_git(&root, &["fetch", "--all"])
}
