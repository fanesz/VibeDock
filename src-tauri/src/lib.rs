mod claude;
mod git;
mod pty;
mod tools;

use pty::PtyManager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(PtyManager::default())
        .invoke_handler(tauri::generate_handler![
            pty::pty_spawn,
            pty::pty_write,
            pty::pty_is_idle,
            pty::pty_resize,
            pty::pty_close,
            pty::pty_kill_tree,
            pty::available_shells,
            tools::list_files,
            tools::read_file_preview,
            tools::open_in_vscode,
            tools::open_in_explorer,
            tools::reveal_in_explorer,
            tools::kill_port,
            git::git_repos,
            git::git_status,
            git::git_stage,
            git::git_unstage,
            git::git_commit,
            git::git_diff,
            git::git_commit_diff,
            git::git_branches,
            git::git_checkout_branch,
            git::git_create_branch,
            git::git_delete_branch,
            git::git_log,
            git::git_merge,
            git::git_push,
            git::git_pull,
            git::git_fetch,
            claude::claude_sessions
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
