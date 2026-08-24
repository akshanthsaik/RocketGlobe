from datetime import datetime, timezone

from sqlalchemy import Column, DateTime
from sqlalchemy.ext.declarative import declarative_base

Base = declarative_base()


class TimestampMixin:
    """Adds created_at and updated_at to models"""

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
