import logging
import os
import subprocess
import sys
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from uuid import uuid4

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.api import api_router
from app.config import settings
from app.database import SessionLocal, get_db, init_db, seed_if_missing
from app.services.sync_run import (
    RATE_LIMIT_SANITY_CEILING_SECONDS,
    create_sync_run,
    fail_sync_run,
    get_active_sync_run,
    get_latest_sync_run,
    get_launch_rate_limit_cooldown_seconds,
    get_sync_run,
    recover_stale_sync_state,
    serialize_sync_run,
)
from app.utils.time import normalize_utc

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)
SYNC_LOCK_TTL_SECONDS = 60 * 60
LOOPBACK_HOSTS = {"127.0.0.1", "::1", "localhost"}


def _all_static_resources_recently_synced(db: Session) -> bool:
    from app.models import SyncState

    static_resources = ("agencies", "pads", "rockets")
    rows = db.query(SyncState).filter(SyncState.resource.in_(static_resources)).all()
    by_resource = {row.resource: row for row in rows}

    now = datetime.now(timezone.utc)
    for resource in static_resources:
        row = by_resource.get(resource)
        if not row or not row.last_synced_at:
            return False

        last_sync = normalize_utc(row.last_synced_at)
        if not last_sync:
            return False

        age_seconds = (now - last_sync).total_seconds()
        if age_seconds >= settings.LL2_STATIC_RESOURCES_MIN_INTERVAL:
            return False

    return True


def _raise_admin_error(message: str, status_code: int = 500) -> None:
    raise HTTPException(status_code=status_code, detail=message)


def _require_admin_access(
    request: Request,
    x_admin_token: Optional[str] = Header(default=None, alias="X-Admin-Token"),
) -> None:
    client_host = request.client.host if request.client else None
    allowed_hosts = set(LOOPBACK_HOSTS)
    if os.environ.get("PYTEST_VERSION"):
        allowed_hosts.add("testclient")
    if client_host not in allowed_hosts:
        logger.warning("Blocked non-loopback admin request from host=%s", client_host)
        raise HTTPException(status_code=403, detail="Admin endpoint is local-only")

    expected_token = settings.ADMIN_TOKEN.strip()
    if expected_token and x_admin_token != expected_token:
        logger.warning("Rejected admin request with invalid token from host=%s", client_host)
        raise HTTPException(status_code=401, detail="Invalid admin token")


@asynccontextmanager
async def lifespan(app: FastAPI):
    seed_if_missing()
    init_db()

    startup_db = SessionLocal()
    try:
        recovered = recover_stale_sync_state(startup_db, SYNC_LOCK_TTL_SECONDS)
        if recovered["stale_runs"] or recovered["cleared_locks"]:
            logger.warning(
                "Recovered stale sync state on startup: %s stale runs, %s stale locks",
                recovered["stale_runs"],
                recovered["cleared_locks"],
            )
    finally:
        startup_db.close()

    logger.info("RocketGlobe Backend starting up...")
    logger.info("API Documentation available at: http://localhost:8000/docs")
    logger.info(
        "LL2 config: page_limit=%s min_interval=%ss retries=%s max_wait=%ss max_duration=%ss launches_min_interval=%ss launches_retries=%s launches_max_wait=%ss launches_max_duration=%ss static_min_interval=%ss lookback_hours=%s partial_on_rate_limit=%s",
        settings.LL2_SYNC_PAGE_LIMIT,
        settings.LL2_MIN_REQUEST_INTERVAL,
        settings.LL2_MAX_RETRIES,
        settings.LL2_MAX_WAIT_SECONDS,
        settings.LL2_MAX_REQUEST_DURATION,
        settings.LL2_LAUNCHES_MIN_REQUEST_INTERVAL,
        settings.LL2_LAUNCHES_MAX_RETRIES,
        settings.LL2_LAUNCHES_MAX_WAIT_SECONDS,
        settings.LL2_LAUNCHES_MAX_REQUEST_DURATION,
        settings.LL2_STATIC_RESOURCES_MIN_INTERVAL,
        settings.LL2_EXISTING_DATA_LOOKBACK_HOURS,
        settings.LL2_ALLOW_PARTIAL_SYNC_ON_RATE_LIMIT,
    )
    yield
    logger.info("RocketGlobe Backend shutting down...")


app = FastAPI(
    title="RocketGlobe API",
    description="Backend API for global rocket launch visualization and tracking",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:1420",
        "http://127.0.0.1:1420",
        # Packaged builds' webview origin. Tauri v1 (and non-Windows v2) used
        # "tauri://localhost" - Windows Tauri v2 actually sends
        # "http://tauri.localhost", a different string, which was never in
        # this list. Requests still reached the backend and got a real 200,
        # but the browser withheld the response from JS with no
        # Access-Control-Allow-Origin header to permit it - this is why
        # `tauri dev` (Vite's own origin, already allowlisted below) always
        # worked while every packaged build failed with "Failed to fetch".
        "http://tauri.localhost",
        "tauri://localhost",
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/", tags=["root"])
async def root():
    return {
        "name": "RocketGlobe API",
        "status": "running",
        "version": "1.0.0",
        "documentation": "/docs",
        "endpoints": {
            "launches": "/api/launches",
            "pads": "/api/pads",
            "agencies": "/api/agencies",
            "rockets": "/api/rockets",
            "sync": "/admin/sync",
            "health": "/health",
        },
    }


@app.get("/health", tags=["health"])
async def health(db: Session = Depends(get_db)):
    try:
        from app.models import Agency, Launch, Pad, Rocket

        return {
            "status": "healthy",
            "database": "connected",
            "data": {
                "launches": db.query(Launch).count(),
                "pads": db.query(Pad).count(),
                "agencies": db.query(Agency).count(),
                "rockets": db.query(Rocket).count(),
            },
        }
    except Exception as e:
        logger.error("Health check failed: %s", e)
        raise HTTPException(status_code=503, detail="Database connection failed")


def _spawn_sync_subprocess(run_id: str) -> None:
    """Run LL2 sync in a separate process so it cannot destabilize uvicorn's event loop (esp. Windows)."""
    # cwd, not __file__: in a frozen build __file__ resolves inside PyInstaller's
    # onefile temp extraction dir, not the real backend directory. Rust already
    # guarantees this process's own cwd is the real backend dir (cmd.current_dir
    # in lib.rs, for both dev and release), so trust that instead - same fix
    # already applied to the seed DB path for the same reason.
    backend_dir = Path.cwd()
    if getattr(sys, "frozen", False):
        # In a packaged build, sys.executable is run_backend.exe itself, not a
        # real python.exe - PyInstaller onefile builds don't support `-m
        # module`. Re-invoke the same frozen exe with a flag it dispatches on
        # instead (see run_backend.py) rather than shipping a second exe.
        cmd = [sys.executable, "--sync-once", run_id]
    else:
        cmd = [sys.executable, "-m", "app.workers.run_sync_once", run_id]
    popen_kwargs: dict = {
        "args": cmd,
        "cwd": str(backend_dir),
        "env": os.environ.copy(),
        "stdin": subprocess.DEVNULL,
        "stdout": subprocess.DEVNULL,
    }
    if settings.SYNC_SUBPROCESS_INHERIT_STDERR:
        # stderr inherits from uvicorn → sync_worker logs show in the same terminal
        popen_kwargs["stderr"] = None
    else:
        popen_kwargs["stderr"] = subprocess.DEVNULL
    if sys.platform == "win32":
        # New process group isolates Ctrl+C; CREATE_NO_WINDOW avoids a blank console flashing
        # (DETACHED_PROCESS would allocate a visible console for python.exe).
        creationflags = subprocess.CREATE_NEW_PROCESS_GROUP
        if hasattr(subprocess, "CREATE_NO_WINDOW"):
            creationflags |= subprocess.CREATE_NO_WINDOW
        popen_kwargs["creationflags"] = creationflags
    else:
        popen_kwargs["start_new_session"] = True
        popen_kwargs["close_fds"] = True

    try:
        subprocess.Popen(**popen_kwargs)
    except OSError as exc:
        logger.error("Failed to spawn sync subprocess (run_id=%s): %s", run_id, exc)
        db = SessionLocal()
        try:
            fail_sync_run(db, run_id, f"spawn_failed:{type(exc).__name__}:{exc}")
        finally:
            db.close()
        raise HTTPException(status_code=500, detail="Failed to start sync worker") from exc

    logger.info("Background sync subprocess spawned (run_id=%s)", run_id)


@app.post("/admin/sync", tags=["admin"], status_code=202)
async def trigger_sync(_: None = Depends(_require_admin_access)):
    """
    Manually trigger full data sync from Launch Library 2 API.

    This starts the sync job in the background and returns 202 Accepted.
    The actual sync uses the DB-level lock to prevent concurrent runs.
    """
    from app.models import SyncState

    db_check = SessionLocal()
    try:
        recover_stale_sync_state(db_check, SYNC_LOCK_TTL_SECONDS)

        active_run = get_active_sync_run(db_check)
        if active_run:
            return JSONResponse(
                status_code=409,
                content={
                    "status": "conflict",
                    "message": "Sync already running",
                    "run_id": active_run.run_id,
                },
            )

        lock_row = db_check.query(SyncState).filter(SyncState.resource == "sync_all").first()
        if lock_row and lock_row.is_locked:
            latest_run = get_latest_sync_run(db_check)
            return JSONResponse(
                status_code=409,
                content={
                    "status": "conflict",
                    "message": "Sync already running",
                    "run_id": latest_run.run_id if latest_run else None,
                },
            )

        launch_cooldown = get_launch_rate_limit_cooldown_seconds(db_check)
        if launch_cooldown and _all_static_resources_recently_synced(db_check):
            return JSONResponse(
                status_code=429,
                content={
                    "status": "rate_limited",
                    "message": (f"LL2 launch sync is rate-limited. Try again in about {launch_cooldown} seconds."),
                    "resource": "launches",
                    "retry_after_seconds": launch_cooldown,
                },
            )

        run_id = uuid4().hex
        run = create_sync_run(db_check, run_id)
        if not run:
            raise HTTPException(status_code=500, detail="Failed to create sync run")
    finally:
        db_check.close()

    _spawn_sync_subprocess(run_id)
    return JSONResponse(
        status_code=202,
        content={
            "status": "started",
            "message": "Background sync scheduled",
            "run_id": run_id,
        },
    )


@app.get("/admin/sync-status", tags=["admin"])
async def get_sync_status(
    run_id: Optional[str] = Query(default=None, description="Optional sync run id"),
    lightweight: bool = Query(
        default=False,
        description="If true, skips expensive data count queries for fast polling",
    ),
    _: None = Depends(_require_admin_access),
    db: Session = Depends(get_db),
):
    from app.models import Agency, Launch, Pad, Rocket, SyncState

    try:
        recover_stale_sync_state(db, SYNC_LOCK_TTL_SECONDS)

        sync_state = db.query(SyncState).filter(SyncState.resource == "sync_all").first()

        latest_launch = None
        latest_agency = None
        data_counts = None
        last_updated = None
        if not lightweight:
            latest_launch = db.query(Launch).order_by(Launch.updated_at.desc()).first()
            latest_agency = db.query(Agency).order_by(Agency.updated_at.desc()).first()
            data_counts = {
                "launches": db.query(Launch).count(),
                "pads": db.query(Pad).count(),
                "agencies": db.query(Agency).count(),
                "rockets": db.query(Rocket).count(),
            }
            last_updated = {
                "launches": latest_launch.updated_at.isoformat() if latest_launch else None,
                "agencies": latest_agency.updated_at.isoformat() if latest_agency else None,
            }

        run = get_sync_run(db, run_id) if run_id else None
        if run is None:
            run = get_active_sync_run(db) or get_latest_sync_run(db)

        is_sync_running = bool(run and run.is_active and run.status in {"queued", "running"})

        rate_limited_resources = {}
        retry_after_seconds = None
        if run and isinstance(run.stats, dict):
            raw = run.stats.get("_rate_limited")
            if isinstance(raw, dict):
                for resource_name, value in raw.items():
                    try:
                        seconds = int(float(value))
                    except (TypeError, ValueError):
                        continue
                    # Sanity ceiling only, not the LL2 client's fail-fast cap:
                    # the real reported wait can legitimately exceed it and
                    # must reach callers uncapped (see sync_run.py).
                    seconds = min(seconds, RATE_LIMIT_SANITY_CEILING_SECONDS)
                    if seconds > 0:
                        rate_limited_resources[str(resource_name)] = seconds
            if rate_limited_resources:
                retry_after_seconds = max(rate_limited_resources.values())

        return {
            "status": "success",
            "is_sync_running": is_sync_running,
            "run": serialize_sync_run(run),
            "sync_lock": {
                "is_locked": sync_state.is_locked if sync_state else False,
                "lock_owner": sync_state.lock_owner if sync_state else None,
                "locked_at": (sync_state.locked_at.isoformat() if (sync_state and sync_state.locked_at) else None),
            },
            "data_counts": data_counts,
            "last_updated": last_updated,
            "rate_limited_resources": rate_limited_resources,
            "retry_after_seconds": retry_after_seconds,
        }
    except Exception as e:
        logger.error("Failed to get sync status: %s", e)
        _raise_admin_error("Failed to fetch sync status")


@app.get("/admin/api-throttle", tags=["admin"])
async def check_api_throttle(_: None = Depends(_require_admin_access)):
    from app.services.ll2_client import LL2Client

    client = LL2Client()
    try:
        response = await client.client.get(f"{client.base_url}/api-throttle/")
        return {"status": "success", "throttle_info": response.json()}
    except Exception as e:
        logger.error("Failed to check throttle: %s", e)
        _raise_admin_error("Failed to fetch API throttle info")
    finally:
        await client.close()


@app.get("/admin/test-api", tags=["admin"])
async def test_api(_: None = Depends(_require_admin_access)):
    from app.services.ll2_client import LL2Client

    client = LL2Client()
    try:
        agencies = await client.get_agencies(limit=1)
        pads = await client.get_pads(limit=1)
        rockets = await client.get_rockets(limit=1)
        launches = await client.get_launches(limit=1)
        return {
            "status": "success",
            "api_base_url": client.base_url,
            "samples": {
                "agency": agencies.get("results", [])[0] if agencies.get("results") else None,
                "pad": pads.get("results", [])[0] if pads.get("results") else None,
                "rocket": rockets.get("results", [])[0] if rockets.get("results") else None,
                "launch": launches.get("results", [])[0] if launches.get("results") else None,
            },
        }
    except Exception as e:
        logger.error("API test failed: %s", e)
        _raise_admin_error("Failed to test upstream API")
    finally:
        await client.close()


@app.get("/admin/check-api", tags=["admin"])
async def check_api(_: None = Depends(_require_admin_access)):
    from app.services.ll2_client import LL2Client

    client = LL2Client()
    try:
        data = await client.get_launches(limit=1, offset=0)
        total_count = data.get("count", 0)
        return {
            "status": "success",
            "total_launches_available": total_count,
            "api_base_url": client.base_url,
            "message": f"LL2 API reports {total_count:,} total launches available",
        }
    except Exception as e:
        logger.error("API check failed: %s", e)
        _raise_admin_error("Failed to check upstream API")
    finally:
        await client.close()


@app.delete("/admin/clear-data", tags=["admin"])
async def clear_all_data(
    confirm: bool = False,
    _: None = Depends(_require_admin_access),
    db: Session = Depends(get_db),
):
    if not confirm:
        raise HTTPException(status_code=400, detail="Must provide confirm=true to clear data")

    from app.models import Agency, Launch, Pad, Rocket

    try:
        logger.warning("Clearing all data from database...")
        launch_count = db.query(Launch).delete()
        db.commit()

        rocket_count = db.query(Rocket).delete()
        pad_count = db.query(Pad).delete()
        agency_count = db.query(Agency).delete()
        db.commit()

        logger.info(
            "Cleared: %s launches, %s rockets, %s pads, %s agencies",
            launch_count,
            rocket_count,
            pad_count,
            agency_count,
        )
        return {
            "status": "success",
            "message": "All data cleared",
            "deleted": {
                "launches": launch_count,
                "rockets": rocket_count,
                "pads": pad_count,
                "agencies": agency_count,
            },
        }
    except Exception as e:
        db.rollback()
        logger.error("Failed to clear data: %s", e)
        _raise_admin_error("Failed to clear data")


app.include_router(api_router, prefix="/api")


@app.exception_handler(404)
async def not_found_handler(request, exc):
    return JSONResponse(
        status_code=404,
        content={
            "status": "error",
            "message": "Endpoint not found",
            "path": str(request.url),
            "available_endpoints": "/docs",
        },
    )


@app.exception_handler(500)
async def server_error_handler(request, exc):
    logger.error("Internal server error: %s", exc)
    return JSONResponse(
        status_code=500,
        content={"status": "error", "message": "Internal server error"},
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.API_HOST,
        port=settings.API_PORT,
        reload=True,
        log_level="info",
    )
