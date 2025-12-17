from pydantic import BaseModel
from typing import Optional

class PadBase(BaseModel):
    name: str
    latitude: float
    longitude: float
    country_code: Optional[str] = None
    map_url: Optional[str] = None
    total_launch_count: int

class PadResponse(PadBase):
    id: int
    ll2_id: int
    
    class Config:
        from_attributes = True
