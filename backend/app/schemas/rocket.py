from typing import Optional

from pydantic import BaseModel


class RocketBase(BaseModel):
    name: str
    family: Optional[str] = None
    variant: Optional[str] = None
    full_name: Optional[str] = None
    description: Optional[str] = None


class RocketResponse(RocketBase):
    id: int
    ll2_id: int
    manufacturer_id: Optional[int] = None
    is_active: bool

    class Config:
        from_attributes = True
