import asyncio
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone
from geoalchemy2 import WKTElement
import logging

from app.database import SessionLocal
from app.services.ll2_client import LL2Client
from app.services.sync_state import get_last_sync, set_last_sync
from app.services.sync_lock import acquire_sync_lock, release_sync_lock
from app.models import Agency, Pad, Rocket, Launch

logger = logging.getLogger(__name__)


async def sync_agencies(client: LL2Client, db: Session) -> int:
    """Incremental sync for agencies from LL2 to database using bulk upserts."""
    logger.info("Syncing agencies (incremental)...")
    count = 0
    offset = 0
    limit = 500

    def _parse_ll2_date(s: str):
        if not s:
            return None
        try:
            # LL2 typically uses ISO format; handle trailing Z
            return datetime.fromisoformat(s.replace('Z', '+00:00'))
        except Exception:
            return None

    last_sync = get_last_sync(db, "agencies")
    # Normalize naive datetimes to UTC-aware for safe comparisons
    if last_sync and last_sync.tzinfo is None:
        last_sync = last_sync.replace(tzinfo=timezone.utc)

    max_seen_ts = None

    while True:
        params = {"limit": limit, "offset": offset}
        if last_sync:
            # Ask server for only updated records when possible
            params["updated__gte"] = last_sync.isoformat()

        data = await client.get_agencies(params=params)
        results = data.get("results", [])

        if not results:
            break

        ids = [item.get("id") for item in results if item.get("id") is not None]
        existing = {}
        if ids:
            rows = db.query(Agency).filter(Agency.ll2_id.in_(ids)).all()
            existing = {r.ll2_id: r for r in rows}

        insert_mappings = []
        update_mappings = []

        for item in results:
            item_id = item.get("id")
            if item_id is None:
                continue

            updated_ts = _parse_ll2_date(item.get("updated") or item.get("modified"))
            if updated_ts:
                if max_seen_ts is None or updated_ts > max_seen_ts:
                    max_seen_ts = updated_ts
                if last_sync and updated_ts <= last_sync:
                    # unchanged
                    continue

            # Build entity mapping
            mapping = {
                "ll2_id": item_id,
                "name": item.get("name", ""),
                "abbrev": item.get("abbrev"),
                "description": item.get("description"),
                "administrator": item.get("administrator"),
                "founding_year": item.get("founding_year"),
                "is_active": not item.get("inactive", False),
                "logo_url": None,
            }

            # Type
            agency_type = item.get("type")
            if isinstance(agency_type, dict):
                mapping["type"] = agency_type.get("name")
            else:
                mapping["type"] = agency_type

            # Country (array in v2.3.0)
            countries = item.get("country", [])
            if countries and isinstance(countries, list) and len(countries) > 0:
                mapping["country_code"] = countries[0].get("alpha_3_code")

            logo = item.get("logo")
            if logo and isinstance(logo, dict):
                mapping["logo_url"] = logo.get("image_url")

            if item_id in existing:
                mapping["id"] = existing[item_id].id
                update_mappings.append(mapping)
            else:
                insert_mappings.append(mapping)

            count += 1

        # Bulk apply
        if insert_mappings:
            db.bulk_insert_mappings(Agency, insert_mappings)
        if update_mappings:
            db.bulk_update_mappings(Agency, update_mappings)

        db.commit()

        # Advance offset and check completion
        offset += limit
        total = data.get("count", 0)
        if offset >= total:
            break

    # If we saw updates, set last sync to most recent updated timestamp; else set to now()
    if max_seen_ts:
        set_last_sync(db, "agencies", max_seen_ts)
    else:
        # Use timezone-aware UTC to avoid naive/aware mixing
        set_last_sync(db, "agencies", datetime.now(timezone.utc))

    logger.info(f"Synced {count} agencies (incremental)")
    return count


async def sync_pads(client: LL2Client, db: Session) -> int:
    """Incremental sync for pads using bulk upserts. After bulk insert we update `location` in Postgres using PostGIS functions in a single UPDATE statement."""
    logger.info("Syncing pads (incremental)...")
    count = 0
    offset = 0
    limit = 500

    last_sync = get_last_sync(db, "pads")
    if last_sync and last_sync.tzinfo is None:
        last_sync = last_sync.replace(tzinfo=timezone.utc)

    max_seen_ts = None

    while True:
        params = {"limit": limit, "offset": offset}
        if last_sync:
            params["updated__gte"] = last_sync.isoformat()

        data = await client.get_pads(params=params)
        results = data.get("results", [])
        if not results:
            break

        ids = [item.get("id") for item in results if item.get("id") is not None]
        existing = {}
        if ids:
            rows = db.query(Pad).filter(Pad.ll2_id.in_(ids)).all()
            existing = {r.ll2_id: r for r in rows}

        insert_mappings = []
        update_mappings = []

        for item in results:
            item_id = item.get("id")
            if item_id is None:
                continue

            updated_ts = None
            for k in ("updated", "modified"):
                if item.get(k):
                    try:
                        updated_ts = datetime.fromisoformat(item.get(k).replace('Z', '+00:00'))
                    except Exception:
                        updated_ts = None
                    break

            if updated_ts:
                if max_seen_ts is None or updated_ts > max_seen_ts:
                    max_seen_ts = updated_ts
                if last_sync and updated_ts <= last_sync:
                    continue

            # Coordinates
            lat = item.get("latitude")
            lon = item.get("longitude")
            if lat is None or lon is None:
                logger.warning(f"⚠️  Skipping pad '{item.get('name')}' - no coordinates")
                continue

            try:
                lat_val = float(lat)
                lon_val = float(lon)
            except (ValueError, TypeError):
                logger.warning(f"⚠️  Invalid coordinates for pad '{item.get('name')}': {lat},{lon}")
                continue

            mapping = {
                "ll2_id": item_id,
                "name": item.get("name", ""),
                "latitude": lat_val,
                "longitude": lon_val,
                "country_code": None,
                "map_url": item.get("map_url"),
                "total_launch_count": item.get("total_launch_count", 0),
            }

            country = item.get("country")
            if country and isinstance(country, dict):
                mapping["country_code"] = country.get("alpha_3_code")

            if item_id in existing:
                mapping["id"] = existing[item_id].id
                update_mappings.append(mapping)
            else:
                insert_mappings.append(mapping)

            count += 1

        inserted_ll2_ids = [m["ll2_id"] for m in insert_mappings]

        if insert_mappings:
            db.bulk_insert_mappings(Pad, insert_mappings)
        if update_mappings:
            db.bulk_update_mappings(Pad, update_mappings)

        db.commit()

        # If we're running on Postgres, update the geography column using a single UPDATE statement
        try:
            dialect_name = db.bind.dialect.name
        except Exception:
            dialect_name = None

        if dialect_name == 'postgresql' and inserted_ll2_ids:
            # Fetch numeric IDs of inserted rows
            rows = db.query(Pad).filter(Pad.ll2_id.in_(inserted_ll2_ids)).all()
            inserted_ids = [r.id for r in rows]
            if inserted_ids:
                from geoalchemy2.functions import ST_SetSRID, ST_MakePoint
                db.query(Pad).filter(Pad.id.in_(inserted_ids)).update(
                    {Pad.location: ST_SetSRID(ST_MakePoint(Pad.longitude, Pad.latitude), 4326)},
                    synchronize_session=False,
                )
                db.commit()

        offset += limit
        total = data.get("count", 0)
        if offset >= total:
            break

    if max_seen_ts:
        set_last_sync(db, "pads", max_seen_ts)
    else:
        set_last_sync(db, "pads", datetime.now(timezone.utc))

    logger.info(f"Synced {count} pads (incremental)")
    return count


async def sync_rockets(client: LL2Client, db: Session) -> int:
    """Incremental sync for rockets using bulk upserts and prefetching manufacturers."""
    logger.info("Syncing rockets (incremental)...")
    count = 0
    offset = 0
    limit = 500

    last_sync = get_last_sync(db, "rockets")
    if last_sync and last_sync.tzinfo is None:
        last_sync = last_sync.replace(tzinfo=timezone.utc)

    max_seen_ts = None

    while True:
        params = {"limit": limit, "offset": offset}
        if last_sync:
            params["updated__gte"] = last_sync.isoformat()

        data = await client.get_rockets(params=params)
        results = data.get("results", [])
        if not results:
            break

        ids = [item.get("id") for item in results if item.get("id") is not None]
        existing = {}
        if ids:
            rows = db.query(Rocket).filter(Rocket.ll2_id.in_(ids)).all()
            existing = {r.ll2_id: r for r in rows}

        # Pre-fetch manufacturers referenced in this page
        manufacturer_ids = set()
        for item in results:
            m = item.get("manufacturer")
            if isinstance(m, dict) and m.get("id"):
                manufacturer_ids.add(m.get("id"))
        manufacturers = {}
        if manufacturer_ids:
            rows = db.query(Agency).filter(Agency.ll2_id.in_(list(manufacturer_ids))).all()
            manufacturers = {r.ll2_id: r.id for r in rows}

        insert_mappings = []
        update_mappings = []

        for item in results:
            item_id = item.get("id")
            if item_id is None:
                continue

            updated_ts = None
            for k in ("updated", "modified"):
                if item.get(k):
                    try:
                        updated_ts = datetime.fromisoformat(item.get(k).replace('Z', '+00:00'))
                    except Exception:
                        updated_ts = None
                    break

            if updated_ts:
                if max_seen_ts is None or updated_ts > max_seen_ts:
                    max_seen_ts = updated_ts
                if last_sync and updated_ts <= last_sync:
                    continue

            mapping = {
                "ll2_id": item_id,
                "name": item.get("name", ""),
                "full_name": item.get("full_name"),
                "variant": item.get("variant"),
                "description": item.get("description"),
                "family": None,
                "length": item.get("length"),
                "diameter": item.get("diameter"),
                "launch_mass": item.get("launch_mass"),
                "leo_capacity": item.get("leo_capacity"),
                "gto_capacity": item.get("gto_capacity"),
                "thrust": item.get("to_thrust"),
                "is_reusable": item.get("reusable", False),
                "is_active": item.get("active", True),
                "manufacturer_id": None,
            }

            families = item.get("families", [])
            if families and isinstance(families, list) and len(families) > 0:
                mapping["family"] = families[0].get("name", "")

            manufacturer = item.get("manufacturer")
            if manufacturer and isinstance(manufacturer, dict):
                mid = manufacturer.get("id")
                if mid and manufacturers.get(mid):
                    mapping["manufacturer_id"] = manufacturers.get(mid)

            if item_id in existing:
                mapping["id"] = existing[item_id].id
                update_mappings.append(mapping)
            else:
                insert_mappings.append(mapping)

            count += 1

        if insert_mappings:
            db.bulk_insert_mappings(Rocket, insert_mappings)
        if update_mappings:
            db.bulk_update_mappings(Rocket, update_mappings)

        db.commit()
        offset += limit
        total = data.get("count", 0)
        if offset >= total:
            break

    if max_seen_ts:
        set_last_sync(db, "rockets", max_seen_ts)
    else:
        set_last_sync(db, "rockets", datetime.now(timezone.utc))

    logger.info(f"Synced {count} rockets (incremental)")
    return count


async def sync_launches(client: LL2Client, db: Session) -> int:
    """Incremental sync for launches using bulk upserts and prefetch of related objects."""
    logger.info("Syncing launches (incremental)...")
    count = 0
    offset = 0
    limit = 500

    last_sync = get_last_sync(db, "launches")
    if last_sync and last_sync.tzinfo is None:
        last_sync = last_sync.replace(tzinfo=timezone.utc)

    max_seen_ts = None

    def _parse_iso(s: str):
        if not s:
            return None
        try:
            return datetime.fromisoformat(s.replace('Z', '+00:00'))
        except Exception:
            return None

    while True:
        params = {"limit": limit, "offset": offset}
        if last_sync:
            params["updated__gte"] = last_sync.isoformat()

        data = await client.get_launches(params=params)
        results = data.get("results", [])
        if not results:
            break

        ids = [item.get("id") for item in results if item.get("id")]
        existing = {}
        if ids:
            rows = db.query(Launch).filter(Launch.ll2_id.in_(ids)).all()
            existing = {r.ll2_id: r for r in rows}

        # Prefetch related objects referenced in this page
        pad_ids = set()
        rocket_cfg_ids = set()
        agency_ids = set()

        for item in results:
            pad = item.get("pad")
            if isinstance(pad, dict) and pad.get("id"):
                pad_ids.add(pad.get("id"))

            rocket_data = item.get("rocket") or {}
            cfg = rocket_data.get("configuration") if isinstance(rocket_data, dict) else None
            if isinstance(cfg, dict) and cfg.get("id"):
                rocket_cfg_ids.add(cfg.get("id"))

            lsp = item.get("launch_service_provider")
            if isinstance(lsp, dict) and lsp.get("id"):
                agency_ids.add(lsp.get("id"))

        pads_map = {}
        rockets_map = {}
        agencies_map = {}

        if pad_ids:
            rows = db.query(Pad).filter(Pad.ll2_id.in_(list(pad_ids))).all()
            pads_map = {r.ll2_id: r.id for r in rows}
        if rocket_cfg_ids:
            rows = db.query(Rocket).filter(Rocket.ll2_id.in_(list(rocket_cfg_ids))).all()
            rockets_map = {r.ll2_id: r.id for r in rows}
        if agency_ids:
            rows = db.query(Agency).filter(Agency.ll2_id.in_(list(agency_ids))).all()
            agencies_map = {r.ll2_id: r.id for r in rows}

        insert_mappings = []
        update_mappings = []

        for item in results:
            item_id = item.get("id")
            if not item_id:
                continue

            updated_ts = _parse_iso(item.get("updated") or item.get("modified"))
            if updated_ts:
                if max_seen_ts is None or updated_ts > max_seen_ts:
                    max_seen_ts = updated_ts
                if last_sync and updated_ts <= last_sync:
                    continue

            mapping = {
                "ll2_id": str(item_id),
                "name": item.get("name", ""),
                "slug": item.get("slug"),
                "net": _parse_iso(item.get("net")),
                "window_start": _parse_iso(item.get("window_start")),
                "window_end": _parse_iso(item.get("window_end")),
                "status": (item.get("status") or {}).get("name") if item.get("status") else None,
                "image_url": (item.get("image") or {}).get("image_url") if item.get("image") else None,
                "raw_data": item
            }

            # Resolve pad
            pad_data = item.get("pad")
            if isinstance(pad_data, dict) and pad_data.get("id") and pads_map.get(pad_data.get("id")):
                mapping["pad_id"] = pads_map.get(pad_data.get("id"))

            # Resolve rocket configuration
            rocket_cfg = (item.get("rocket") or {}).get("configuration")
            if isinstance(rocket_cfg, dict) and rocket_cfg.get("id") and rockets_map.get(rocket_cfg.get("id")):
                mapping["rocket_id"] = rockets_map.get(rocket_cfg.get("id"))

            # Resolve agency
            lsp = item.get("launch_service_provider")
            if isinstance(lsp, dict) and lsp.get("id") and agencies_map.get(lsp.get("id")):
                mapping["agency_id"] = agencies_map.get(lsp.get("id"))

            if item_id in existing:
                mapping["id"] = existing[item_id].id
                update_mappings.append(mapping)
            else:
                insert_mappings.append(mapping)

            count += 1

        if insert_mappings:
            db.bulk_insert_mappings(Launch, insert_mappings)
        if update_mappings:
            db.bulk_update_mappings(Launch, update_mappings)

        db.commit()
        offset += limit
        total = data.get("count", 0)
        if offset >= total:
            break

    if max_seen_ts:
        set_last_sync(db, "launches", max_seen_ts)
    else:
        set_last_sync(db, "launches", datetime.now(timezone.utc))

    logger.info(f"Synced {count} launches (incremental)")
    return count



async def sync_all(db: Session) -> dict:
    """Sync all data from Launch Library 2 using a DB lock to prevent concurrent runs."""
    logger.info("Starting full sync from Launch Library 2...")

    owner = f"sync_all:pid:{__import__('os').getpid()}"
    # Acquire DB-level sync lock
    if not acquire_sync_lock(db, "sync_all", owner):
        logger.warning("Another sync is currently running. Aborting this run.")
        return {"error": "locked"}

    client = LL2Client()

    try:
        # Sync in order (agencies first, then pads/rockets, then launches)
        agencies_count = await sync_agencies(client, db)
        pads_count = await sync_pads(client, db)
        rockets_count = await sync_rockets(client, db)
        launches_count = await sync_launches(client, db)

        logger.info("✅ Full sync complete!")

        return {
            "agencies": agencies_count,
            "pads": pads_count,
            "rockets": rockets_count,
            "launches": launches_count
        }

    except Exception as e:
        logger.error(f"❌ Sync failed: {e}")
        raise

    finally:
        # Release lock and close client
        release_sync_lock(db, "sync_all", owner)
        await client.close()
