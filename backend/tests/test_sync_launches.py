import asyncio
from datetime import datetime, timezone
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models.base import Base
from app.models.launch import Launch
from app.models.agency import Agency
from app.models.pad import Pad
from app.models.rockets import Rocket
from app.models.sync_state import SyncState
from app.workers.sync_worker import sync_launches
from app.utils.query_counter import QueryCounter


class MockClient:
    def __init__(self, pages):
        self.pages = pages
        self.calls = 0

    async def get_launches(self, params=None, limit=None, offset=None):
        if self.calls < len(self.pages):
            page = self.pages[self.calls]
        else:
            page = {"results": [], "count": 0}
        self.calls += 1
        return page


@pytest.fixture
def in_memory_db():
    engine = create_engine('sqlite:///:memory:', connect_args={"check_same_thread": False})
    # Create only tables we need
    Agency.__table__.create(bind=engine, checkfirst=True)
    Pad.__table__.create(bind=engine, checkfirst=True)
    Rocket.__table__.create(bind=engine, checkfirst=True)
    Launch.__table__.create(bind=engine, checkfirst=True)
    SyncState.__table__.create(bind=engine, checkfirst=True)
    Session = sessionmaker(bind=engine)
    session = Session()
    try:
        yield session
    finally:
        session.close()


def make_pages(n, prefix, updated_ts):
    page = {"results": [], "count": n}
    for i in range(1, n + 1):
        page["results"].append({
            "id": f"{prefix}-{i}",
            "name": f"{prefix} {i}",
            "net": updated_ts,
            "pad": {"id": i},
            "rocket": {"configuration": {"id": i}},
            "launch_service_provider": {"id": i},
            "updated": updated_ts,
        })
    return [page]


def test_launches_query_count(in_memory_db):
    db = in_memory_db
    now = datetime.now(timezone.utc).isoformat()

    pages = make_pages(200, "Launch", now)
    client = MockClient(pages)

    # Ensure there are matching referenced objects pre-inserted to avoid extra lookups
    for i in range(1, 201):
        db.add(Agency(ll2_id=i, name=f"A{i}"))
        db.add(Pad(ll2_id=i, name=f"P{i}", latitude=1.0, longitude=1.0))
        db.add(Rocket(ll2_id=i, name=f"R{i}"))
    db.commit()

    engine = db.bind
    with QueryCounter(engine) as qc:
        asyncio.run(sync_launches(client, db))

    # Expect a small, bounded number of statements (prefetches + upsert + state update)
    assert qc.count <= 20, f"Too many SQL statements: {qc.count}"
