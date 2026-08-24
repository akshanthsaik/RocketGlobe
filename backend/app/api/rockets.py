from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Rocket
from app.schemas import RocketResponse

router = APIRouter()


@router.get("/", response_model=List[RocketResponse])
async def get_rockets(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, le=1000),
    family: Optional[str] = None,
    is_active: Optional[bool] = None,
    db: Session = Depends(get_db),
):
    """Get list of rocket configurations."""
    query = db.query(Rocket)

    if family:
        query = query.filter(Rocket.family == family)

    if is_active is not None:
        query = query.filter(Rocket.is_active == is_active)

    rockets = query.offset(skip).limit(limit).all()
    return rockets


@router.get("/{rocket_id}", response_model=RocketResponse)
async def get_rocket(rocket_id: int, db: Session = Depends(get_db)):
    """Get single rocket by ID."""
    rocket = db.query(Rocket).filter(Rocket.id == rocket_id).first()
    if not rocket:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Rocket not found")
    return rocket
