from sqlalchemy import Column, Integer, String, Text, Float, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from .base import Base, TimestampMixin


class Rocket(Base, TimestampMixin):
    __tablename__ = "rockets"

    id = Column(Integer, primary_key=True, index=True)
    ll2_id = Column(Integer, unique=True, index=True)
    name = Column(Text, nullable=False, index=True)
    family = Column(Text)
    full_name = Column(Text)
    variant = Column(Text)
    description = Column(Text)
    
    # Specifications
    length = Column(Float)  # meters
    diameter = Column(Float)  # meters
    leo_capacity = Column(Integer)  # kg to LEO
    gto_capacity = Column(Integer)  # kg to GTO
    launch_mass = Column(Integer)  # kg
    thrust = Column(Integer)  # kN
    
    is_reusable = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    
    # Manufacturer info
    manufacturer_id = Column(Integer, ForeignKey("agencies.id"))
    manufacturer = relationship("Agency", backref="rockets")
