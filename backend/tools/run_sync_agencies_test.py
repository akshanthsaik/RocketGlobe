import asyncio
from datetime import datetime, timezone, timedelta
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Ensure 'backend' package root is on sys.path when running the script directly
import sys
import pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

from app.models.base import Base
from app.models.agency import Agency
from app.models.sync_state import SyncState
from app.workers.sync_worker import sync_agencies


class MockClient:
    def __init__(self, pages):
        self.pages = pages
        self.calls = 0

    async def get_agencies(self, params=None, limit=None, offset=None):
        if self.calls < len(self.pages):
            page = self.pages[self.calls]
        else:
            page = {"results": [], "count": 0}
        self.calls += 1
        return page


def run_test():
    engine = create_engine('sqlite:///:memory:', connect_args={"check_same_thread": False})
    # Create only the tables required for this test to avoid PostGIS-specific types (Geography)
    Agency.__table__.create(bind=engine, checkfirst=True)
    SyncState.__table__.create(bind=engine, checkfirst=True)
    Session = sessionmaker(bind=engine)
    db = Session()

    now = datetime.now(timezone.utc)
    older = (now - timedelta(days=1)).isoformat()
    newer = (now + timedelta(seconds=1)).isoformat()

    page1 = {
        "results": [
            {"id": 1, "name": "Agency One", "updated": older},
            {"id": 2, "name": "Agency Two", "updated": older},
        ],
        "count": 2,
    }

    client = MockClient([page1])
    asyncio.run(sync_agencies(client, db))

    agencies = db.query(Agency).order_by(Agency.ll2_id).all()
    assert len(agencies) == 2
    assert agencies[0].name == "Agency One"
    assert agencies[1].name == "Agency Two"

    state = db.query(SyncState).filter(SyncState.resource == "agencies").first()
    assert state is not None
    assert state.last_synced_at is not None

    page2 = {
        "results": [
            {"id": 2, "name": "Agency Two Updated", "updated": newer},
        ],
        "count": 1,
    }

    client2 = MockClient([page2])
    asyncio.run(sync_agencies(client2, db))

    agency2 = db.query(Agency).filter(Agency.ll2_id == 2).first()
    assert agency2.name == "Agency Two Updated"

    state2 = db.query(SyncState).filter(SyncState.resource == "agencies").first()
    assert state2.last_synced_at >= state.last_synced_at

    print("✅ run_sync_agencies_test: PASS")


if __name__ == '__main__':
    run_test()
