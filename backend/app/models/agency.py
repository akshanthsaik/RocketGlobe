from sqlalchemy import Column, Integer, String, Text, Boolean
from .base import Base, TimestampMixin

class Agency(Base, TimestampMixin):
    __tablename__ = "agencies"

    id = Column(Integer, primary_key=True, index=True)
    ll2_id = Column(Integer, unique=True, index=True)
    name = Column(Text, nullable=False, index=True)
    abbrev = Column(Text)
    type = Column(Text)
    country_code = Column(Text, index=True)
    description = Column(Text)
    administrator = Column(Text)
    founding_year = Column(Integer)
    logo_url = Column(Text)
    is_active = Column(Boolean, default=True)
