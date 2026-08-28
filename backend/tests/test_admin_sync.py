import os
from datetime import datetime, timezone
from unittest.mock import patch

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
    # _spawn_sync_subprocess actually launches `python -m app.workers.run_sync_once`,
    # which hits the real LL2 API in the background. Without mocking it, this test
    # is only deterministic until LL2's ~15 req/hour anonymous limit is hit by that
    # real subprocess - after which every subsequent run gets a real 429 regardless
    # of whether this endpoint's own logic is correct. Mocking it keeps the test
    # scoped to what it actually verifies: the endpoint's lock/cooldown checks and
    # response shape, not a live network call.
    with patch("app.main._spawn_sync_subprocess"):
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
