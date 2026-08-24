from fastapi import APIRouter

from .agencies import router as agencies_router
from .launches import router as launches_router
from .pads import router as pads_router
from .rockets import router as rockets_router

api_router = APIRouter()

api_router.include_router(launches_router, prefix="/launches", tags=["launches"])
api_router.include_router(pads_router, prefix="/pads", tags=["pads"])
api_router.include_router(agencies_router, prefix="/agencies", tags=["agencies"])
api_router.include_router(rockets_router, prefix="/rockets", tags=["rockets"])
