from sqlalchemy.orm import Session
from datetime import datetime, timezone
from typing import Optional
import logging

from app.services.ll2_client import LL2Client
from app.services.sync_state import get_last_sync, set_last_sync
from app.services.sync_lock import acquire_sync_lock, release_sync_lock
from app.models import Agency, Pad, Rocket, Launch

logger = logging.getLogger(__name__)


def _parse_ll2_date(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except Exception:
        return None


def _extract_country_code(country_data) -> Optional[str]:
    if isinstance(country_data, list):
        for entry in country_data:
            code = _extract_country_code(entry)
            if code:
                return code
        return None

    if not isinstance(country_data, dict):
        return None

    # Prefer alpha-2 for map compatibility, keep alpha-3 fallback.
    return country_data.get("alpha_2_code") or country_data.get("alpha_3_code")


def _extract_video_url(item: dict) -> Optional[str]:
    for key in ("vidURLs", "vid_urls", "vidURL", "video_url", "webcast_url", "webcast"):
        value = item.get(key)
        if isinstance(value, str) and value:
            return value
        if isinstance(value, list):
            for candidate in value:
                if isinstance(candidate, str) and candidate:
                    return candidate
    return None


async def sync_agencies(client: LL2Client, db: Session) -> int:
    """Incremental sync for agencies from LL2 to database using bulk upserts."""
    logger.info("Syncing agencies (incremental)...")
    count = 0
    offset = 0
    limit = 500

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
            country_code = _extract_country_code(countries)
            if country_code:
                mapping["country_code"] = country_code

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
        changed_ll2_ids = set()

        for item in results:
            item_id = item.get("id")
            if item_id is None:
                continue

            updated_ts = _parse_ll2_date(item.get("updated") or item.get("modified"))

            if updated_ts:
                if max_seen_ts is None or updated_ts > max_seen_ts:
                    max_seen_ts = updated_ts
                if last_sync and updated_ts <= last_sync:
                    continue

            # Coordinates
            lat = item.get("latitude")
            lon = item.get("longitude")
            if lat is None or lon is None:
                logger.warning("Skipping pad '%s' - no coordinates", item.get("name"))
                continue

            try:
                lat_val = float(lat)
                lon_val = float(lon)
            except (ValueError, TypeError):
                logger.warning(
                    "Invalid coordinates for pad '%s': %s,%s",
                    item.get("name"),
                    lat,
                    lon,
                )
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
            country_code = _extract_country_code(country)
            if country_code:
                mapping["country_code"] = country_code

            if item_id in existing:
                mapping["id"] = existing[item_id].id
                update_mappings.append(mapping)
            else:
                insert_mappings.append(mapping)

            changed_ll2_ids.add(item_id)
            count += 1

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

        if dialect_name == 'postgresql' and changed_ll2_ids:
            rows = db.query(Pad).filter(Pad.ll2_id.in_(list(changed_ll2_ids))).all()
            changed_ids = [r.id for r in rows]
            if changed_ids:
                from geoalchemy2.functions import ST_SetSRID, ST_MakePoint
                db.query(Pad).filter(Pad.id.in_(changed_ids)).update(
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

            updated_ts = _parse_ll2_date(item.get("updated") or item.get("modified"))

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

            updated_ts = _parse_ll2_date(item.get("updated") or item.get("modified"))
            if updated_ts:
                if max_seen_ts is None or updated_ts > max_seen_ts:
                    max_seen_ts = updated_ts
                if last_sync and updated_ts <= last_sync:
                    continue

            image_data = item.get("image")
            if isinstance(image_data, dict):
                image_url = image_data.get("image_url") or image_data.get("url")
            elif isinstance(image_data, str):
                image_url = image_data
            else:
                image_url = None

            mission = item.get("mission") if isinstance(item.get("mission"), dict) else {}
            mission_type = mission.get("type") if isinstance(mission, dict) else None
            if isinstance(mission_type, dict):
                mission_type = mission_type.get("name")

            orbit = mission.get("orbit") if isinstance(mission, dict) else None
            if isinstance(orbit, dict):
                orbit = orbit.get("name")

            mapping = {
                "ll2_id": str(item_id),
                "name": item.get("name", ""),
                "net": _parse_ll2_date(item.get("net")),
                "window_start": _parse_ll2_date(item.get("window_start")),
                "window_end": _parse_ll2_date(item.get("window_end")),
                "status": (item.get("status") or {}).get("name") if item.get("status") else None,
                "image_url": image_url,
                "mission_name": mission.get("name") if isinstance(mission, dict) else None,
                "mission_description": mission.get("description") if isinstance(mission, dict) else None,
                "mission_type": mission_type,
                "orbit": orbit,
                "webcast_live": bool(item.get("webcast_live")) if item.get("webcast_live") is not None else None,
                "video_url": _extract_video_url(item),
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

        logger.info("Full sync complete")

        return {
            "agencies": agencies_count,
            "pads": pads_count,
            "rockets": rockets_count,
            "launches": launches_count
        }

    except Exception as e:
        logger.error("Sync failed: %s", e)
        raise

    finally:
        # Release lock and close client
        release_sync_lock(db, "sync_all", owner)
        await client.close()
