from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime

from app.database import get_db
from app.models import Launch
from app.schemas import LaunchResponse

router = APIRouter()


@router.get("/", response_model=List[LaunchResponse])
async def get_launches(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, le=10000),
    status: Optional[str] = None,
    agency_id: Optional[int] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get list of launches with optional filters."""
    query = db.query(Launch)
    
    if status:
        query = query.filter(Launch.status == status)
    
    if agency_id:
        query = query.filter(Launch.agency_id == agency_id)
    
    if start_date:
        query = query.filter(Launch.net >= start_date)
    
    if end_date:
        query = query.filter(Launch.net <= end_date)
    
    # Order by launch date descending
    query = query.order_by(Launch.net.desc())
    
    launches = query.offset(skip).limit(limit).all()
    return launches


@router.get("/{launch_id}", response_model=LaunchResponse)
async def get_launch(launch_id: int, db: Session = Depends(get_db)):
    """Get single launch by ID."""
    launch = db.query(Launch).filter(Launch.id == launch_id).first()
    if not launch:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Launch not found")
    return launch


@router.get("/upcoming/", response_model=List[LaunchResponse])
async def get_upcoming_launches(
    limit: int = Query(10, le=100),
    db: Session = Depends(get_db)
):
    """Get upcoming launches."""
    now = datetime.utcnow()
    launches = db.query(Launch).filter(
        Launch.net >= now
    ).order_by(Launch.net.asc()).limit(limit).all()
    return launches
