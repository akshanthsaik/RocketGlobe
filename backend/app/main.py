from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from sqlalchemy.orm import Session
import logging

from app.database import get_db

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan events for startup and shutdown."""
    logger.info("🚀 Backend starting up...")
    yield
    logger.info("👋 Backend shutting down...")


app = FastAPI(
    title="Rocket Globe API",
    description="Backend for rocket launch visualization",
    version="1.0.0",
    lifespan=lifespan
)


# CORS for Tauri app
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:1420",  # Tauri dev server
        "tauri://localhost",       # Tauri production
        "http://localhost:3000",   # If you add a web frontend later
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    """Root endpoint - API info."""
    return {
        "message": "Rocket Globe API",
        "status": "running",
        "version": "1.0.0",
        "docs": "/docs"
    }


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "healthy"}


@app.post("/admin/sync")
async def trigger_sync(db: Session = Depends(get_db)):
    """Manually trigger data sync from Launch Library 2."""
    # Import inside function to avoid circular import
    from app.workers.sync_worker import sync_all
    
    try:
        logger.info("Starting manual sync...")
        result = await sync_all(db)
        logger.info(f"Sync completed: {result}")
        return {
            "status": "success",
            "message": "Sync completed",
            "counts": result
        }
    except Exception as e:
        logger.error(f"Sync failed: {e}")
        return {
            "status": "error",
            "message": str(e)
        }

@app.get("/admin/test-api")
async def test_api():
    """Test LL2 API response structure."""
    from app.services.ll2_client import LL2Client
    
    client = LL2Client()
    try:
        # Get 1 agency to see structure
        agencies = await client.get_agencies(limit=1)
        
        # Get 1 pad to see structure
        pads = await client.get_pads(limit=1)
        
        # Get 1 rocket to see structure
        rockets = await client.get_rockets(limit=1)
        
        # Get 1 launch to see structure
        launches = await client.get_launches(limit=1)
        
        return {
            "agency_sample": agencies.get("results", [])[0] if agencies.get("results") else None,
            "pad_sample": pads.get("results", [])[0] if pads.get("results") else None,
            "rocket_sample": rockets.get("results", [])[0] if rockets.get("results") else None,
            "launch_sample": launches.get("results", [])[0] if launches.get("results") else None,
        }
    finally:
        await client.close()


# TODO: Add API routers
# from app.api import launches, pads, agencies, rockets
# app.include_router(launches.router, prefix="/api/launches", tags=["launches"])
# app.include_router(pads.router, prefix="/api/pads", tags=["pads"])
# app.include_router(agencies.router, prefix="/api/agencies", tags=["agencies"])
# app.include_router(rockets.router, prefix="/api/rockets", tags=["rockets"])
