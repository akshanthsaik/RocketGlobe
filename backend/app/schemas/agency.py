from typing import Optional

from pydantic import BaseModel


class AgencyBase(BaseModel):
    name: str
    abbrev: Optional[str] = None
    type: Optional[str] = None
    country_code: Optional[str] = None
    founding_year: Optional[int] = None
    administrator: Optional[str] = None
    description: Optional[str] = None
    logo_url: Optional[str] = None


class AgencyResponse(AgencyBase):
    id: int
    ll2_id: int
    is_active: bool

    class Config:
        from_attributes = True
