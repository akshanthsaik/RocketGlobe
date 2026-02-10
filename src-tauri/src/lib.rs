// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

use tauri::{AppHandle, Manager};
use tauri::path::BaseDirectory;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

struct BackendState {
    child: Mutex<Option<Child>>,
}

impl Default for BackendState {
    fn default() -> Self {
        Self {
            child: Mutex::new(None),
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

fn resolve_python(backend_dir: &Path) -> PathBuf {
    #[cfg(target_os = "windows")]
    let venv_python = backend_dir
        .join("venv")
        .join("Scripts")
        .join("python.exe");

    #[cfg(not(target_os = "windows"))]
    let venv_python = backend_dir.join("venv").join("bin").join("python");

    if venv_python.exists() {
        return venv_python;
    }

    PathBuf::from("python")
}

fn spawn_backend(app: &AppHandle) -> Result<Child, String> {
    let backend_dir = resolve_backend_dir(app)?;
    let python = resolve_python(&backend_dir);

    let host = std::env::var("ROCKETGLOBE_BACKEND_HOST")
        .unwrap_or_else(|_| "127.0.0.1".to_string());
    let port = std::env::var("ROCKETGLOBE_BACKEND_PORT")
        .ok()
        .and_then(|value| value.parse::<u16>().ok())
        .unwrap_or(8000);

    let mut cmd = Command::new(python);
    cmd.current_dir(&backend_dir)
        .arg("-m")
        .arg("uvicorn")
        .arg("app.main:app")
        .arg("--host")
        .arg(host)
        .arg("--port")
        .arg(port.to_string())
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);

    cmd.spawn().map_err(|e| format!("Failed to start backend: {e}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(BackendState::default())
        .setup(|app| {
            if env_flag("ROCKETGLOBE_DISABLE_BACKEND") {
                return Ok(());
            }

            let child = spawn_backend(&app.handle())?;
            let state = app.state::<BackendState>();
            *state.child.lock().expect("backend state poisoned") = Some(child);
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                let child = {
                    let state = window.app_handle().state::<BackendState>();
                    let mut guard = state.child.lock().expect("backend state poisoned");
                    let child = guard.take();
                    child
                };
                if let Some(mut child) = child {
                    let _ = child.kill();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
