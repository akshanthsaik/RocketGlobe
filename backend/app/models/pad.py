from sqlalchemy import Column, Integer, String, Text, Float, ForeignKey
from sqlalchemy.orm import relationship
from geoalchemy2 import Geography
from .base import Base, TimestampMixin

class Pad(Base, TimestampMixin):
    __tablename__ = "pads"

    id = Column(Integer, primary_key=True, index=True)
    ll2_id = Column(Integer, unique=True, index=True)
    name = Column(Text, nullable=False)  # No limit
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    location = Column(Geography(geometry_type='POINT', srid=4326))
    country_code = Column(Text, index=True)  # No limit
    map_url = Column(Text)  # No limit
    total_launch_count = Column(Integer, default=0)
    agency_id = Column(Integer, ForeignKey("agencies.id"))
    
    agency = relationship("Agency", backref="pads")
