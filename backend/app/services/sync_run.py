from __future__ import annotations

import logging
import os
import sys
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.models import SyncRun, SyncState
from app.utils.time import normalize_utc

logger = logging.getLogger(__name__)

RUNNING_STATUSES = ("queued", "running")

# Guards a stored `_rate_limited` wait against a corrupt/garbage value only.
# The real LL2-reported wait can legitimately exceed the LL2 client's
# fail-fast cap (that cap governs how long a single request is retried before
# giving up, not how long callers should wait before syncing again) and must
# be reported to callers uncapped.
RATE_LIMIT_SANITY_CEILING_SECONDS = 24 * 60 * 60


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _parse_owner_pid(owner: Optional[str]) -> Optional[int]:
    """Extract the pid from a `"<label>:pid:<pid>"` lock_owner string.

    Any owner string that doesn't match this format is logged and treated as
    "no pid known" (dead-process detection is skipped for it, not assumed dead)
    rather than failing silently.
    """
    if not owner:
        return None
    if ":pid:" not in owner:
        logger.warning("lock_owner %r doesn't match expected '<label>:pid:<pid>' format", owner)
        return None
    try:
        return int(owner.rsplit(":pid:", 1)[1])
    except (TypeError, ValueError):
        logger.warning("lock_owner %r has non-integer pid suffix", owner)
        return None


def _is_pid_alive_windows(pid: int) -> bool:
    """Return True if pid looks like a live process (Windows).

    os.kill(pid, 0) is unreliable here: it can fail with permissions or odd job
    states even when the sync worker is still running, which incorrectly trips
    stale-lock recovery and fails the run.
    """
    import ctypes
    from ctypes import wintypes

    ERROR_ACCESS_DENIED = 5
    PROCESS_QUERY_LIMITED_INFORMATION = 0x1000

    kernel32 = ctypes.windll.kernel32
    handle = kernel32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, wintypes.DWORD(pid))
    if handle:
        kernel32.CloseHandle(handle)
        return True
    err = kernel32.GetLastError()
    # Process exists but we are not allowed to open it — treat as alive.
    if err == ERROR_ACCESS_DENIED:
        return True
    return False


def _is_pid_alive(pid: int) -> bool:
    if pid <= 0:
        return False

    if sys.platform == "win32":
        return _is_pid_alive_windows(pid)

    try:
        os.kill(pid, 0)
    except OSError:
        return False
    except Exception:
        return False

    return True


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

    runs = db.query(SyncRun).filter(SyncRun.is_active.is_(True), SyncRun.status.in_(RUNNING_STATUSES)).all()
    for run in runs:
        heartbeat = normalize_utc(run.updated_at or run.started_at)
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
        locked_at = normalize_utc(lock_row.locked_at)
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


def get_launch_rate_limit_cooldown_seconds(
    db: Session,
    exclude_run_id: Optional[str] = None,
) -> Optional[int]:
    """Seconds remaining on the most recent LL2 launches rate-limit window, if any.

    Single source of truth for this check - both the admin sync endpoint (before a
    run exists, so `exclude_run_id` is None) and the sync worker itself (which
    excludes its own in-progress run) call this instead of maintaining separate
    copies that can drift apart.
    """
    now = _utcnow()
    recent_runs = (
        db.query(SyncRun).filter(SyncRun.run_id != exclude_run_id).order_by(SyncRun.started_at.desc()).limit(10).all()
    )

    for run in recent_runs:
        stats = run.stats if isinstance(run.stats, dict) else {}
        rate_limited = stats.get("_rate_limited")
        if not isinstance(rate_limited, dict):
            continue

        raw_wait = rate_limited.get("launches")
        try:
            wait_seconds = int(float(raw_wait))
        except (TypeError, ValueError):
            continue

        if wait_seconds <= 0:
            continue
        wait_seconds = min(wait_seconds, RATE_LIMIT_SANITY_CEILING_SECONDS)

        baseline = normalize_utc(run.finished_at or run.updated_at or run.started_at)
        if baseline is None:
            continue

        elapsed = (now - baseline).total_seconds()
        remaining = int(round(wait_seconds - elapsed))
        if remaining > 0:
            return remaining

    return None
