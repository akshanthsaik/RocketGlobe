from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

# Import routers (we'll create these next)
# from app.api import launches, pads, agencies

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Initialize database, start workers
    print("🚀 Backend starting up...")
    # TODO: Start LL2 sync worker
    yield
    # Shutdown: Cleanup
    print("👋 Backend shutting down...")

app = FastAPI(
    title="Rocket Globe API",
    description="Backend for rocket launch visualization",
    version="1.0.0",
    lifespan=lifespan
)

# CORS for Tauri app
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:1420", "tauri://localhost"],  # Tauri dev + prod
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {
        "message": "Rocket Globe API",
        "status": "running",
        "version": "1.0.0"
    }

@app.get("/health")
async def health():
    return {"status": "healthy"}

# We'll add more routes here
