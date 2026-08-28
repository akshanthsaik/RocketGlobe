from datetime import datetime, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models.base import Base
from app.models.sync_run import SyncRun
from app.services.sync_run import (
    RATE_LIMIT_SANITY_CEILING_SECONDS,
    get_launch_rate_limit_cooldown_seconds,
)


@pytest.fixture
def in_memory_db():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    try:
        yield session
    finally:
        session.close()


def _make_run(db, run_id: str, launches_wait_seconds: float) -> SyncRun:
    now = datetime.now(timezone.utc)
    run = SyncRun(
        run_id=run_id,
        status="partial",
        is_active=False,
        stats={"_rate_limited": {"launches": launches_wait_seconds}},
        started_at=now,
        finished_at=now,
    )
    db.add(run)
    db.commit()
    return run


def test_reports_real_wait_uncapped(in_memory_db):
    """A wait far longer than the LL2 client's fail-fast cap (120-300s by
    default) must still be reported close to its true value, not silently
    truncated to that cap - the cap only governs a single request's retry
    budget, not how long callers should wait before syncing again."""
    db = in_memory_db
    _make_run(db, "run-1", launches_wait_seconds=3131.0)

    remaining = get_launch_rate_limit_cooldown_seconds(db)

    assert remaining is not None
    # finished_at is "now", so only rounding/clock skew should shave anything off.
    assert remaining >= 3125


def test_sanity_ceiling_still_applies_to_garbage_values(in_memory_db):
    """A corrupt/garbage stored value (not a real LL2 window) is still capped,
    just at a generous ceiling rather than the tight client-retry cap."""
    db = in_memory_db
    _make_run(db, "run-1", launches_wait_seconds=RATE_LIMIT_SANITY_CEILING_SECONDS * 10)

    remaining = get_launch_rate_limit_cooldown_seconds(db)

    assert remaining is not None
    assert remaining <= RATE_LIMIT_SANITY_CEILING_SECONDS
