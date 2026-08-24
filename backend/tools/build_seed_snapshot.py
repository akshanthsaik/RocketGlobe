"""
One-time full historical crawl of LL2 data into a standalone seed SQLite DB.

This is NOT the per-user live sync (that stays fast-fail: see app/services/ll2_client.py
and the LL2_LAUNCHES_MAX_WAIT_SECONDS-style budgets). This tool is the opposite on
purpose - it's meant to be run by hand, unattended, for however long LL2's ~15
req/hour anonymous quota makes a full crawl take (confirmed OK with The Space Devs
on Discord: bulk-crawl once, cache a snapshot, then only sync incremental updates
per user from there). It patiently sleeps through every rate-limit window instead
of aborting, and checkpoints progress to disk after every page so it's safe to
Ctrl+C and re-run without losing more than the current in-flight request.

Usage (from backend/, venv active):
  python tools/build_seed_snapshot.py --out seed_data/rocketglobe_seed.db

Resume after an interruption - just run the same command again:
  python tools/build_seed_snapshot.py --out seed_data/rocketglobe_seed.db

Only crawl specific resources (e.g. after agencies/pads/rockets already finished):
  python tools/build_seed_snapshot.py --out seed_data/rocketglobe_seed.db --resources launches
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import pathlib
import subprocess
import sys
import time

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

from app.services.ll2_client import LL2Client  # noqa: E402
from app.workers.sync_worker import sync_agencies, sync_launches, sync_pads, sync_rockets  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("build_seed_snapshot")

BACKEND_DIR = pathlib.Path(__file__).resolve().parent.parent
DEFAULT_LL2_BASE_URL = "https://ll.thespacedevs.com/2.3.0"
ALL_RESOURCES = ("agencies", "pads", "rockets", "launches")

# Patient budgets: never give up because a single wait/window is "too long" - only
# give up if LL2 keeps failing for an unreasonable number of attempts.
PATIENT_MAX_RETRIES = 2000
PATIENT_MAX_WAIT_SECONDS = 6 * 3600
PATIENT_MAX_REQUEST_DURATION = 24 * 3600


def _load_checkpoint(path: pathlib.Path) -> dict:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text())
    except (json.JSONDecodeError, OSError):
        logger.warning("Checkpoint file at %s is unreadable; starting fresh", path)
        return {}


def _make_checkpoint_writer(path: pathlib.Path, checkpoint: dict):
    def _on_page(resource: str, next_offset: int | None) -> None:
        if next_offset is None:
            checkpoint.pop(resource, None)
            logger.info("%s: crawl complete, checkpoint cleared", resource)
        else:
            checkpoint[resource] = next_offset
            logger.info("%s: checkpoint saved at offset %s", resource, next_offset)
        path.write_text(json.dumps(checkpoint, indent=2))

    return _on_page


def _run_migrations(db_path: pathlib.Path) -> None:
    logger.info("Running alembic migrations against %s", db_path)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=str(BACKEND_DIR),
        env={**__import__("os").environ, "DATABASE_URL": f"sqlite:///{db_path}"},
    )
    if result.returncode != 0:
        raise SystemExit("alembic upgrade head failed - see output above")


async def _run(args: argparse.Namespace) -> None:
    db_path = pathlib.Path(args.out).resolve()
    checkpoint_path = db_path.with_suffix(db_path.suffix + ".checkpoint.json")

    _run_migrations(db_path)

    engine = create_engine(f"sqlite:///{db_path}", connect_args={"check_same_thread": False})
    Session = sessionmaker(bind=engine)
    db = Session()

    checkpoint = _load_checkpoint(checkpoint_path)
    on_page = _make_checkpoint_writer(checkpoint_path, checkpoint)

    client = LL2Client(
        base_url=args.base_url,
        max_retries=PATIENT_MAX_RETRIES,
        max_wait_seconds=PATIENT_MAX_WAIT_SECONDS,
        max_request_duration=PATIENT_MAX_REQUEST_DURATION,
    )

    resources = [r for r in ALL_RESOURCES if r in args.resources]
    sync_fns = {
        "agencies": sync_agencies,
        "pads": sync_pads,
        "rockets": sync_rockets,
        "launches": sync_launches,
    }

    logger.info("Seeding from %s into %s (resources: %s)", client.base_url, db_path, ", ".join(resources))
    started = time.monotonic()

    try:
        for resource in resources:
            start_offset = checkpoint.get(resource, 0)
            if start_offset:
                logger.info("%s: resuming from checkpoint offset %s", resource, start_offset)
            resource_started = time.monotonic()
            count = await sync_fns[resource](client, db, start_offset=start_offset, on_page=on_page)
            logger.info(
                "%s: done - %s records touched in %.1fs",
                resource,
                count,
                time.monotonic() - resource_started,
            )
    finally:
        await client.close()

    logger.info("Seed crawl finished in %.1fs total. DB at %s", time.monotonic() - started, db_path)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument(
        "--out",
        default=str(BACKEND_DIR / "seed_data" / "rocketglobe_seed.db"),
        help="Path to the seed SQLite DB to create/resume (default: backend/seed_data/rocketglobe_seed.db)",
    )
    parser.add_argument(
        "--base-url",
        default=DEFAULT_LL2_BASE_URL,
        help=f"LL2 base URL to crawl (default: production, {DEFAULT_LL2_BASE_URL}). "
        "Defaults to production regardless of backend/.env, since a seed built from "
        "the dev sandbox's small synthetic dataset would be useless.",
    )
    parser.add_argument(
        "--resources",
        default=",".join(ALL_RESOURCES),
        help=f"Comma-separated subset of {ALL_RESOURCES} to crawl (default: all)",
    )
    args = parser.parse_args()
    args.resources = {r.strip() for r in args.resources.split(",") if r.strip()}
    unknown = args.resources - set(ALL_RESOURCES)
    if unknown:
        parser.error(f"Unknown resource(s): {', '.join(sorted(unknown))}")

    try:
        asyncio.run(_run(args))
    except KeyboardInterrupt:
        logger.warning("Interrupted - progress is checkpointed, re-run the same command to resume.")
        return 130
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
