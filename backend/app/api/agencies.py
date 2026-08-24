from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Agency
from app.schemas import AgencyResponse

router = APIRouter()


@router.get("/", response_model=List[AgencyResponse])
async def get_agencies(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, le=1000),
    country_code: Optional[str] = None,
    type: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Get list of agencies."""
    query = db.query(Agency)

    if country_code:
        query = query.filter(Agency.country_code == country_code)

    if type:
        query = query.filter(Agency.type == type)

    agencies = query.offset(skip).limit(limit).all()
    return agencies


@router.get("/{agency_id}", response_model=AgencyResponse)
async def get_agency(agency_id: int, db: Session = Depends(get_db)):
    """Get single agency by ID."""
    agency = db.query(Agency).filter(Agency.id == agency_id).first()
    if not agency:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Agency not found")
    return agency
