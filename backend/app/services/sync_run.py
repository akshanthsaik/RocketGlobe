from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.models import SyncRun, SyncState


RUNNING_STATUSES = ("queued", "running")


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _parse_owner_pid(owner: Optional[str]) -> Optional[int]:
    if not owner or ":pid:" not in owner:
        return None
    try:
        return int(owner.rsplit(":pid:", 1)[1])
    except Exception:
        return None


def _is_pid_alive(pid: int) -> bool:
    if pid <= 0:
        return False

    try:
        os.kill(pid, 0)
    except OSError:
        return False
    except Exception:
        return False

    return True


def _as_utc(value: Optional[datetime]) -> Optional[datetime]:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def serialize_sync_run(run: Optional[SyncRun]) -> Optional[dict[str, Any]]:
    if not run:
        return None

    return {
        "run_id": run.run_id,
        "status": run.status,
        "is_active": bool(run.is_active),
        "current_resource": run.current_resource,
        "progress_done": run.progress_done,
        "progress_total": run.progress_total,
        "stats": run.stats or {},
        "message": run.message,
        "error": run.error,
        "started_at": run.started_at.isoformat() if run.started_at else None,
        "updated_at": run.updated_at.isoformat() if run.updated_at else None,
        "finished_at": run.finished_at.isoformat() if run.finished_at else None,
    }


def get_sync_run(db: Session, run_id: str) -> Optional[SyncRun]:
    return db.query(SyncRun).filter(SyncRun.run_id == run_id).first()


def get_latest_sync_run(db: Session) -> Optional[SyncRun]:
    return db.query(SyncRun).order_by(SyncRun.started_at.desc()).first()


def get_active_sync_run(db: Session) -> Optional[SyncRun]:
    return (
        db.query(SyncRun)
        .filter(SyncRun.is_active.is_(True), SyncRun.status.in_(RUNNING_STATUSES))
        .order_by(SyncRun.started_at.desc())
        .first()
    )


def create_sync_run(
    db: Session,
    run_id: str,
    message: str = "Sync queued",
    progress_total: int = 4,
) -> Optional[SyncRun]:
    run = SyncRun(
        run_id=run_id,
        status="queued",
        is_active=True,
        progress_done=0,
        progress_total=progress_total,
        stats={},
        message=message,
        started_at=_utcnow(),
        finished_at=None,
    )
    try:
        db.add(run)
        db.commit()
        db.refresh(run)
        return run
    except SQLAlchemyError:
        db.rollback()
        return None


def update_sync_run(db: Session, run_id: str, **updates: Any) -> Optional[SyncRun]:
    run = get_sync_run(db, run_id)
    if not run:
        return None

    try:
        for key, value in updates.items():
            setattr(run, key, value)

        db.commit()
        db.refresh(run)
        return run
    except SQLAlchemyError:
        db.rollback()
        return None


def complete_sync_run(
    db: Session,
    run_id: str,
    status: str = "success",
    message: str = "Sync completed successfully",
    stats: Optional[dict[str, Any]] = None,
) -> Optional[SyncRun]:
    payload: dict[str, Any] = {
        "status": status,
        "is_active": False,
        "message": message,
        "error": None,
        "finished_at": _utcnow(),
    }
    if stats is not None:
        payload["stats"] = stats

    return update_sync_run(db, run_id, **payload)


def fail_sync_run(db: Session, run_id: str, error: str) -> Optional[SyncRun]:
    return update_sync_run(
        db,
        run_id,
        status="failed",
        is_active=False,
        error=error,
        message="Sync failed",
        finished_at=_utcnow(),
    )


def recover_stale_sync_state(db: Session, ttl_seconds: int) -> dict[str, int]:
    """Recover stale lock/run rows to keep sync endpoints from getting stuck."""
    now = _utcnow()
    stale_before = now - timedelta(seconds=ttl_seconds)
    stale_runs = 0
    cleared_locks = 0
    changed = False
    marked_run_ids: set[int] = set()

    runs = (
        db.query(SyncRun)
        .filter(SyncRun.is_active.is_(True), SyncRun.status.in_(RUNNING_STATUSES))
        .all()
    )
    for run in runs:
        heartbeat = _as_utc(run.updated_at or run.started_at)
        if heartbeat and heartbeat >= stale_before:
            continue

        run.status = "failed"
        run.is_active = False
        run.message = "Sync marked stale after inactivity"
        run.error = "Sync run was inactive past stale timeout window"
        run.finished_at = now
        stale_runs += 1
        marked_run_ids.add(run.id)
        changed = True

    lock_row = db.query(SyncState).filter(SyncState.resource == "sync_all").first()
    active_run = get_active_sync_run(db)
    lock_owner_pid = _parse_owner_pid(lock_row.lock_owner if lock_row else None)
    owner_dead = bool(lock_owner_pid and not _is_pid_alive(lock_owner_pid))

    if owner_dead:
        for run in runs:
            if run.id in marked_run_ids:
                continue
            if not run.is_active:
                continue
            run.status = "failed"
            run.is_active = False
            run.message = "Sync owner process is no longer alive"
            run.error = f"Lock owner pid {lock_owner_pid} not found"
            run.finished_at = now
            stale_runs += 1
            marked_run_ids.add(run.id)
            changed = True

        active_run = None

    if lock_row and lock_row.is_locked:
        locked_at = _as_utc(lock_row.locked_at)
        lock_is_stale = False

        if owner_dead:
            lock_is_stale = True
        elif locked_at is None:
            # Unknown lock age should only remain if there is an active run heartbeat.
            lock_is_stale = active_run is None
        else:
            lock_is_stale = (now - locked_at) >= timedelta(seconds=ttl_seconds)

        if lock_is_stale:
            lock_row.is_locked = False
            lock_row.lock_owner = None
            lock_row.locked_at = None
            cleared_locks += 1
            changed = True

    if changed:
        try:
            db.commit()
        except SQLAlchemyError:
            db.rollback()
            return {"stale_runs": 0, "cleared_locks": 0}

    return {"stale_runs": stale_runs, "cleared_locks": cleared_locks}
