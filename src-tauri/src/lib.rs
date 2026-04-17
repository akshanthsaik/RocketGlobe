use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::Mutex;

use tauri::path::BaseDirectory;
use tauri::{AppHandle, Manager};

#[cfg(debug_assertions)]
use std::path::Path;

#[cfg(all(target_os = "windows", not(debug_assertions)))]
use std::os::windows::process::CommandExt;

#[cfg(all(target_os = "windows", not(debug_assertions)))]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[cfg_attr(debug_assertions, allow(dead_code))]
const PG_PORT: &str = "5433";
#[cfg_attr(debug_assertions, allow(dead_code))]
const PG_USER: &str = "rocketglobe";
#[cfg_attr(debug_assertions, allow(dead_code))]
const PG_DB: &str = "rocketglobe";

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}!", name)
}

struct BackendState {
    backend: Mutex<Option<Child>>,
    postgres: Mutex<Option<PostgresRuntime>>,
}

impl Default for BackendState {
    fn default() -> Self {
        Self {
            backend: Mutex::new(None),
            postgres: Mutex::new(None),
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

#[cfg_attr(debug_assertions, allow(dead_code))]
struct PostgresRuntime {
    pg_ctl: PathBuf,
    data_dir: PathBuf,
}

#[cfg(not(debug_assertions))]
fn init_postgres(app: &AppHandle) -> Result<(PostgresRuntime, String), String> {
    let app_data = app.path().app_local_data_dir().map_err(|e| e.to_string())?;

    std::fs::create_dir_all(&app_data).map_err(|e| e.to_string())?;

    let data_dir = app_data.join("pgdata");
    let pg_version = data_dir.join("PG_VERSION");

    let backend_dir = resolve_backend_dir(app)?;
    let mut postgres_candidates: Vec<PathBuf> = Vec::new();

    if let Ok(path) = app.path().resolve("postgres/bin", BaseDirectory::Resource) {
        postgres_candidates.push(path);
    }
    postgres_candidates.push(backend_dir.join("postgres").join("bin"));
    if let Some(parent) = backend_dir.parent() {
        postgres_candidates.push(parent.join("postgres").join("bin"));
    }

    let postgres_bin = postgres_candidates
        .into_iter()
        .find(|candidate| candidate.join("pg_ctl.exe").exists())
        .ok_or_else(|| {
            "Bundled postgres bin not found in resources (expected postgres/bin with pg_ctl.exe)"
                .to_string()
        })?;

    let initdb = postgres_bin.join("initdb.exe");
    let pg_ctl = postgres_bin.join("pg_ctl.exe");
    let createdb = postgres_bin.join("createdb.exe");
    let psql = postgres_bin.join("psql.exe");
    let postgres_root = postgres_bin
        .parent()
        .ok_or_else(|| "Unable to resolve postgres root directory".to_string())?;
    let share_dir = postgres_root.join("share");
    let share_bki = share_dir.join("postgres.bki");

    if !initdb.exists() {
        return Err(format!("Bundled initdb not found at {:?}", initdb));
    }
    if !pg_ctl.exists() {
        return Err(format!("Bundled pg_ctl not found at {:?}", pg_ctl));
    }
    if !createdb.exists() {
        return Err(format!("Bundled createdb not found at {:?}", createdb));
    }
    if !psql.exists() {
        return Err(format!("Bundled psql not found at {:?}", psql));
    }
    if !share_bki.exists() {
        return Err(format!(
            "Bundled postgres share files not found at {:?}. Expected postgres/share/postgres.bki",
            share_bki
        ));
    }

    // Recover from partially initialized clusters (for example from a prior failed install).
    if data_dir.exists() && !pg_version.exists() {
        std::fs::remove_dir_all(&data_dir).map_err(|e| {
            format!(
                "Failed to clean partial postgres data directory {:?}: {}",
                data_dir, e
            )
        })?;
    }

    if !data_dir.exists() {
        std::fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
    }

    if !pg_version.exists() {
        let init_output = Command::new(&initdb)
            .arg("-D")
            .arg(&data_dir)
            .arg("-U")
            .arg(PG_USER)
            .arg("-A")
            .arg("trust")
            .arg("-L")
            .arg(&share_dir)
            .output()
            .map_err(|e| e.to_string())?;

        if !init_output.status.success() {
            return Err(format!(
                "initdb failed: {}",
                String::from_utf8_lossy(&init_output.stderr).trim()
            ));
        }
    }

    let mut start = Command::new(&pg_ctl);
    start.arg("-D")
        .arg(&data_dir)
        .arg("-o")
        .arg(format!("-p {}", PG_PORT))
        .arg("start")
        .arg("-w");

    #[cfg(target_os = "windows")]
    start.creation_flags(CREATE_NO_WINDOW);

    let start_output = start.output().map_err(|e| e.to_string())?;
    if !start_output.status.success() {
        let stderr = String::from_utf8_lossy(&start_output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&start_output.stdout).trim().to_string();
        return Err(format!(
            "pg_ctl start failed (stdout='{}', stderr='{}')",
            stdout, stderr
        ));
    }

    let mut exists_cmd = Command::new(&psql);
    exists_cmd
        .arg("-p")
        .arg(PG_PORT)
        .arg("-U")
        .arg(PG_USER)
        .arg("-d")
        .arg("postgres")
        .arg("-tAc")
        .arg(format!(
            "SELECT 1 FROM pg_database WHERE datname='{}';",
            PG_DB
        ));

    #[cfg(target_os = "windows")]
    exists_cmd.creation_flags(CREATE_NO_WINDOW);

    let exists_output = exists_cmd.output().map_err(|e| e.to_string())?;
    if !exists_output.status.success() {
        return Err(format!(
            "psql database existence check failed: {}",
            String::from_utf8_lossy(&exists_output.stderr).trim()
        ));
    }

    let exists = String::from_utf8_lossy(&exists_output.stdout).trim() == "1";
    if !exists {
        let mut createdb_cmd = Command::new(&createdb);
        createdb_cmd
            .arg("-p")
            .arg(PG_PORT)
            .arg("-U")
            .arg(PG_USER)
            .arg("-w")
            .arg(PG_DB);

        #[cfg(target_os = "windows")]
        createdb_cmd.creation_flags(CREATE_NO_WINDOW);

        let createdb_output = createdb_cmd.output().map_err(|e| e.to_string())?;
        if !createdb_output.status.success() {
            return Err(format!(
                "createdb failed: {}",
                String::from_utf8_lossy(&createdb_output.stderr).trim()
            ));
        }
    }

    let database_url = format!("postgresql://{}@127.0.0.1:{}/{}", PG_USER, PG_PORT, PG_DB);

    Ok((PostgresRuntime { pg_ctl, data_dir }, database_url))
}

#[cfg(not(debug_assertions))]
fn stop_postgres(runtime: &PostgresRuntime) -> Result<(), String> {
    let mut stop = Command::new(&runtime.pg_ctl);
    stop.arg("-D")
        .arg(&runtime.data_dir)
        .arg("stop")
        .arg("-m")
        .arg("fast")
        .arg("-w");

    #[cfg(target_os = "windows")]
    stop.creation_flags(CREATE_NO_WINDOW);

    let status = stop.status().map_err(|e| e.to_string())?;
    if !status.success() {
        return Err("pg_ctl stop failed".into());
    }

    Ok(())
}

fn spawn_backend(app: &AppHandle) -> Result<(Child, Option<PostgresRuntime>), String> {
    let backend_dir = resolve_backend_dir(app)?;

    #[cfg(debug_assertions)]
    {
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

        let child = cmd.spawn().map_err(|e| e.to_string())?;
        return Ok((child, None));
    }

    #[cfg(not(debug_assertions))]
    {
        let (pg_runtime, database_url) = init_postgres(app)?;

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

        #[cfg(target_os = "windows")]
        cmd.creation_flags(CREATE_NO_WINDOW);

        let backend_child = cmd.spawn().map_err(|e| e.to_string())?;

        return Ok((backend_child, Some(pg_runtime)));
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

            let (backend_child, pg_child) = spawn_backend(&app.handle())?;

            let state = app.state::<BackendState>();
            *state.backend.lock().unwrap() = Some(backend_child);
            *state.postgres.lock().unwrap() = pg_child;

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

                // Kill postgres
                let postgres_child = {
                    let mut guard = state.postgres.lock().unwrap();
                    guard.take()
                };

                if let Some(_pg) = postgres_child {
                    #[cfg(not(debug_assertions))]
                    let _ = stop_postgres(&_pg);
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
