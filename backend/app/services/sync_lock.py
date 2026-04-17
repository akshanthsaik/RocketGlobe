from datetime import datetime, timezone, timedelta
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from app.models import SyncState


def acquire_sync_lock(db: Session, resource: str, owner: str, ttl_seconds: int = 60 * 60) -> bool:
    """Try to acquire a lock for `resource`. Returns True if acquired, False if already locked."""
    now = datetime.now(timezone.utc)

    try:
        row = db.query(SyncState).filter(SyncState.resource == resource).with_for_update().first()
        if not row:
            row = SyncState(resource=resource, last_synced_at=None, is_locked=False)
            db.add(row)
            db.commit()
            db.refresh(row)

        # If locked and not expired, fail
        if row.is_locked:
            locked_at = row.locked_at
            if locked_at and locked_at.tzinfo is None:
                locked_at = locked_at.replace(tzinfo=timezone.utc)

            if locked_at is None:
                # Unknown lock age is treated as locked until recovered by stale-lock cleanup.
                return False

            if (now - locked_at) < timedelta(seconds=ttl_seconds):
                return False
            # expired lock; override

        row.is_locked = True
        row.lock_owner = owner
        row.locked_at = now
        db.commit()
        return True

    except SQLAlchemyError:
        db.rollback()
        return False


def release_sync_lock(db: Session, resource: str, owner: str) -> bool:
    """Release lock for `resource` if owned by `owner`. Returns True if released."""
    try:
        row = db.query(SyncState).filter(SyncState.resource == resource).first()
        if not row:
            return False
        if row.lock_owner != owner:
            return False
        row.is_locked = False
        row.lock_owner = None
        row.locked_at = None
        db.commit()
        return True
    except SQLAlchemyError:
        db.rollback()
        return False
