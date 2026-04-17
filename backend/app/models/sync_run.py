from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, Integer, JSON, String, Text

from .base import Base, TimestampMixin


class SyncRun(Base, TimestampMixin):
    __tablename__ = "sync_runs"

    id = Column(Integer, primary_key=True, index=True)
    run_id = Column(String(64), unique=True, nullable=False, index=True)
    status = Column(String(32), nullable=False, default="queued", index=True)
    is_active = Column(Boolean, nullable=False, default=True, index=True)

    current_resource = Column(String(64), nullable=True)
    progress_done = Column(Integer, nullable=False, default=0)
    progress_total = Column(Integer, nullable=False, default=4)

    stats = Column(JSON, nullable=True)
    message = Column(Text, nullable=True)
    error = Column(Text, nullable=True)

    started_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    finished_at = Column(DateTime(timezone=True), nullable=True)
