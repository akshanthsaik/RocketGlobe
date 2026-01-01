import asyncio
from datetime import datetime, timezone
import random
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import sys
import pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

from app.models.base import Base
from app.models.agency import Agency
from app.models.rockets import Rocket
from app.models.sync_state import SyncState
from app.workers.sync_worker import sync_agencies, sync_rockets, sync_launches
from app.utils.query_counter import QueryCounter
from app.database import engine as app_engine


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

    async def get_rockets(self, params=None, limit=None, offset=None):
        # Reuse same pages for rockets
        return await self.get_agencies(params=params, limit=limit, offset=offset)

    async def get_launches(self, params=None, limit=None, offset=None):
        # Reuse same pages for launches
        return await self.get_agencies(params=params, limit=limit, offset=offset)


def make_pages(n, prefix, updated_ts):
    page = {"results": [], "count": n}
    for i in range(1, n + 1):
        page["results"].append({"id": i, "name": f"{prefix} {i}", "updated": updated_ts})
    return [page]


def run():
    engine = create_engine('sqlite:///:memory:', connect_args={"check_same_thread": False})
    # create tables needed
    Agency.__table__.create(bind=engine, checkfirst=True)
    Rocket.__table__.create(bind=engine, checkfirst=True)
    SyncState.__table__.create(bind=engine, checkfirst=True)
    # Create launches table for testing sync_launches
    from app.models.launch import Launch
    Launch.__table__.create(bind=engine, checkfirst=True)

    Session = sessionmaker(bind=engine)
    db = Session()

    now = datetime.now(timezone.utc).isoformat()
    # Make 100 agencies and 100 rockets
    pages = make_pages(100, "Agency", now)
    client = MockClient(pages)

    # Count queries for agencies
    with QueryCounter(engine) as qc:
        asyncio.run(sync_agencies(client, db))
    print(f"Agencies sync executed {qc.count} SQL statements")

    # Make 200 rockets
    pages_r = make_pages(200, "Rocket", now)
    client_r = MockClient(pages_r)
    with QueryCounter(engine) as qc2:
        asyncio.run(sync_rockets(client_r, db))
    print(f"Rockets sync executed {qc2.count} SQL statements")

    # Make 500 launches
    pages_l = make_pages(500, "Launch", now)
    client_l = MockClient(pages_l)
    with QueryCounter(engine) as qc3:
        asyncio.run(sync_launches(client_l, db))
    print(f"Launches sync executed {qc3.count} SQL statements")


if __name__ == '__main__':
    run()
