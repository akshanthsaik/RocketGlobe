from contextlib import asynccontextmanager
import asyncio
from datetime import datetime, timezone
import logging
import threading
from typing import Optional
from uuid import uuid4

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.api import api_router
from app.config import settings
from app.database import SessionLocal, get_db, init_db
from app.services.sync_run import (
    create_sync_run,
    fail_sync_run,
    get_active_sync_run,
    get_latest_sync_run,
    get_sync_run,
    recover_stale_sync_state,
    serialize_sync_run,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)
SYNC_LOCK_TTL_SECONDS = 60 * 60


def _normalize_utc(value: Optional[datetime]) -> Optional[datetime]:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def _all_static_resources_recently_synced(db: Session) -> bool:
    from app.models import SyncState

    now = datetime.now(timezone.utc)
    for resource in ("agencies", "pads", "rockets"):
        row = db.query(SyncState).filter(SyncState.resource == resource).first()
        if not row or not row.last_synced_at:
            return False

        last_sync = _normalize_utc(row.last_synced_at)
        if not last_sync:
            return False

        age_seconds = (now - last_sync).total_seconds()
        if age_seconds >= settings.LL2_STATIC_RESOURCES_MIN_INTERVAL:
            return False

    return True


def _launch_rate_limit_cooldown_seconds(db: Session) -> Optional[int]:
    from app.models import SyncRun

    now = datetime.now(timezone.utc)
    recent_runs = db.query(SyncRun).order_by(SyncRun.started_at.desc()).limit(10).all()

    for run in recent_runs:
        stats = run.stats if isinstance(run.stats, dict) else {}
        rate_limited = stats.get("_rate_limited")
        if not isinstance(rate_limited, dict):
            continue

        raw_wait = rate_limited.get("launches")
        try:
            wait_seconds = int(float(raw_wait))
        except (TypeError, ValueError):
            continue

        if wait_seconds <= 0:
            continue

        wait_seconds = min(wait_seconds, settings.LL2_LAUNCHES_MAX_WAIT_SECONDS)
        baseline = _normalize_utc(run.finished_at or run.updated_at or run.started_at)
        if not baseline:
            continue

        elapsed = (now - baseline).total_seconds()
        remaining = int(round(wait_seconds - elapsed))
        if remaining > 0:
            return remaining

    return None


@asynccontextmanager
async def lifespan(app: FastAPI):
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
        "tauri://localhost",
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:1420",
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


@app.post("/admin/sync", tags=["admin"], status_code=202)
async def trigger_sync():
    """
    Manually trigger full data sync from Launch Library 2 API.

    This starts the sync job in the background and returns 202 Accepted.
    The actual sync uses the DB-level lock to prevent concurrent runs.
    """
    from app.models import SyncState
    from app.workers.sync_worker import sync_all

    def _run_sync(run_id: str):
        db = SessionLocal()
        try:
            logger.info("Background sync started (run_id=%s)", run_id)
            result = asyncio.run(sync_all(db, run_id=run_id))
            logger.info("Background sync completed (run_id=%s): %s", run_id, result)
        except Exception as e:
            logger.error("Background sync failed (run_id=%s): %s", run_id, e)
            fail_sync_run(db, run_id, f"{type(e).__name__}: {e}")
        finally:
            db.close()

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

        lock_row = (
            db_check.query(SyncState)
            .filter(SyncState.resource == "sync_all")
            .first()
        )
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

        launch_cooldown = _launch_rate_limit_cooldown_seconds(db_check)
        if launch_cooldown and _all_static_resources_recently_synced(db_check):
            return JSONResponse(
                status_code=429,
                content={
                    "status": "rate_limited",
                    "message": (
                        "LL2 launch sync is rate-limited. "
                        f"Try again in about {launch_cooldown} seconds."
                    ),
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

    # Run sync in a daemon worker thread so backend shutdown is not blocked by a long sync.
    thread = threading.Thread(
        target=_run_sync,
        args=(run_id,),
        name=f"sync-worker-{run_id[:8]}",
        daemon=True,
    )
    thread.start()
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

        is_sync_running = bool(
            run and run.is_active and run.status in {"queued", "running"}
        )

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
                    if resource_name == "launches":
                        seconds = min(seconds, settings.LL2_LAUNCHES_MAX_WAIT_SECONDS)
                    else:
                        seconds = min(seconds, settings.LL2_MAX_WAIT_SECONDS)
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
                "locked_at": (
                    sync_state.locked_at.isoformat()
                    if (sync_state and sync_state.locked_at)
                    else None
                ),
            },
            "data_counts": data_counts,
            "last_updated": last_updated,
            "rate_limited_resources": rate_limited_resources,
            "retry_after_seconds": retry_after_seconds,
        }
    except Exception as e:
        logger.error("Failed to get sync status: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/admin/api-throttle", tags=["admin"])
async def check_api_throttle():
    from app.services.ll2_client import LL2Client

    client = LL2Client()
    try:
        response = await client.client.get(f"{client.base_url}/api-throttle/")
        return {"status": "success", "throttle_info": response.json()}
    except Exception as e:
        logger.error("Failed to check throttle: %s", e)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        await client.close()


@app.get("/admin/test-api", tags=["admin"])
async def test_api():
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
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        await client.close()


@app.get("/admin/check-api", tags=["admin"])
async def check_api():
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
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        await client.close()


@app.delete("/admin/clear-data", tags=["admin"])
async def clear_all_data(confirm: bool = False, db: Session = Depends(get_db)):
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
        raise HTTPException(status_code=500, detail=str(e))


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
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info",
    )
