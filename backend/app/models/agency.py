from sqlalchemy import Column, Integer, String, Text, Boolean
from geoalchemy2 import Geography
from .base import Base, TimestampMixin

class Agency(Base, TimestampMixin):
    __tablename__ = "agencies"

    id = Column(Integer, primary_key=True, index=True)
    ll2_id = Column(Integer, unique=True, index=True)  # Launch Library 2 ID
    name = Column(String(255), nullable=False, index=True)
    abbrev = Column(String(50))
    type = Column(String(100))  # Government, Commercial, etc.
    country_code = Column(String(3), index=True)
    description = Column(Text)
    administrator = Column(String(255))
    founding_year = Column(Integer)
    logo_url = Column(String(500))
    is_active = Column(Boolean, default=True)
