# Development Guide

Architecture, data model, API surface, sync internals, and local setup for working on RocketGlobe's code. Looking to just download and run the app instead? See the [main README](../README.md).

RocketGlobe is a Tauri desktop application that renders global launch activity on a Cesium globe. It ships with a local FastAPI backend that ingests Launch Library 2 (LL2) data and serves a read-only API for the UI.

**Architecture**

```mermaid
flowchart LR
  subgraph Desktop["Tauri Desktop App"]
    UI["React 19 + Vite 7\nCesium/Resium + Zustand"]
    Rust["Tauri (Rust)"]
  end

  API["FastAPI + SQLAlchemy"]
  DB["SQLite (local file)"]
  LL2["Launch Library 2 API\nhttps://ll.thespacedevs.com/2.3.0"]

  UI <-->|HTTP JSON| API
  Rust -->|spawns backend process| API
  API <--> DB
  API <--> LL2
```

**Sync Pipeline**

```mermaid
sequenceDiagram
  actor Admin
  Admin->>API: POST /admin/sync
  API->>DB: recover stale lock/run state
  alt sync already active
    API-->>Admin: 409 Conflict (+ run_id)
  else new sync accepted
    API->>DB: create sync_runs row (queued)
    API-->>Admin: 202 Accepted (+ run_id)
    API->>SyncWorker: sync_all(run_id)
  end
  SyncWorker->>DB: acquire SyncState lock
  loop agencies, pads, rockets, launches
    SyncWorker->>DB: may skip static resource if recently synced
    SyncWorker->>LL2: GET resource?updated__gte=last_sync
    LL2-->>SyncWorker: page of results or 429 throttle
    SyncWorker->>DB: bulk upsert + sync_runs progress update
  end
  alt throttle window too long
    SyncWorker->>DB: mark sync_runs partial + rate-limit metadata
  else completed
    SyncWorker->>DB: mark sync_runs success
  end
  SyncWorker->>DB: set last_synced_at
  SyncWorker->>DB: release lock
```

**Process Model**

```mermaid
flowchart TB
  subgraph Host["Host OS"]
    Tauri["Tauri app (Rust)"]

    subgraph Dev["Debug/Dev mode"]
      Uvicorn["backend/venv Python\npython -m uvicorn app.main:app"]
    end

    subgraph Release["Release mode"]
      Runner["bundled run_backend.exe"]
    end

    Tauri --> Uvicorn
    Tauri --> Runner
  end

  BrowserUI["WebView UI (React)"]
  Tauri --> BrowserUI
  BrowserUI -->|HTTP| Uvicorn
  BrowserUI -->|HTTP| Runner
```

## Components

**Frontend**

- React 19 + Vite 7 + TypeScript, Cesium/Resium for the globe, Zustand for state.
- API base URL is `VITE_API_BASE_URL` and defaults to `http://127.0.0.1:8000/api`.
- Initial data bootstrap retries API reads (up to 8 attempts) to tolerate backend startup lag.
- Dev server runs on `http://localhost:1420` in Tauri dev mode.
- Shared cross-component logic (pagination, per-entity launch counts/splits, debounced search, overlay positioning) lives in `src/hooks/`.
- ESLint (`eslint.config.js`) + Prettier + `tsc --noEmit` for static checks; Vitest (`vitest.config.ts`) for unit tests, covering the store, the shared hooks, and extracted pure-logic modules (`padTiers.test.ts`, `syncStages.test.ts`, `lib/utils.test.ts`).

**Backend**

- FastAPI app in `backend/app/main.py`.
- SQLAlchemy ORM with synchronous sessions.
- `init_db()` runs in app lifespan startup.
- LL2 sync implemented in `backend/app/workers/sync_worker.py`.
- Rate limiting and retry logic in `backend/app/services/ll2_client.py`.
- Sync lock state is stored in `sync_state` and run/progress state is stored in `sync_runs`.
- Startup and admin endpoints recover stale lock/run state before accepting new sync work.

**Database**

- SQLite, stored as a single file (`DATABASE_URL=sqlite:///./rocketglobe.db` by default in dev). In packaged release builds it lives under the app's local data directory so each user's synced data persists across app updates.
- Migrations exist under `backend/alembic/versions`. Alembic runs with `render_as_batch=True` on SQLite so future column changes go through the temp-table-rebuild path SQLite requires.
- `seed_if_missing()` (`backend/app/database.py`) runs at backend startup and at the top of `alembic/env.py`: if the `DATABASE_URL` sqlite file doesn't exist yet, it's copied from the committed offline snapshot (`backend/seed_data/rocketglobe_seed.db`) instead of starting from an empty schema, and never touches a file that already exists. Runs in both dev and packaged builds, so a fresh install has real data without a live first sync (LL2's anonymous tier is ~15 requests/hour). The seed path (`_SEED_DB_PATH`) resolves against the process's working directory rather than `__file__`, since `__file__` is useless inside a frozen PyInstaller exe.
- `pads.latitude`/`pads.longitude` are plain floats; there is no PostGIS/geospatial extension in use.

## Data Model (Backend)

Tables are defined under `backend/app/models`.

**agencies**

- `ll2_id`, `name`, `abbrev`, `type`, `country_code`, `description`, `founding_year`, `administrator`, `logo_url`, `is_active`

**pads**

- `ll2_id`, `name`, `latitude`, `longitude`, `country_code`, `map_url`, `total_launch_count`

**rockets**

- `ll2_id`, `name`, `family`, `full_name`, `variant`, `description`, `length`, `diameter`, `leo_capacity`, `gto_capacity`, `launch_mass`, `thrust`, `is_reusable`, `is_active`, `manufacturer_id`

**launches**

- `ll2_id`, `name`, `status`, `net`, `window_start`, `window_end`, `mission_name`, `mission_description`, `mission_type`, `orbit`, `webcast_live`, `video_url`, `pad_id`, `rocket_id`, `agency_id`, `image_url`, `raw_data`

**sync_state**

- `resource`, `last_synced_at`, `is_locked`, `lock_owner`, `locked_at`

**sync_runs**

- `run_id`, `status`, `is_active`, `current_resource`, `progress_done`, `progress_total`, `stats`, `message`, `error`, `started_at`, `finished_at`

All tables include `created_at` and `updated_at` from `TimestampMixin`, except `sync_state`.

## API Surface

All routes are read-only except the admin sync utilities.

**Launches**

- `GET /api/launches/` params: `skip`, `limit`, `status`, `agency_id`, `start_date`, `end_date`
- `GET /api/launches/upcoming/` params: `limit`
- `GET /api/launches/{id}`

**Pads**

- `GET /api/pads/` params: `skip`, `limit`, `country_code`
- `GET /api/pads/{id}`

**Agencies**

- `GET /api/agencies/` params: `skip`, `limit`, `country_code`, `type`
- `GET /api/agencies/{id}`

**Rockets**

- `GET /api/rockets/` params: `skip`, `limit`, `family`, `is_active`
- `GET /api/rockets/{id}`

**Admin**

- `POST /admin/sync` starts a background sync and returns `run_id` (202 if accepted, 409 with active `run_id` if already running, 429 when launches are in cooldown and static resources are already fresh)
- `GET /admin/sync-status` returns counts, lock state, and run status/progress; supports optional `run_id` query param
- `GET /admin/api-throttle` proxies LL2 `/api-throttle/`
- `GET /admin/test-api` fetches 1 agency, pad, rocket, launch
- `GET /admin/check-api` returns LL2 reported launch count
- `DELETE /admin/clear-data?confirm=true`

**Health**

- `GET /health` performs a simple DB query and returns counts

Swagger UI is available at `/docs`.
Use trailing slashes on collection routes to avoid `307 Temporary Redirect` responses.

## Sync and Rate Limiting

The LL2 client enforces minimum spacing between requests, exponential backoff with jitter, and honors `Retry-After` and `X-RateLimit-Reset` headers when available. Sync logic is incremental by resource and uses `updated__gte` where supported.

Current sync behavior:

- A DB-level lock (`sync_state`) prevents concurrent full syncs.
- Progress and lifecycle are tracked per run in `sync_runs` (`queued`, `running`, `success`, `partial`, `failed`, `blocked`).
- Stale locks/runs are recovered on startup and before admin sync actions.
- If LL2 asks for a throttle wait window longer than configured max wait, the request fails fast instead of sleeping for many minutes.
- Static resources (`agencies`, `pads`, `rockets`) are skipped when recently synced to reduce LL2 query volume; `launches` are always attempted.
- If a recent run was launch-rate-limited, launches are temporarily skipped until the prior wait window expires (cooldown), to avoid repeated LL2 hammering.
- `GET /admin/sync-status?lightweight=true` skips heavy DB count queries and is intended for UI polling.

Run status values (`sync_runs.status`):

- `queued`: accepted and waiting for worker thread.
- `running`: actively syncing resources.
- `success`: completed and lock released.
- `partial`: completed with rate-limit skips (`run.stats._rate_limited` contains details).
- `failed`: sync aborted due to non-recoverable exception.
- `blocked`: did not start because another run held the lock.

`run.run_id` is the stable id to poll the same run across requests; the rest of the response shape is documented at `/docs`. `POST /admin/sync` can also return `retry_after_seconds` directly when a cooldown pre-check blocks the run before one even starts.

**Seed snapshot (`backend/tools/build_seed_snapshot.py`)**

LL2's anonymous tier (~15 requests/hour) can't sustain a fresh install's first full-history sync (confirmed with The Space Devs: crawling once and caching a snapshot is the expected pattern). This separate, deliberately patient tool builds that snapshot — run by hand, unattended, for as long as a full crawl takes:

```bash
cd backend
python tools/build_seed_snapshot.py --out seed_data/rocketglobe_seed.db
```

- Defaults to production LL2 regardless of `backend/.env` (a seed built from the dev sandbox's small dataset would be useless).
- Sleeps through rate-limit windows instead of failing fast, and checkpoints progress to disk after every page, so it's safe to Ctrl+C and re-run to resume.
- Resulting `.db` ships with the app as the historical seed; the live per-user sync then only fetches new/changed data.

## Sync Troubleshooting

**Symptom: sync ends quickly with a rate-limit message** (`LL2 rate limit window too long ... max allowed wait is ...s`)

LL2 asked the client to wait longer than the configured maximum; with partial mode enabled the run finishes as `partial` and reports retry metadata instead of sleeping. Check `GET /admin/api-throttle` for current throttle state, then either retry later or raise the wait budgets (`LL2_MAX_WAIT_SECONDS`, `LL2_MAX_REQUEST_DURATION`, `LL2_LAUNCHES_MAX_WAIT_SECONDS`, `LL2_LAUNCHES_MAX_REQUEST_DURATION`). If the backend startup log's `LL2 config: ...` line doesn't reflect the values you set, your local backend `.env` has stale overrides.

**Symptom: `POST /admin/sync` returns 409**

A run is already active — use the returned `run_id` to poll `GET /admin/sync-status?run_id=...` instead of starting a new one.

## Configuration

Environment templates:

- Root frontend template: `.env.example`
- Backend template: `backend/.env.example`

**Backend env vars** (read via `pydantic_settings`, `.env` in the backend working directory):

Environment variables override code defaults. Confirm effective values from backend startup logs (`LL2 config: ...`).

| Variable                               | Default                             | Purpose                                                            |
| -------------------------------------- | ----------------------------------- | ------------------------------------------------------------------ |
| `DATABASE_URL`                         | none                                | SQLAlchemy DB URL                                                  |
| `LL2_BASE_URL`                         | `https://ll.thespacedevs.com/2.3.0` | LL2 API root                                                       |
| `LL2_SYNC_INTERVAL`                    | `900`                               | Defined but not currently scheduled in code                        |
| `LL2_SYNC_PAGE_LIMIT`                  | `500`                               | Page size used for LL2 sync requests                               |
| `LL2_MIN_REQUEST_INTERVAL`             | `2.0`                               | Minimum seconds between LL2 requests                               |
| `LL2_BASE_BACKOFF`                     | `1.0`                               | Base backoff seconds                                               |
| `LL2_MAX_BACKOFF`                      | `60.0`                              | Max backoff seconds                                                |
| `LL2_MAX_RETRIES`                      | `8`                                 | Max retries per non-launch request                                 |
| `LL2_MAX_WAIT_SECONDS`                 | `120`                               | Max allowed throttle wait before fail-fast                         |
| `LL2_MAX_REQUEST_DURATION`             | `300`                               | Max total retry budget (seconds) per request                       |
| `LL2_LAUNCHES_MIN_REQUEST_INTERVAL`    | `2.5`                               | Launches-only minimum request spacing (seconds)                    |
| `LL2_LAUNCHES_MAX_RETRIES`             | `20`                                | Launches-only max retries                                          |
| `LL2_LAUNCHES_MAX_WAIT_SECONDS`        | `300`                               | Launches-only max allowed throttle wait                            |
| `LL2_LAUNCHES_MAX_REQUEST_DURATION`    | `1800`                              | Launches-only max retry budget (seconds)                           |
| `LL2_STATIC_RESOURCES_MIN_INTERVAL`    | `86400`                             | Skip agencies/pads/rockets sync if recently synced                 |
| `LL2_EXISTING_DATA_LOOKBACK_HOURS`     | `24`                                | Fallback incremental baseline window when sync state is missing    |
| `LL2_ALLOW_PARTIAL_SYNC_ON_RATE_LIMIT` | `True`                              | If true, sync completes as partial when LL2 rate-limits a resource |
| `SQL_ECHO`                             | `False`                             | SQLAlchemy SQL echo                                                |
| `API_HOST`                             | `127.0.0.1`                         | Host uvicorn binds to (`run_backend.py` and `python app/main.py`)  |
| `API_PORT`                             | `8000`                              | Port uvicorn binds to (`run_backend.py` and `python app/main.py`)  |
| `ADMIN_TOKEN`                          | `""`                                 | If set, required as `X-Admin-Token` on every `/admin/*` request (loopback-only regardless) |
| `SYNC_SUBPROCESS_INHERIT_STDERR`       | `False`                             | Dev convenience: `true` shows the sync subprocess's stderr in the uvicorn terminal instead of only the log file |

**Frontend env vars**

| Variable            | Default                     | Purpose                |
| ------------------- | --------------------------- | ---------------------- |
| `VITE_API_BASE_URL` | `http://127.0.0.1:8000/api` | Base URL for API calls |
| `VITE_ADMIN_TOKEN`  | unset                       | Sent as `X-Admin-Token` on admin calls via `adminFetch` (`src/lib/api.ts`); must match the backend's `ADMIN_TOKEN`. |

The globe renders without imagery tiles — a flat ground with country outlines
drawn from GeoJSON — so no Cesium Ion token is required and the globe works
with no network.

`VITE_ADMIN_TOKEN` only reaches the backend if the process spawning it sees the same variable: Vite bakes it into the frontend bundle from `.env`, but `src-tauri` doesn't parse `.env` files, so export it in your shell before `bun run tauri dev` (dev) or before launching the installed app (release) — `spawn_backend` in `lib.rs` forwards it as `ADMIN_TOKEN` identically in both modes. The release pipeline (`scripts/release-windows.ps1`) never sets it, so `ADMIN_TOKEN` protection is effectively dev-only unless done by hand.

**Tauri env vars**

| Variable                          | Default | Purpose                                                                                 |
| ---------------------------------- | ------- | ----------------------------------------------------------------------------------------- |
| `ROCKETGLOBE_DISABLE_BACKEND`     | unset   | If truthy, do not spawn backend                                                         |
| `ROCKETGLOBE_FORCE_SPAWN_BACKEND` | unset   | Debug mode only: spawn the embedded uvicorn even if `127.0.0.1:8000` is already in use   |

## Development

**Prerequisites**

- Node.js (Vite 7 requires Node `>=20.19` or `22.12+`)
- Bun
- Rust toolchain (for Tauri)
- Python 3.x (for backend dev/build tooling)

No separate database server is required — the backend uses SQLite, a single local file.

**Database setup**

```bash
cd backend
alembic upgrade head
```

If you prefer SQLAlchemy metadata creation instead of migrations:

```bash
cd backend
python -c "from app.database import init_db; init_db()"
```

**Backend only**

```bash
cd backend
python -m venv venv
venv\Scripts\pip install -r requirements.txt
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

`DATABASE_URL` defaults to `sqlite:///./rocketglobe.db` (relative to `backend/`) if unset.

For long-running sync debugging, prefer running without `--reload`.

**Frontend only**

```bash
bun install
bun run dev
bun run check    # tsc --noEmit
bun run lint     # eslint
bun run format   # prettier --write
bun run test     # vitest run
```

**Tauri dev**

```bash
# ensure backend/venv exists (Tauri debug mode uses this interpreter)
cd backend
python -m venv venv
venv\Scripts\pip install -r requirements.txt

# from repo root
cd ..
bun run tauri dev
```

**CI** (`.github/workflows/ci.yml`)

Three jobs run on every push/PR to `main`/`develop`:

- `frontend` (Windows runner): `bun install`, `bun run check`, `bun run format:check`. The Tauri build itself is currently skipped in CI.
- `backend` (Ubuntu runner): `ruff check .`, `ruff format --check .`, `alembic upgrade head`, `pytest tests/`.
- `lint` (Ubuntu runner): checks that the latest commit message starts with a Conventional Commits type (`feat|fix|docs|style|refactor|test|chore|perf|ci|build|revert:`); non-blocking.

`bun run lint` and `bun run test` are not run in CI — run them locally before considering frontend work done.

## Packaging Notes

Current Tauri bundle resources are configured in `src-tauri/tauri.conf.json` (object form, so a resource can be pulled in from outside `src-tauri/`):

- `resources/backend/run_backend.exe` — the PyInstaller-frozen backend, built by `backend/tools/build_backend_exe.ps1`.
- `../backend/seed_data/rocketglobe_seed.db` → `resources/backend/seed_data/rocketglobe_seed.db` — the offline snapshot `seed_if_missing()` copies into place on a fresh install.

Important behavior:

- Debug build: Tauri starts backend via `backend/venv` Python + `uvicorn`. `DATABASE_URL` comes from `backend/.env`, defaulting to `sqlite:///./rocketglobe.db`.
- Release build: Tauri starts bundled `run_backend.exe` with `DATABASE_URL` pointed at `<app_local_data_dir>/rocketglobe.db` (`resolve_release_database_url` in `lib.rs`), so each user's data persists across updates. `resolve_backend_dir()` resolves `resources/backend` under `BaseDirectory::Resource` in release — it must match the resource paths above exactly, or the app panics on launch with "Bundled backend executable not found".
- `src-tauri/resources/` is gitignored, so those artifacts must exist locally before `tauri build` — `bun run release:windows` builds them (see Windows Release below); a bare `bun run tauri build` does not.
- `tauri-plugin-single-instance` is registered first in the builder chain (`lib.rs`) — without it, a second launch during cold PyInstaller extraction spawns a second app + backend racing for port 8000, and the loser's failed bind looks like a real crash. A second launch now just focuses the existing window.

### CORS and CSP for the packaged webview

Two separate browser mechanisms gate the packaged app's calls to its own local backend; get either wrong and the UI breaks with no server-side symptom to debug from.

- **CORS** (`CORSMiddleware.allow_origins` in `backend/app/main.py`) must include `http://tauri.localhost` — the actual origin a packaged Tauri v2 app uses on Windows, distinct from both Vite's dev origin (why `tauri dev` never catches this) and the legacy v1 scheme `tauri://localhost` (easy to add by mistake). Miss it and requests still complete with a real `200` in the backend logs, but the browser withholds the response from JS — the frontend shows "Failed to fetch" with nothing in the network tab unless DevTools' console is open.
- **CSP** (`app.security.csp` in `src-tauri/tauri.conf.json`) needs `'wasm-unsafe-eval'` **and** `blob:` in `script-src` — not just `worker-src` — for Cesium. Its geometry workers spawn fine under `worker-src 'self' blob:` alone, but each then loads its code via `importScripts()` on a `blob:` URL, which `script-src` governs. Miss `script-src blob:` and you get a working app with an invisible globe: pad markers render, country outlines don't. `devCsp`'s `'unsafe-eval'` masks this entirely in dev.
- To debug either in a packaged build: launch the installed exe with `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222`, then attach to `http://127.0.0.1:9222/json` for a list of CDP targets and open a WebSocket to the main page's `webSocketDebuggerUrl`.

## Windows Release

This path keeps the current architecture: Tauri desktop app + local backend process.

```powershell
bun run release:windows
```

Alternative local-default pipeline:

```powershell
bun run release:windows:local
```

What `scripts/release-windows.ps1` does:

- writes `backend/.env` and root `.env`
- creates `backend/venv` if missing
- installs backend dependencies
- initializes schema via `init_db()`
- installs frontend dependencies with `bun install --frozen-lockfile`
- runs frontend type-check (`bun run check`) unless skipped
- builds `run_backend.exe` via `backend/tools/build_backend_exe.ps1 -Force` and copies it to `src-tauri/resources/backend/run_backend.exe`
- runs `bun run tauri build`

Output artifacts are placed under:

- `src-tauri/target/release/bundle` (both `.msi` and NSIS `-setup.exe`)

If only `src-tauri/` changed (no frontend or backend edits), `bun run tauri build` alone is enough — it re-runs `beforeBuildCommand` (`bun run build`) and re-bundles, but skips the backend venv/exe rebuild steps above.

**GitHub Actions release workflow** (`.github/workflows/release.yml`): triggers on a `v*` tag push, runs the same `release-windows.ps1` pipeline on a Windows runner, then globs the `.msi`/`.exe` output and publishes a GitHub Release via `gh release create --generate-notes`. Never exercised by a real tag push — treat the first real release as this workflow's first real test.

Target machines need no system Python (bundled `run_backend.exe`) and no database server (SQLite is a single file managed entirely by the app).
