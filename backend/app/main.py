from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from sqlalchemy.orm import Session
import logging

from app.database import get_db, SessionLocal
from app.api import api_router

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan events for startup and shutdown."""
    logger.info("🚀 RocketGlobe Backend starting up...")
    logger.info("📡 API Documentation available at: http://localhost:8000/docs")
    yield
    logger.info("👋 RocketGlobe Backend shutting down...")


app = FastAPI(
    title="RocketGlobe API",
    description="Backend API for global rocket launch visualization and tracking",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc"
)


# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:1420",    # Tauri dev server
        "tauri://localhost",         # Tauri production
        "http://localhost:5173",     # Vite dev server
        "http://localhost:3000",     # Alternative web dev server
        "http://127.0.0.1:1420",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================================
# Root & Health Endpoints
# ============================================================================

@app.get("/", tags=["root"])
async def root():
    """Root endpoint - API information."""
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
            "health": "/health"
        }
    }


@app.get("/health", tags=["health"])
async def health(db: Session = Depends(get_db)):
    """Health check endpoint with database status."""
    try:
        # Test database connection
        from app.models import Launch, Pad, Agency, Rocket
        
        launch_count = db.query(Launch).count()
        pad_count = db.query(Pad).count()
        agency_count = db.query(Agency).count()
        rocket_count = db.query(Rocket).count()
        
        return {
            "status": "healthy",
            "database": "connected",
            "data": {
                "launches": launch_count,
                "pads": pad_count,
                "agencies": agency_count,
                "rockets": rocket_count
            }
        }
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        raise HTTPException(status_code=503, detail="Database connection failed")


# ============================================================================
# Admin Endpoints
# ============================================================================

@app.post("/admin/sync", tags=["admin"])
async def trigger_sync(db: Session = Depends(get_db)):
    """
    Manually trigger full data sync from Launch Library 2 API.
    
    This will sync:
    - All agencies (space organizations)
    - All launch pads (with GPS coordinates)
    - All rocket configurations
    - All launches (historical and upcoming)
    
    Note: May take 10-20 minutes for full sync. Subject to API rate limits.
    """
    from app.workers.sync_worker import sync_all
    
    try:
        logger.info("🔄 Starting manual sync...")
        result = await sync_all(db)
        logger.info(f"✅ Sync completed: {result}")
        
        return {
            "status": "success",
            "message": "Data sync completed successfully",
            "counts": result
        }
    except Exception as e:
        logger.error(f"❌ Sync failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Sync failed: {str(e)}"
        )


@app.get("/admin/sync-status", tags=["admin"])
async def get_sync_status(db: Session = Depends(get_db)):
    """Get current sync status and data counts."""
    from app.models import Launch, Pad, Agency, Rocket
    from datetime import datetime
    
    try:
        # Get latest update timestamps
        latest_launch = db.query(Launch).order_by(Launch.updated_at.desc()).first()
        latest_agency = db.query(Agency).order_by(Agency.updated_at.desc()).first()
        
        return {
            "status": "success",
            "data_counts": {
                "launches": db.query(Launch).count(),
                "pads": db.query(Pad).count(),
                "agencies": db.query(Agency).count(),
                "rockets": db.query(Rocket).count()
            },
            "last_updated": {
                "launches": latest_launch.updated_at.isoformat() if latest_launch else None,
                "agencies": latest_agency.updated_at.isoformat() if latest_agency else None
            }
        }
    except Exception as e:
        logger.error(f"Failed to get sync status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/admin/api-throttle", tags=["admin"])
async def check_api_throttle():
    """Check current API rate limit status."""
    from app.services.ll2_client import LL2Client
    
    client = LL2Client()
    try:
        # Call the throttle endpoint
        response = await client.client.get(f"{client.base_url}/api-throttle/")
        data = response.json()
        
        return {
            "status": "success",
            "throttle_info": data
        }
    except Exception as e:
        logger.error(f"Failed to check throttle: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        await client.close()


@app.get("/admin/test-api", tags=["admin"])
async def test_api():
    """
    Test LL2 API connection and response structure.
    Returns sample data from each endpoint.
    """
    from app.services.ll2_client import LL2Client
    
    client = LL2Client()
    try:
        # Get 1 sample from each endpoint
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
            }
        }
    except Exception as e:
        logger.error(f"API test failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        await client.close()


@app.get("/admin/check-api", tags=["admin"])
async def check_api():
    """Check total number of launches available from LL2 API."""
    from app.services.ll2_client import LL2Client
    
    client = LL2Client()
    try:
        # Check total count
        data = await client.get_launches(limit=1, offset=0)
        total_count = data.get("count", 0)
        
        return {
            "status": "success",
            "total_launches_available": total_count,
            "api_base_url": client.base_url,
            "message": f"LL2 API reports {total_count:,} total launches available"
        }
    except Exception as e:
        logger.error(f"API check failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        await client.close()


@app.delete("/admin/clear-data", tags=["admin"])
async def clear_all_data(
    confirm: bool = False,
    db: Session = Depends(get_db)
):
    """
    Clear all data from database. Use with caution!
    
    Requires confirm=true query parameter.
    """
    if not confirm:
        raise HTTPException(
            status_code=400,
            detail="Must provide confirm=true to clear data"
        )
    
    from app.models import Launch, Pad, Agency, Rocket
    
    try:
        logger.warning("⚠️  Clearing all data from database...")
        
        # Delete in order (respecting foreign keys)
        launch_count = db.query(Launch).delete()
        db.commit()
        
        rocket_count = db.query(Rocket).delete()
        pad_count = db.query(Pad).delete()
        agency_count = db.query(Agency).delete()
        db.commit()
        
        logger.info(f"✅ Cleared: {launch_count} launches, {rocket_count} rockets, {pad_count} pads, {agency_count} agencies")
        
        return {
            "status": "success",
            "message": "All data cleared",
            "deleted": {
                "launches": launch_count,
                "rockets": rocket_count,
                "pads": pad_count,
                "agencies": agency_count
            }
        }
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to clear data: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# API Routes (launches, pads, agencies, rockets)
# ============================================================================

app.include_router(api_router, prefix="/api")


# ============================================================================
# Error Handlers
# ============================================================================

@app.exception_handler(404)
async def not_found_handler(request, exc):
    """Custom 404 handler."""
    return {
        "status": "error",
        "message": "Endpoint not found",
        "path": str(request.url),
        "available_endpoints": "/docs"
    }


@app.exception_handler(500)
async def server_error_handler(request, exc):
    """Custom 500 handler."""
    logger.error(f"Internal server error: {exc}")
    return {
        "status": "error",
        "message": "Internal server error",
        "detail": str(exc)
    }


# ============================================================================
# Startup Message
# ============================================================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
