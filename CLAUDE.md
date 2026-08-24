# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

RocketGlobe is a Tauri desktop app that renders global launch activity on a Cesium globe. It has three parts: a React/TypeScript frontend, a Rust Tauri shell that spawns/manages the backend process, and a Python FastAPI backend that syncs Launch Library 2 (LL2) data into a local SQLite file and serves it read-only.

Read `README.md` first — it documents the architecture (with diagrams), full data model, API surface, sync/rate-limit behavior, env vars, and packaging/release process in detail. Don't duplicate that content here; this file only covers what the README doesn't.

## Commands

**Frontend** (run from repo root; Bun is the package manager)

```bash
bun install
bun run dev              # vite dev server on :1420
bun run check            # tsc --noEmit (type check, part of CI)
bun run lint             # eslint src
bun run test             # vitest run
bun run test src/store   # single file/dir (vitest passes through path filters)
bun run format           # prettier --write
bun run format:check     # prettier --check (part of CI)
bun run tauri dev        # full desktop app; spawns backend/venv uvicorn automatically
```

Frontend tests are Vitest + jsdom, colocated as `src/**/*.test.ts` (currently `src/store/launchStore.test.ts` and the shared hooks in `src/hooks/`). CI runs only `check` and `format:check` for the frontend — `lint` and `test` are local-only, so run them yourself before considering frontend work done.

**Backend** (run from `backend/`, inside `backend/venv`)

```bash
python -m venv venv
venv\Scripts\pip install -r requirements.txt
venv\Scripts\ruff check .          # lint (part of CI)
venv\Scripts\ruff format --check . # format check (part of CI)
venv\Scripts\pytest tests/         # run all tests
venv\Scripts\pytest tests/test_sync_agencies.py::test_incremental_agency_sync  # single test
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000   # run standalone (prefer without --reload for sync debugging)
```

Backend tests use SQLite in-memory DBs and mocked LL2 clients (see `backend/tests/`) — no live DB or network needed to run them. CI additionally runs `alembic upgrade head` before pytest, so a model change without a matching migration fails CI even when tests pass locally.

`backend/tools/` holds standalone scripts that hit a real DB/LL2 and are not part of the test suite. Note `build_seed_snapshot.py` is deliberately unlike the live sync: it targets production LL2 regardless of `backend/.env`, sleeps through rate-limit windows instead of failing fast, and checkpoints to disk so it can resume — don't "fix" it to match the live sync's fail-fast behavior.

**Rust/Tauri**

No separate Rust test suite; `bun run tauri dev` / `bun run tauri build` compiles `src-tauri`.

**Pre-commit**

Husky + lint-staged run on every commit: `eslint --fix` + prettier on staged `src/**/*.{ts,tsx}`, prettier on staged css/json, and `scripts/ruff-staged.mjs` (ruff check --fix + format) on staged `backend/**/*.py`. Commits can therefore rewrite files you just wrote — re-read a file after committing before editing it further.

## Architecture notes beyond the README

- **Process ownership**: `src-tauri/src/lib.rs` decides at compile time (`debug_assertions`) how to start the backend. Debug mode shells out to `backend/venv`'s Python + `uvicorn`, and skips spawning entirely if something is already listening on `127.0.0.1:8000` (so you can run the backend manually while iterating). Release mode starts a bundled `run_backend.exe` with `DATABASE_URL` pointed at a SQLite file under the app's local data dir (`resolve_release_database_url` in `lib.rs`), so each user's synced data is a single file that persists across app updates. The backend child process is killed on window close.
- **Sync isolation**: `POST /admin/sync` (`backend/app/main.py`) does not run the sync inline — it spawns a separate Python subprocess (`app.workers.run_sync_once`) so a long/misbehaving LL2 sync can't destabilize uvicorn's event loop, especially on Windows. Sync progress/results are tracked in the `sync_runs` table and polled via `GET /admin/sync-status` (poll by `run_id`), not returned synchronously.
- **Two-level locking**: `sync_state` holds a DB-level lock (`resource="sync_all"`) preventing concurrent full syncs; `sync_runs` tracks per-run lifecycle/progress/stats. Both are recovered from staleness on startup and before every admin sync action (see `recover_stale_sync_state`). When touching sync code, keep both in sync rather than adding new state elsewhere.
- **Admin endpoints are loopback-only** (`_require_admin_access` in `main.py`), gated further by an optional `ADMIN_TOKEN`. Tests bypass the loopback check via `PYTEST_VERSION` env var, which pytest sets automatically. On the frontend side, admin calls must go through `adminFetch` in `src/lib/api.ts` — it targets `API_ORIGIN` (admin routes are not under the `/api` prefix), attaches the `X-Admin-Token` header from `VITE_ADMIN_TOKEN`, and intentionally returns the raw `Response` instead of throwing, because callers branch on 409/429 as meaningful outcomes.
- **Frontend state**: all cross-cutting UI/data state (fetched entities, globe mode, sidebar navigation stack, timeline playback, filters) lives in one Zustand store, `src/store/launchStore.ts`. The sidebar is a view stack (`sidebarViewStack`), not per-page routing — `pushSidebarView`/`popSidebarView` drive navigation between list/detail views per entity type (launch/pad/rocket/agency). `fetchAllData` dedupes concurrent calls via a module-level in-flight promise and retries transient network errors (not HTTP 4xx) up to 8 times.
- **Filtering has exactly one implementation**: `getFilteredLaunches`/`getActiveLaunches` in the store. `LaunchTab.tsx` and `Globe.tsx` both build the same `FilterableLaunchState` object and call it, which is what keeps the sidebar list and the globe markers from disagreeing. The state fields are deliberately **required, not optional** — adding a filter should break every construction site at compile time so none is silently skipped.
- **Design tokens are the only place raw values live** (`src/styles/theme.css`): colours, type scale, spacing, rules, motion. Components reference `--color-*`, `--type-*`, `--rule-*` and never literals. The system is committed to a single dark theme by choice (a light ground leaves the globe's pad markers nothing to sit against), so there are no `prefers-color-scheme` variants to keep in sync. Radii are all `0` and 2px rules are the structural device — if something needs a rounded corner or a drop shadow, that is a sign it belongs in a different layer, not that the token is wrong.
- **Typography is one family**, Archivo, self-hosted as three variable woff2 subsets in `public/fonts` and declared in `theme.css`. There is no font package dependency; weight and letter-spacing carry the whole hierarchy.
- **LL2 client rate limiting**: `backend/app/services/ll2_client.py` enforces separate request-spacing/retry/backoff budgets for launches vs. static resources (agencies/pads/rockets), configurable via the `LL2_*` env vars documented in the README. When debugging sync issues, check the `LL2 config: ...` line logged at backend startup for effective values, not just `.env` — env vars override code defaults and stale `.env` overrides are a common source of confusion (see README's Sync Troubleshooting section).
- **The globe loads no imagery and needs no Cesium Ion token.** Geography is country outlines drawn from `public/data/countries.geojson` (Natural Earth 1:110m, vendored) over a flat ground, which matches the flat visual system and lets the app render with no network at all. Two consequences worth knowing before changing it: `clampToGround` must stay `false` because draped ground primitives cannot carry an outline in Cesium, and the camera is capped (`MIN_ZOOM_METRES`) because below roughly regional scale there is nothing to look at. Cesium's own toolbar is disabled — its controls anchor top-right where `GlobeControls` lives, and matching its chrome needed `!important` overrides.
- **Camera and marker styling are separable from data.** `padTiers.ts` is the single activity ramp shared by the Cesium markers and the `Legend`, so the swatches cannot drift from the globe; they were previously two hand-kept lists.
