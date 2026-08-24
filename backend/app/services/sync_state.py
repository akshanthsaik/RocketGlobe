from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from app.models import SyncState


def get_last_sync(db: Session, resource: str) -> Optional[datetime]:
    row = db.query(SyncState).filter(SyncState.resource == resource).first()
    return row.last_synced_at if row else None


def set_last_sync(db: Session, resource: str, ts: datetime) -> None:
    row = db.query(SyncState).filter(SyncState.resource == resource).first()
    if not row:
        row = SyncState(resource=resource, last_synced_at=ts)
        db.add(row)
    else:
        row.last_synced_at = ts
    db.commit()
