use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::Mutex;
#[cfg(debug_assertions)]
use std::net::{SocketAddr, TcpStream};
#[cfg(debug_assertions)]
use std::time::Duration;

use tauri::path::BaseDirectory;
use tauri::{AppHandle, Manager};

#[cfg(debug_assertions)]
use std::path::Path;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// Assigns `child` to a new Windows Job Object with
/// JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE. This makes the OS itself force-kill
/// the backend (and anything it spawns - notably PyInstaller's onefile
/// bootloader, which re-execs as a separate child process the backend
/// `Child` handle knows nothing about) the moment this app process's handles
/// are torn down, regardless of *how* that happens: normal exit, a crash, or
/// being killed from Task Manager. The `on_window_event` handler below also
/// explicitly taskkills the process tree on a graceful close, but that path
/// only runs for a graceful close - this is the backstop for every other way
/// the app can stop running, which a plain `Child::kill()` cannot cover
/// since Windows does not cascade-kill children when a parent dies.
///
/// The created job handle is deliberately never closed on success: keeping
/// it open for the app's entire lifetime is what makes kill-on-close work.
/// It's reclaimed by the OS when this process exits, whichever way that
/// happens.
#[cfg(target_os = "windows")]
fn assign_to_kill_on_close_job(child: &Child) {
    use std::os::windows::io::AsRawHandle;
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
        SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
        JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };

    unsafe {
        let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
        if job.is_null() {
            eprintln!("rocketglobe: CreateJobObjectW failed; backend won't be force-killed if the app is killed abnormally");
            return;
        }

        let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
        info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;

        let set_ok = SetInformationJobObject(
            job,
            JobObjectExtendedLimitInformation,
            &info as *const _ as *const std::ffi::c_void,
            std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
        );
        if set_ok == 0 {
            eprintln!("rocketglobe: SetInformationJobObject failed; backend won't be force-killed if the app is killed abnormally");
            CloseHandle(job);
            return;
        }

        let process_handle = child.as_raw_handle() as windows_sys::Win32::Foundation::HANDLE;
        if AssignProcessToJobObject(job, process_handle) == 0 {
            eprintln!("rocketglobe: AssignProcessToJobObject failed; backend won't be force-killed if the app is killed abnormally");
            CloseHandle(job);
        }
    }
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}!", name)
}

struct BackendState {
    backend: Mutex<Option<Child>>,
}

impl Default for BackendState {
    fn default() -> Self {
        Self {
            backend: Mutex::new(None),
        }
    }
}

fn env_flag(name: &str) -> bool {
    match std::env::var(name) {
        Ok(value) => matches!(
            value.as_str(),
            "1" | "true" | "TRUE" | "yes" | "YES" | "on" | "ON"
        ),
        Err(_) => false,
    }
}

fn env_optional(name: &str) -> Option<String> {
    std::env::var(name)
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
}

/// If something is already listening on the API port, skip spawning a second uvicorn in dev.
#[cfg(debug_assertions)]
fn local_backend_port_in_use() -> bool {
    let addr: SocketAddr = match "127.0.0.1:8000".parse() {
        Ok(a) => a,
        Err(_) => return false,
    };
    TcpStream::connect_timeout(&addr, Duration::from_millis(200)).is_ok()
}

fn resolve_backend_dir(app: &AppHandle) -> Result<PathBuf, String> {
    if cfg!(debug_assertions) {
        let cwd = std::env::current_dir().map_err(|e| e.to_string())?;

        if cwd.file_name().and_then(|n| n.to_str()) == Some("src-tauri") {
            if let Some(parent) = cwd.parent() {
                return Ok(parent.join("backend"));
            }
        }

        return Ok(cwd.join("backend"));
    }

    // tauri.conf.json declares the resource as "resources/backend/run_backend.exe"
    // (relative to src-tauri/), and Tauri preserves that structure under the
    // resolved resource root - so the installed path keeps the "resources/"
    // segment too. Debug mode never exercises this: it resolves the backend
    // dir straight from the repo's own backend/ folder instead.
    app.path()
        .resolve("resources/backend", BaseDirectory::Resource)
        .map_err(|e| e.to_string())
}

#[cfg(debug_assertions)]
fn resolve_python(backend_dir: &Path) -> Result<PathBuf, String> {
    #[cfg(target_os = "windows")]
    let venv_python = backend_dir.join("venv").join("Scripts").join("python.exe");

    #[cfg(not(target_os = "windows"))]
    let venv_python = backend_dir.join("venv").join("bin").join("python");

    if venv_python.exists() {
        return Ok(venv_python);
    }

    Err(format!(
        "Backend virtual environment Python not found at {:?}",
        venv_python
    ))
}

/// Release mode stores its SQLite DB as a single file under the app's local data dir,
/// so each user gets their own persistent local copy that survives app updates.
#[cfg(not(debug_assertions))]
fn resolve_release_database_url(app: &AppHandle) -> Result<String, String> {
    let app_data = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&app_data).map_err(|e| e.to_string())?;

    let db_path = app_data.join("rocketglobe.db");
    // SQLite URLs are file paths, not host paths - forward slashes work on Windows too.
    let db_path_str = db_path.to_string_lossy().replace('\\', "/");

    Ok(format!("sqlite:///{}", db_path_str))
}

fn spawn_backend(app: &AppHandle) -> Result<Option<Child>, String> {
    let backend_dir = resolve_backend_dir(app)?;

    #[cfg(debug_assertions)]
    {
        if !env_flag("ROCKETGLOBE_FORCE_SPAWN_BACKEND") && local_backend_port_in_use() {
            eprintln!(
                "rocketglobe: 127.0.0.1:8000 is in use; skipping embedded uvicorn (use your own backend or set ROCKETGLOBE_FORCE_SPAWN_BACKEND=1)"
            );
            return Ok(None);
        }

        let python = resolve_python(&backend_dir)?;

        let mut cmd = Command::new(python);
        cmd.current_dir(&backend_dir)
            .arg("-m")
            .arg("uvicorn")
            .arg("app.main:app")
            .arg("--host")
            .arg("127.0.0.1")
            .arg("--port")
            .arg("8000");

        if let Some(admin_token) = env_optional("VITE_ADMIN_TOKEN") {
            cmd.env("ADMIN_TOKEN", admin_token);
        }

        let child = cmd.spawn().map_err(|e| e.to_string())?;
        #[cfg(target_os = "windows")]
        assign_to_kill_on_close_job(&child);
        return Ok(Some(child));
    }

    #[cfg(not(debug_assertions))]
    {
        let database_url = resolve_release_database_url(app)?;

        let backend_exe = backend_dir.join("run_backend.exe");

        if !backend_exe.exists() {
            return Err(format!(
                "Bundled backend executable not found at {:?}",
                backend_exe
            ));
        }

        let mut cmd = Command::new(backend_exe);
        cmd.current_dir(&backend_dir);
        cmd.env("DATABASE_URL", database_url);
        cmd.env("API_HOST", "127.0.0.1");
        cmd.env("API_PORT", "8000");
        if let Some(admin_token) = env_optional("VITE_ADMIN_TOKEN") {
            cmd.env("ADMIN_TOKEN", admin_token);
        }

        #[cfg(target_os = "windows")]
        cmd.creation_flags(CREATE_NO_WINDOW);

        let backend_child = cmd.spawn().map_err(|e| e.to_string())?;
        #[cfg(target_os = "windows")]
        assign_to_kill_on_close_job(&backend_child);

        return Ok(Some(backend_child));
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Must be the first plugin registered. Without this, launching the
        // app a second time (e.g. an impatient double-click while the first
        // instance's backend is still cold-starting) spawns a second whole
        // app - including a second backend child process racing the first
        // for port 8000. The loser fails to bind and the app it belongs to
        // shows "the local database did not answer", which looks like a
        // real crash but is actually just two copies fighting over one
        // port. This makes a second launch attempt focus the existing
        // window instead of spawning anything new.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .manage(BackendState::default())
        .setup(|app| {
            if env_flag("ROCKETGLOBE_DISABLE_BACKEND") {
                return Ok(());
            }

            let backend_child = spawn_backend(&app.handle())?;

            let state = app.state::<BackendState>();
            *state.backend.lock().unwrap() = backend_child;

            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                let state = window.app_handle().state::<BackendState>();

                // Kill backend
                let backend_child = {
                    let mut guard = state.backend.lock().unwrap();
                    guard.take()
                };

                if let Some(mut backend) = backend_child {
                    // On Windows, run_backend.exe is a PyInstaller onefile
                    // bootloader: it extracts itself and re-execs as a
                    // *separate child process*, which is the one actually
                    // running uvicorn. backend.kill() only knows about the
                    // bootloader's PID, so it leaves that real process
                    // orphaned on port 8000 (and holding the exe file open,
                    // which then breaks the next install/rebuild). Killing
                    // the whole process tree via taskkill catches it.
                    #[cfg(target_os = "windows")]
                    {
                        let _ = Command::new("taskkill")
                            .args(["/T", "/F", "/PID", &backend.id().to_string()])
                            .creation_flags(CREATE_NO_WINDOW)
                            .output();
                    }
                    #[cfg(not(target_os = "windows"))]
                    {
                        let _ = backend.kill();
                    }
                    let _ = backend.wait();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
