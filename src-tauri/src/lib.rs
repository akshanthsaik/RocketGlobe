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

#[cfg(all(target_os = "windows", not(debug_assertions)))]
use std::os::windows::process::CommandExt;

#[cfg(all(target_os = "windows", not(debug_assertions)))]
const CREATE_NO_WINDOW: u32 = 0x08000000;

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

    app.path()
        .resolve("backend", BaseDirectory::Resource)
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

        return Ok(Some(backend_child));
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
                    let _ = backend.kill();
                    let _ = backend.wait();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
