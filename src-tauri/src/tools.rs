// File discovery, read-only preview, and external launches.

use ignore::WalkBuilder;
use serde::Serialize;

const MAX_FILES: usize = 20_000;
const MAX_PREVIEW_BYTES: usize = 512 * 1024;

// Directories never worth walking even if not gitignored.
const HARD_EXCLUDES: &[&str] = &[
    "node_modules", ".git", "dist", "build", "target", ".next", "out", ".turbo", ".cache",
];

#[tauri::command]
pub fn list_files(root: String) -> Result<Vec<String>, String> {
    let root_path = std::path::Path::new(&root);
    if !root_path.is_dir() {
        return Err("Project path is not a directory".into());
    }

    let mut out = Vec::new();
    let walk = WalkBuilder::new(&root)
        .hidden(false) // show dotfiles, but .gitignore still applies below
        .git_ignore(true)
        .git_exclude(true)
        .filter_entry(|e| {
            !e.file_type().map(|t| t.is_dir()).unwrap_or(false)
                || !HARD_EXCLUDES.contains(&e.file_name().to_string_lossy().as_ref())
        })
        .build();

    for entry in walk.flatten() {
        if entry.file_type().map(|t| t.is_file()).unwrap_or(false) {
            if let Ok(rel) = entry.path().strip_prefix(root_path) {
                out.push(rel.to_string_lossy().replace('\\', "/"));
                if out.len() >= MAX_FILES {
                    break; // ponytail: cap the list; frontend fuzzy-filters it
                }
            }
        }
    }
    Ok(out)
}

#[derive(Serialize)]
pub struct FilePreview {
    content: String,
    truncated: bool,
    binary: bool,
}

#[tauri::command]
pub fn read_file_preview(path: String) -> Result<FilePreview, String> {
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    let truncated = bytes.len() > MAX_PREVIEW_BYTES;
    let slice = &bytes[..bytes.len().min(MAX_PREVIEW_BYTES)];
    let binary = slice.contains(&0);
    Ok(FilePreview {
        content: if binary { String::new() } else { String::from_utf8_lossy(slice).to_string() },
        truncated,
        binary,
    })
}

#[tauri::command]
pub fn kill_port(port: String) -> Result<String, String> {
    // Validate to digits only — the value is passed as an argv element, but this
    // also rejects nonsense early and documents the contract.
    if port.is_empty() || !port.chars().all(|c| c.is_ascii_digit()) {
        return Err("Port must be a number".into());
    }
    let mut cmd = std::process::Command::new("cmd");
    cmd.args(["/C", "npx", "kill-port", &port]); // npx is a .cmd shim → route via cmd.exe
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    let out = cmd.output().map_err(|e| e.to_string())?;
    let stdout = String::from_utf8_lossy(&out.stdout);
    let stderr = String::from_utf8_lossy(&out.stderr);
    if out.status.success() {
        Ok(format!("Killed process on port {port}. {stdout}{stderr}").trim().to_string())
    } else {
        Err(format!("{stderr}{stdout}").trim().to_string())
    }
}

#[tauri::command]
pub fn open_in_vscode(path: String) -> Result<(), String> {
    // `code` is a .cmd shim on Windows, so route through cmd.exe. Pass the path as
    // its own argv element (std quotes it for spaces) — do NOT pre-quote it, or the
    // quotes get escaped again and `code` opens an empty editor. `-n` = new window,
    // `--` ends option parsing so a path starting with `-` is still treated as a path.
    let mut cmd = std::process::Command::new("cmd");
    cmd.args(["/C", "code", "-n", "--", &path]);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    cmd.spawn().map_err(|_| "VS Code (`code`) not found on PATH".to_string())?;
    Ok(())
}

#[tauri::command]
pub fn open_in_explorer(path: String) -> Result<(), String> {
    // Open the folder itself in Explorer. (Done in Rust rather than the opener
    // plugin so no path-scope allowlist is needed.)
    std::process::Command::new("explorer")
        .arg(&path)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(()) // explorer's exit code is unreliable — don't wait on it.
}

#[tauri::command]
pub fn reveal_in_explorer(path: String) -> Result<(), String> {
    // Select the item in its parent folder.
    std::process::Command::new("explorer")
        .arg(format!("/select,{path}"))
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}
