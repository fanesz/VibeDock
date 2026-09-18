// Multi-session interactive terminals backed by real PTYs (ConPTY on Windows).
// Each session is keyed by an opaque id chosen by the frontend; output and exit
// are streamed on per-id events so many terminals never cross-wire.

use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Mutex;

use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System};
use tauri::{AppHandle, Emitter, Manager, State};

// The child is owned by the Session (not shared with the reader thread) so the
// kill path never contends with a blocking wait() — that interplay was a
// potential deadlock.
struct Session {
    writer: Box<dyn Write + Send>,
    master: Box<dyn MasterPty + Send>,
    child: Box<dyn Child + Send + Sync>,
    pid: Option<u32>, // shell root pid, for tree-kill on restart/close
}

#[derive(Default)]
pub struct PtyManager {
    sessions: Mutex<HashMap<String, Session>>,
}

fn resolve_shell(shell: &str) -> Result<CommandBuilder, String> {
    let program = match shell {
        "cmd" => "cmd.exe".to_string(),
        "gitbash" => find_git_bash().ok_or_else(|| "Git Bash not found".to_string())?,
        _ => "powershell.exe".to_string(), // default
    };
    Ok(CommandBuilder::new(program))
}

fn find_git_bash() -> Option<String> {
    [
        r"C:\Program Files\Git\bin\bash.exe",
        r"C:\Program Files (x86)\Git\bin\bash.exe",
    ]
    .into_iter()
    .find(|p| std::path::Path::new(p).exists())
    .map(str::to_string)
}

#[tauri::command]
pub fn available_shells() -> Vec<String> {
    let mut v = vec!["powershell".to_string(), "cmd".to_string()];
    if find_git_bash().is_some() {
        v.push("gitbash".to_string());
    }
    v
}

#[tauri::command]
pub fn pty_spawn(
    app: AppHandle,
    mgr: State<PtyManager>,
    id: String,
    shell: String,
    cwd: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let pair = native_pty_system()
        .openpty(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| e.to_string())?;

    let mut cmd = resolve_shell(&shell)?;
    if !cwd.is_empty() {
        cmd.cwd(cwd);
    }
    // Interactive TUIs (Claude Code/Ink, vim) inspect these to pick a renderer;
    // Windows doesn't set them, so without this they degrade or render blank.
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");

    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    drop(pair.slave); // else the read side never sees EOF

    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    let pid = child.process_id();

    mgr.sessions
        .lock()
        .unwrap()
        .insert(id.clone(), Session { writer, master: pair.master, child, pid });

    let out_event = format!("pty://output/{id}");
    let exit_event = format!("pty://exit/{id}");
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        let mut carry: Vec<u8> = Vec::new(); // holds bytes of a UTF-8 char split across reads
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    carry.extend_from_slice(&buf[..n]);
                    let valid = match std::str::from_utf8(&carry) {
                        Ok(s) => s.len(),
                        Err(e) => e.valid_up_to(),
                    };
                    if valid > 0 {
                        let chunk = String::from_utf8_lossy(&carry[..valid]).to_string();
                        let _ = app.emit(&out_event, chunk);
                        carry.drain(..valid);
                    }
                    // A partial char is <=3 trailing bytes; anything more is invalid —
                    // flush lossily so `carry` can't grow unbounded on binary output.
                    if carry.len() >= 4 {
                        let _ = app.emit(&out_event, String::from_utf8_lossy(&carry).to_string());
                        carry.clear();
                    }
                }
            }
        }
        // Remove the session on natural exit (no leak) and report the exit code.
        // If the kill path already removed it, we just report exit with no code.
        let removed = app.state::<PtyManager>().sessions.lock().unwrap().remove(&id);
        let code = removed.and_then(|mut s| s.child.wait().ok()).map(|st| st.exit_code());
        let _ = app.emit(&exit_event, code);
    });

    Ok(())
}

#[tauri::command]
pub fn pty_write(mgr: State<PtyManager>, id: String, data: String) -> Result<(), String> {
    let mut sessions = mgr.sessions.lock().unwrap();
    if let Some(s) = sessions.get_mut(&id) {
        s.writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
        s.writer.flush().map_err(|e| e.to_string())?;
    }
    Ok(())
}

// A terminal is "idle" (safe to reuse) when its shell has NO child process —
// i.e. it's sitting at a prompt, not running claude / bun run dev / etc. Any
// child (claude, node, docker…) means something's active → open a new terminal.
#[tauri::command]
pub fn pty_is_idle(mgr: State<PtyManager>, id: String) -> bool {
    let pid = match mgr.sessions.lock().unwrap().get(&id).and_then(|s| s.pid) {
        Some(p) => p,
        None => return false, // no live shell (dormant/exited) → not reusable
    };
    let mut sys = System::new();
    sys.refresh_processes_specifics(ProcessesToUpdate::All, true, ProcessRefreshKind::nothing());
    let parent = Pid::from_u32(pid);
    !sys.processes().values().any(|p| p.parent() == Some(parent))
}

#[tauri::command]
pub fn pty_resize(mgr: State<PtyManager>, id: String, cols: u16, rows: u16) -> Result<(), String> {
    let sessions = mgr.sessions.lock().unwrap();
    if let Some(s) = sessions.get(&id) {
        s.master
            .resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn pty_close(mgr: State<PtyManager>, id: String) -> Result<(), String> {
    let removed = mgr.sessions.lock().unwrap().remove(&id);
    if let Some(mut s) = removed {
        kill_session(&mut s);
    }
    Ok(())
}

// Restart's stop half: kill the shell AND its whole descendant tree (Ctrl+C
// alone can't be trusted for bun/node/docker children — see planning.md §12.3).
// The frontend re-spawns the same terminal id and re-sends the command.
#[tauri::command]
pub fn pty_kill_tree(mgr: State<PtyManager>, id: String) -> Result<(), String> {
    let removed = mgr.sessions.lock().unwrap().remove(&id);
    if let Some(mut s) = removed {
        kill_session(&mut s);
    }
    Ok(())
}

fn kill_session(s: &mut Session) {
    match s.pid {
        Some(pid) => kill_tree(pid),
        None => {
            let _ = s.child.kill();
        }
    }
}

fn kill_tree(pid: u32) {
    // ponytail: taskkill /T /F is the reliable Windows tree-kill for MVP;
    // Job Objects are the hardening path if detached children ever leak.
    let mut cmd = std::process::Command::new("taskkill");
    cmd.args(["/PID", &pid.to_string(), "/T", "/F"]);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    let _ = cmd.output();
}
