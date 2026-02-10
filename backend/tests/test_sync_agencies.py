import asyncio
from datetime import datetime, timezone, timedelta
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models.base import Base
from app.models.agency import Agency
from app.models.sync_state import SyncState
from app.workers.sync_worker import sync_agencies


class MockClient:
    def __init__(self, pages):
        # pages is a list of dicts returned by get_agencies
        self.pages = pages
        self.calls = 0

    async def get_agencies(self, params=None, limit=None, offset=None):
        # ignore params for basic mocking; pop next page
        if self.calls < len(self.pages):
            page = self.pages[self.calls]
        else:
            page = {"results": [], "count": 0}
        self.calls += 1
        return page


@pytest.fixture
def in_memory_db():
    engine = create_engine('sqlite:///:memory:', connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    try:
        yield session
    finally:
        session.close()


def test_incremental_agency_sync(in_memory_db):
    db = in_memory_db

    now = datetime.now(timezone.utc)
    older = (now - timedelta(days=1)).isoformat()
    newer = (now + timedelta(seconds=1)).isoformat()

    # First run returns two agencies
    page1 = {
        "results": [
            {"id": 1, "name": "Agency One", "updated": older},
            {"id": 2, "name": "Agency Two", "updated": older},
        ],
        "count": 2,
    }

    client = MockClient([page1])

    # Run initial sync
    asyncio.run(sync_agencies(client, db))

    # Verify both agencies inserted
    agencies = db.query(Agency).order_by(Agency.ll2_id).all()
    assert len(agencies) == 2
    assert agencies[0].name == "Agency One"
    assert agencies[1].name == "Agency Two"

    # SyncState should be set
    state = db.query(SyncState).filter(SyncState.resource == "agencies").first()
    assert state is not None
    assert state.last_synced_at is not None

    # Second run: only agency 2 updated
    page2 = {
        "results": [
            {"id": 2, "name": "Agency Two Updated", "updated": newer},
        ],
        "count": 1,
    }

    client2 = MockClient([page2])
    asyncio.run(sync_agencies(client2, db))

    # Verify agency 2 updated
    agency2 = db.query(Agency).filter(Agency.ll2_id == 2).first()
    assert agency2.name == "Agency Two Updated"

    # SyncState should have advanced
    state2 = db.query(SyncState).filter(SyncState.resource == "agencies").first()
    assert state2.last_synced_at >= state.last_synced_at
