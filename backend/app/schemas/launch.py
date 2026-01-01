from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class LaunchBase(BaseModel):
    name: str
    status: Optional[str] = None
    net: Optional[datetime] = None
    image_url: Optional[str] = None

class LaunchResponse(LaunchBase):
    id: int
    ll2_id: str
    pad_id: Optional[int] = None
    rocket_id: Optional[int] = None
    agency_id: Optional[int] = None
    window_start: Optional[datetime] = None
    window_end: Optional[datetime] = None
    
    class Config:
        from_attributes = True
