"""
One-shot LL2 sync entrypoint for subprocess execution.

Usage (from backend directory, venv active):
  python -m app.workers.run_sync_once <run_id>
"""

from __future__ import annotations

import asyncio
import logging
import sys
from pathlib import Path

from app.database import SessionLocal
from app.services.sync_run import fail_sync_run
from app.workers.sync_worker import sync_all

_LOG_FORMAT = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
logger = logging.getLogger(__name__)


def _configure_logging(run_id: str) -> None:
    """Always log to backend/logs/sync-<run_id>.log; mirror to stderr if it is a TTY."""
    log_dir = Path(__file__).resolve().parents[2] / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    log_path = log_dir / f"sync-{run_id}.log"

    root = logging.getLogger()
    root.handlers.clear()
    root.setLevel(logging.INFO)
    fmt = logging.Formatter(_LOG_FORMAT)

    fh = logging.FileHandler(log_path, encoding="utf-8")
    fh.setFormatter(fmt)
    root.addHandler(fh)

    if sys.stderr.isatty():
        sh = logging.StreamHandler(sys.stderr)
        sh.setFormatter(fmt)
        root.addHandler(sh)


def main() -> int:
    if len(sys.argv) < 2:
        logging.basicConfig(level=logging.INFO, format=_LOG_FORMAT)
        logging.getLogger(__name__).error("Missing run_id argument")
        return 2
    run_id = sys.argv[1]
    _configure_logging(run_id)
    db = SessionLocal()
    try:
        logger.info("Subprocess sync starting (run_id=%s)", run_id)
        result = asyncio.run(sync_all(db, run_id=run_id))
        logger.info("Subprocess sync completed (run_id=%s): %s", run_id, result)
        return 0
    except Exception as e:
        logger.error("Subprocess sync failed (run_id=%s): %s", run_id, e)
        try:
            fail_sync_run(db, run_id, f"{type(e).__name__}: {e}")
        except Exception as cleanup_err:
            logger.error("Failed to record sync failure: %s", cleanup_err)
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
