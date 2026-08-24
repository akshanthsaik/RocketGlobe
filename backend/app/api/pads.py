from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Pad
from app.schemas import PadResponse

router = APIRouter()


@router.get("/", response_model=List[PadResponse])
async def get_pads(
    skip: int = Query(0, ge=0),
    limit: int = Query(1000, le=1000),
    country_code: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Get all launch pads with coordinates for globe visualization."""
    query = db.query(Pad)

    if country_code:
        query = query.filter(Pad.country_code == country_code)

    pads = query.offset(skip).limit(limit).all()
    return pads


@router.get("/{pad_id}", response_model=PadResponse)
async def get_pad(pad_id: int, db: Session = Depends(get_db)):
    """Get single pad by ID."""
    pad = db.query(Pad).filter(Pad.id == pad_id).first()
    if not pad:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Pad not found")
    return pad
