from fastapi.testclient import TestClient
from app.main import app


def test_trigger_sync_returns_202():
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
    from datetime import datetime

    db = SessionLocal()
    try:
        # Insert a locked sync state to simulate an existing running sync
        s = SyncState(resource="sync_all", is_locked=True, lock_owner="test", locked_at=datetime.utcnow())
        db.add(s)
        db.commit()

        client = TestClient(app)
        resp = client.post("/admin/sync")
        assert resp.status_code == 409
    finally:
        # Cleanup
        db.query(SyncState).filter(SyncState.resource == "sync_all").delete()
        db.commit()
        db.close()
