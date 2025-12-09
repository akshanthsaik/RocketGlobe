from sqlalchemy import Column, Integer, String, Text, DateTime, Float, Boolean, ForeignKey, JSON
from sqlalchemy.orm import relationship
from .base import Base, TimestampMixin

class Launch(Base, TimestampMixin):
    __tablename__ = "launches"

    id = Column(Integer, primary_key=True, index=True)
    ll2_id = Column(String(100), unique=True, index=True)  # UUID from LL2
    name = Column(String(500), nullable=False, index=True)
    
    # Status
    status = Column(String(50), index=True)  # Success, Failure, TBD, Go, etc.
    net = Column(DateTime, index=True)  # No Earlier Than (launch time)
    window_end = Column(DateTime)
    window_start = Column(DateTime)
    
    # Mission info
    mission_name = Column(String(500))
    mission_description = Column(Text)
    mission_type = Column(String(100), index=True)
    orbit = Column(String(100), index=True)  # LEO, GTO, SSO, etc.
    
    # Webcast
    webcast_live = Column(Boolean, default=False)
    video_url = Column(String(500))
    
    # Relationships
    pad_id = Column(Integer, ForeignKey("pads.id"), index=True)
    rocket_id = Column(Integer, ForeignKey("rockets.id"), index=True)
    agency_id = Column(Integer, ForeignKey("agencies.id"), index=True)
    
    pad = relationship("Pad", backref="launches")
    rocket = relationship("Rocket", backref="launches")
    agency = relationship("Agency", backref="launches")
    
    # Raw JSON from LL2 (for debugging/future fields)
    raw_data = Column(JSON)
