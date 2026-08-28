from sqlalchemy import Column, Integer, String, Text, Boolean
from .base import Base, TimestampMixin

class Agency(Base, TimestampMixin):
    __tablename__ = "agencies"

    id = Column(Integer, primary_key=True, index=True)
    ll2_id = Column(Integer, unique=True, index=True)
    name = Column(Text, nullable=False, index=True)  # No limit
    abbrev = Column(Text)  # No limit
    type = Column(Text)  # No limit
    country_code = Column(Text, index=True)  # No limit
    description = Column(Text)
    administrator = Column(Text)  # No limit
    founding_year = Column(Integer)
    logo_url = Column(Text)  # No limit
    is_active = Column(Boolean, default=True)
