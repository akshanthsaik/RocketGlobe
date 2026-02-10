from contextlib import asynccontextmanager
import asyncio
import logging

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.api import api_router
from app.database import SessionLocal, get_db

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("RocketGlobe Backend starting up...")
    logger.info("API Documentation available at: http://localhost:8000/docs")
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

    def _run_sync():
        db = SessionLocal()
        try:
            logger.info("Background sync started")
            result = asyncio.run(sync_all(db))
            logger.info("Background sync completed: %s", result)
        except Exception as e:
            logger.error("Background sync failed: %s", e)
        finally:
            db.close()

    db_check = SessionLocal()
    try:
        row = db_check.query(SyncState).filter(SyncState.resource == "sync_all").first()
        if row and row.is_locked:
            return JSONResponse(
                status_code=409,
                content={"status": "conflict", "message": "Sync already running"},
            )
    finally:
        db_check.close()

    # Run sync in worker thread so blocking ORM operations do not block API requests.
    asyncio.create_task(asyncio.to_thread(_run_sync))
    return JSONResponse(
        status_code=202,
        content={"status": "started", "message": "Background sync scheduled"},
    )


@app.get("/admin/sync-status", tags=["admin"])
async def get_sync_status(db: Session = Depends(get_db)):
    from app.models import Agency, Launch, Pad, Rocket, SyncState

    try:
        latest_launch = db.query(Launch).order_by(Launch.updated_at.desc()).first()
        latest_agency = db.query(Agency).order_by(Agency.updated_at.desc()).first()
        sync_state = db.query(SyncState).filter(SyncState.resource == "sync_all").first()
        is_sync_running = bool(sync_state and sync_state.is_locked)

        return {
            "status": "success",
            "is_sync_running": is_sync_running,
            "sync_lock": {
                "is_locked": sync_state.is_locked if sync_state else False,
                "lock_owner": sync_state.lock_owner if sync_state else None,
                "locked_at": (
                    sync_state.locked_at.isoformat()
                    if (sync_state and sync_state.locked_at)
                    else None
                ),
            },
            "data_counts": {
                "launches": db.query(Launch).count(),
                "pads": db.query(Pad).count(),
                "agencies": db.query(Agency).count(),
                "rockets": db.query(Rocket).count(),
            },
            "last_updated": {
                "launches": latest_launch.updated_at.isoformat() if latest_launch else None,
                "agencies": latest_agency.updated_at.isoformat() if latest_agency else None,
            },
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
