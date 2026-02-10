from sqlalchemy import Column, Integer, String, DateTime, Boolean
from .base import Base


class SyncState(Base):
    __tablename__ = "sync_state"

    id = Column(Integer, primary_key=True, index=True)
    resource = Column(String(128), unique=True, nullable=False, index=True)
    last_synced_at = Column(DateTime(timezone=True), nullable=True)

    # Locking fields for preventing concurrent syncs
    is_locked = Column(Boolean, default=False, nullable=False)
    lock_owner = Column(String(256), nullable=True)
    locked_at = Column(DateTime(timezone=True), nullable=True)
