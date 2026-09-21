// Claude Code session discovery. Claude Code stores transcripts as JSONL under
// ~/.claude/projects/<escaped-cwd>/<session-uuid>.jsonl. Rather than guess the
// dir-escaping scheme, we match by the `cwd` field inside the files — robust
// across versions (planning.md §13). Launching is just a terminal command, so
// it lives in the frontend; only discovery needs the backend.

use serde::Serialize;
use serde_json::Value;
use std::path::Path;

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
        // Skip Claude Code's synthetic user messages (slash-command name/args,
        // local-command stdout, and the caveat wrapper) — they aren't real prompts.
        if v.get("isMeta").and_then(|m| m.as_bool()) == Some(true) {
            continue;
        }
        if let Some(t) = text {
            let t = t.trim().replace('\n', " ");
            if t.is_empty() || t.starts_with("<command-") || t.starts_with("<local-command-") {
                continue;
            }
            return Some(t.chars().take(80).collect());
        }
    }
    None
}

// --- Subscription limits HUD -------------------------------------------------
// The 5-hour and weekly quota utilisation is server-side (not on disk), so we
// query the same endpoint Claude Code's `/usage` uses, authenticated with the
// OAuth token in ~/.claude/.credentials.json. Account-wide, not per-project.

const USAGE_URL: &str = "https://api.anthropic.com/api/oauth/usage";

#[derive(Serialize, Default)]
pub struct LimitWindow {
    utilization: f64, // percent, 0-100
    resets_at: Option<String>, // ISO-8601; the frontend renders the countdown
}

#[derive(Serialize, Default)]
pub struct ClaudeLimits {
    five_hour: LimitWindow,
    seven_day: LimitWindow,
    seven_day_opus: Option<LimitWindow>,
    seven_day_sonnet: Option<LimitWindow>,
}

fn read_oauth_token() -> Result<String, String> {
    let home = home_dir().ok_or("No home directory")?;
    let path = Path::new(&home).join(".claude").join(".credentials.json");
    let content =
        std::fs::read_to_string(&path).map_err(|_| "Claude credentials not found".to_string())?;
    let v: Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    v.get("claudeAiOauth")
        .and_then(|o| o.get("accessToken"))
        .and_then(|t| t.as_str())
        .map(str::to_string)
        .ok_or_else(|| "No OAuth token in credentials".to_string())
}

// A window is null in the response when it doesn't apply to this plan.
fn window_from(v: &Value, key: &str) -> Option<LimitWindow> {
    let w = v.get(key)?;
    if w.is_null() {
        return None;
    }
    Some(LimitWindow {
        utilization: w.get("utilization").and_then(|u| u.as_f64()).unwrap_or(0.0),
        resets_at: w.get("resets_at").and_then(|r| r.as_str()).map(str::to_string),
    })
}

#[tauri::command]
pub fn claude_limits() -> Result<ClaudeLimits, String> {
    let token = read_oauth_token()?;
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client
        .get(USAGE_URL)
        .bearer_auth(&token)
        .header("anthropic-beta", "oauth-2025-04-20")
        .header("anthropic-version", "2023-06-01")
        .header("User-Agent", "VibeDock")
        .send()
        .map_err(|e| format!("Request failed: {e}"))?;
    if resp.status() == reqwest::StatusCode::UNAUTHORIZED {
        // ponytail: no token refresh yet — Claude Code refreshes it on use, and
        // this app runs alongside it. Add the OAuth refresh flow if this nags.
        return Err("Claude auth expired — run `claude` once to refresh.".into());
    }
    if !resp.status().is_success() {
        return Err(format!("Usage endpoint returned {}", resp.status()));
    }
    let v: Value = resp.json().map_err(|e| e.to_string())?;
    Ok(ClaudeLimits {
        five_hour: window_from(&v, "five_hour").unwrap_or_default(),
        seven_day: window_from(&v, "seven_day").unwrap_or_default(),
        seven_day_opus: window_from(&v, "seven_day_opus"),
        seven_day_sonnet: window_from(&v, "seven_day_sonnet"),
    })
}
