import asyncio
import logging
import pathlib
import sys

# Ensure package imports work when running the script directly
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

from app.database import SessionLocal
from app.services.ll2_client import LL2Client
from app.workers.sync_worker import sync_launches

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("run_live_sync_launches")


def main():
    db = SessionLocal()
    client = LL2Client()

    try:
        logger.info("Starting live launches sync...")
        count = asyncio.run(sync_launches(client, db))
        logger.info(f"Live sync completed. Synced {count} launches.")
    except Exception as e:
        logger.exception(f"Live sync failed: {e}")
    finally:
        try:
            asyncio.run(client.close())
        except Exception:
            pass
        db.close()


if __name__ == "__main__":
    main()
