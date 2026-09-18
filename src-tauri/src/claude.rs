// Claude Code session discovery. Claude Code stores transcripts as JSONL under
// ~/.claude/projects/<escaped-cwd>/<session-uuid>.jsonl. Rather than guess the
// dir-escaping scheme, we match by the `cwd` field inside the files — robust
// across versions (planning.md §13). Launching is just a terminal command, so
// it lives in the frontend; only discovery needs the backend.

use serde::Serialize;
use serde_json::Value;

#[derive(Serialize)]
pub struct ClaudeSession {
    id: String,
    label: String,
    mtime: i64,
}

fn home_dir() -> Option<String> {
    std::env::var("USERPROFILE").ok().or_else(|| std::env::var("HOME").ok())
}

fn norm(p: &str) -> String {
    p.replace('\\', "/").to_lowercase().trim_end_matches('/').to_string()
}

#[tauri::command]
pub fn claude_sessions(root: String) -> Result<Vec<ClaudeSession>, String> {
    let home = match home_dir() {
        Some(h) => h,
        None => return Ok(vec![]),
    };
    let projects = std::path::Path::new(&home).join(".claude").join("projects");
    if !projects.is_dir() {
        return Ok(vec![]); // Claude Code not installed / never run
    }
    let target = norm(&root);
    let mut out = Vec::new();

    for dir in std::fs::read_dir(&projects).map_err(|e| e.to_string())?.flatten() {
        let p = dir.path();
        if !p.is_dir() {
            continue;
        }
        let files: Vec<std::path::PathBuf> = std::fs::read_dir(&p)
            .into_iter()
            .flatten()
            .flatten()
            .map(|e| e.path())
            .filter(|f| f.extension().map(|e| e == "jsonl").unwrap_or(false))
            .collect();
        if files.is_empty() || !dir_matches(&files, &target) {
            continue;
        }
        for f in &files {
            let id = f.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
            let mtime = std::fs::metadata(f)
                .and_then(|m| m.modified())
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs() as i64)
                .unwrap_or(0);
            let label = extract_label(f).unwrap_or_else(|| id.clone());
            out.push(ClaudeSession { id, label, mtime });
        }
    }

    out.sort_by(|a, b| b.mtime.cmp(&a.mtime));
    Ok(out)
}

fn dir_matches(files: &[std::path::PathBuf], target: &str) -> bool {
    for f in files {
        if let Ok(content) = std::fs::read_to_string(f) {
            for line in content.lines() {
                if let Ok(v) = serde_json::from_str::<Value>(line) {
                    if let Some(cwd) = v.get("cwd").and_then(|c| c.as_str()) {
                        return norm(cwd) == target;
                    }
                }
            }
        }
    }
    false
}

fn extract_label(f: &std::path::Path) -> Option<String> {
    // ponytail: reads the whole file to find the first user message; fine for
    // MVP-sized transcripts, revisit if session files get huge.
    let content = std::fs::read_to_string(f).ok()?;
    for line in content.lines() {
        let Ok(v) = serde_json::from_str::<Value>(line) else { continue };
        if v.get("type").and_then(|t| t.as_str()) != Some("user") {
            continue;
        }
        let content = v.get("message").and_then(|m| m.get("content"));
        let text = match content {
            Some(Value::String(s)) => Some(s.clone()),
            Some(Value::Array(arr)) => arr.iter().find_map(|it| {
                if it.get("type").and_then(|t| t.as_str()) == Some("text") {
                    it.get("text").and_then(|t| t.as_str()).map(str::to_string)
                } else {
                    None
                }
            }),
            _ => None,
        };
        if let Some(t) = text {
            let t = t.trim().replace('\n', " ");
            if !t.is_empty() {
                return Some(t.chars().take(80).collect());
            }
        }
    }
    None
}
