import os
from datetime import datetime, timezone

from fastapi.testclient import TestClient

from app.main import app


def _reset_active_sync_for_tests() -> None:
    """Clear leftover runs/locks from dev DB so POST /admin/sync is not 409."""
    from app.database import SessionLocal
    from app.models import SyncRun, SyncState

    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        for run in db.query(SyncRun).filter(SyncRun.is_active.is_(True)).all():
            run.is_active = False
            run.status = "failed"
            run.message = "Cancelled for tests"
            run.error = "test_cleanup"
            run.finished_at = now
        row = db.query(SyncState).filter(SyncState.resource == "sync_all").first()
        if row:
            row.is_locked = False
            row.lock_owner = None
            row.locked_at = None
        db.commit()
    finally:
        db.close()


def test_is_pid_alive_current_process():
    from app.services.sync_run import _is_pid_alive

    assert _is_pid_alive(os.getpid()) is True
    assert _is_pid_alive(-1) is False
    assert _is_pid_alive(0) is False


def test_trigger_sync_returns_202():
    _reset_active_sync_for_tests()
    client = TestClient(app)
    resp = client.post("/admin/sync")
    # Should schedule background job and return 202 Accepted
    assert resp.status_code == 202
    data = resp.json()
    assert data.get("status") in ("started",)


def test_sync_status_endpoint():
    client = TestClient(app)
    resp = client.get("/admin/sync-status")
    assert resp.status_code == 200
    body = resp.json()
    assert "is_sync_running" in body
    assert "data_counts" in body


def test_trigger_sync_conflict():
    from app.database import SessionLocal
    from app.models.sync_state import SyncState

    db = SessionLocal()
    try:
        locked_at = datetime.now(timezone.utc)
        row = db.query(SyncState).filter(SyncState.resource == "sync_all").first()
        if row:
            row.is_locked = True
            row.lock_owner = "test"
            row.locked_at = locked_at
        else:
            db.add(
                SyncState(
                    resource="sync_all",
                    is_locked=True,
                    lock_owner="test",
                    locked_at=locked_at,
                )
            )
        db.commit()

        client = TestClient(app)
        resp = client.post("/admin/sync")
        assert resp.status_code == 409
    finally:
        db.rollback()
        row = db.query(SyncState).filter(SyncState.resource == "sync_all").first()
        if row:
            row.is_locked = False
            row.lock_owner = None
            row.locked_at = None
            db.commit()
        db.close()
