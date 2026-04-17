from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone
from typing import Optional
import logging
from urllib.parse import parse_qs, urlparse

from app.config import settings
from app.services.ll2_client import LL2Client, LL2RateLimitError
from app.services.sync_state import get_last_sync, set_last_sync
from app.services.sync_lock import acquire_sync_lock, release_sync_lock
from app.services.sync_run import complete_sync_run, fail_sync_run, update_sync_run
from app.models import Agency, Pad, Rocket, Launch, SyncRun

logger = logging.getLogger(__name__)
SYNC_RESOURCES = ("agencies", "pads", "rockets", "launches")


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


def _get_next_offset(
    data: dict,
    current_offset: int,
    fallback_step: int,
    received_count: int,
) -> Optional[int]:
    next_url = data.get("next")
    if isinstance(next_url, str) and next_url:
        try:
            query = parse_qs(urlparse(next_url).query)
            raw_offset = query.get("offset")
            if raw_offset:
                next_offset = int(raw_offset[0])
                return next_offset if next_offset > current_offset else None
        except Exception:
            pass

    if received_count <= 0:
        return None

    step = received_count or fallback_step
    next_offset = current_offset + step

    total = data.get("count")
    if isinstance(total, int) and next_offset >= total:
        return None

    return next_offset


def _touch_sync_run(
    db: Session,
    run_id: Optional[str],
    *,
    current_resource: Optional[str] = None,
    message: Optional[str] = None,
    progress_done: Optional[int] = None,
    progress_total: Optional[int] = None,
    stats: Optional[dict] = None,
) -> None:
    if not run_id:
        return

    payload = {}
    if current_resource is not None:
        payload["current_resource"] = current_resource
    if message is not None:
        payload["message"] = message
    if progress_done is not None:
        payload["progress_done"] = progress_done
    if progress_total is not None:
        payload["progress_total"] = progress_total
    if stats is not None:
        payload["stats"] = stats

    if payload:
        update_sync_run(db, run_id, **payload)


def _normalize_utc(value: Optional[datetime]) -> Optional[datetime]:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def _should_skip_static_resource(db: Session, resource_name: str) -> bool:
    if resource_name == "launches":
        return False

    last_sync = _normalize_utc(get_last_sync(db, resource_name))
    if last_sync is None:
        return False

    age = datetime.now(timezone.utc) - last_sync
    return age < timedelta(seconds=settings.LL2_STATIC_RESOURCES_MIN_INTERVAL)


def _resolve_incremental_baseline(
    db: Session,
    resource_name: str,
    model_cls,
) -> Optional[datetime]:
    last_sync = _normalize_utc(get_last_sync(db, resource_name))
    if last_sync:
        return last_sync

    has_local_data = db.query(model_cls.id).limit(1).first() is not None
    if not has_local_data:
        return None

    lookback_hours = settings.LL2_EXISTING_DATA_LOOKBACK_HOURS
    if resource_name == "launches":
        # Launches are high-volume; use a tighter fallback window to keep
        # incremental recovery under LL2 rate limits.
        lookback_hours = min(lookback_hours, 6)

    fallback = datetime.now(timezone.utc) - timedelta(
        hours=lookback_hours
    )
    logger.info(
        "No sync_state baseline for %s but local data exists; using fallback updated__gte=%s (%sh lookback)",
        resource_name,
        fallback.isoformat(),
        lookback_hours,
    )
    return fallback


def _recent_launch_rate_limit_remaining(
    db: Session,
    current_run_id: Optional[str],
) -> Optional[int]:
    recent_runs = (
        db.query(SyncRun)
        .filter(SyncRun.run_id != current_run_id)
        .order_by(SyncRun.started_at.desc())
        .limit(10)
        .all()
    )

    now = datetime.now(timezone.utc)
    for run in recent_runs:
        stats = run.stats if isinstance(run.stats, dict) else {}
        rate_limited = stats.get("_rate_limited")
        if not isinstance(rate_limited, dict):
            continue

        raw_wait = rate_limited.get("launches")
        try:
            wait_seconds = int(float(raw_wait))
        except (TypeError, ValueError):
            continue

        if wait_seconds <= 0:
            continue
        # Normalize legacy runs that may have stored very large server windows.
        wait_seconds = min(wait_seconds, settings.LL2_LAUNCHES_MAX_WAIT_SECONDS)

        baseline = _normalize_utc(run.finished_at or run.updated_at or run.started_at)
        if baseline is None:
            continue

        elapsed = (now - baseline).total_seconds()
        remaining = int(round(wait_seconds - elapsed))
        if remaining > 0:
            return remaining

    return None


async def sync_agencies(client: LL2Client, db: Session, run_id: Optional[str] = None) -> int:
    """Incremental sync for agencies from LL2 to database using bulk upserts."""
    logger.info("Syncing agencies (incremental)...")
    count = 0
    offset = 0
    limit = settings.LL2_SYNC_PAGE_LIMIT

    last_sync = _resolve_incremental_baseline(db, "agencies", Agency)

    max_seen_ts = None

    while True:
        _touch_sync_run(
            db,
            run_id,
            current_resource="agencies",
            message=f"Syncing agencies page at offset {offset}",
        )

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
        next_offset = _get_next_offset(data, offset, limit, len(results))
        if next_offset is None:
            break
        offset = next_offset

    # If we saw updates, set last sync to most recent updated timestamp; else set to now()
    if max_seen_ts:
        set_last_sync(db, "agencies", max_seen_ts)
    else:
        # Use timezone-aware UTC to avoid naive/aware mixing
        set_last_sync(db, "agencies", datetime.now(timezone.utc))

    logger.info(f"Synced {count} agencies (incremental)")
    return count


async def sync_pads(client: LL2Client, db: Session, run_id: Optional[str] = None) -> int:
    """Incremental sync for pads using bulk upserts. After bulk insert we update `location` in Postgres using PostGIS functions in a single UPDATE statement."""
    logger.info("Syncing pads (incremental)...")
    count = 0
    offset = 0
    limit = settings.LL2_SYNC_PAGE_LIMIT

    last_sync = _resolve_incremental_baseline(db, "pads", Pad)

    max_seen_ts = None

    while True:
        _touch_sync_run(
            db,
            run_id,
            current_resource="pads",
            message=f"Syncing pads page at offset {offset}",
        )

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

        next_offset = _get_next_offset(data, offset, limit, len(results))
        if next_offset is None:
            break
        offset = next_offset

    if max_seen_ts:
        set_last_sync(db, "pads", max_seen_ts)
    else:
        set_last_sync(db, "pads", datetime.now(timezone.utc))

    logger.info(f"Synced {count} pads (incremental)")
    return count


async def sync_rockets(client: LL2Client, db: Session, run_id: Optional[str] = None) -> int:
    """Incremental sync for rockets using bulk upserts and prefetching manufacturers."""
    logger.info("Syncing rockets (incremental)...")
    count = 0
    offset = 0
    limit = settings.LL2_SYNC_PAGE_LIMIT

    last_sync = _resolve_incremental_baseline(db, "rockets", Rocket)

    max_seen_ts = None

    while True:
        _touch_sync_run(
            db,
            run_id,
            current_resource="rockets",
            message=f"Syncing rockets page at offset {offset}",
        )

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
        next_offset = _get_next_offset(data, offset, limit, len(results))
        if next_offset is None:
            break
        offset = next_offset

    if max_seen_ts:
        set_last_sync(db, "rockets", max_seen_ts)
    else:
        set_last_sync(db, "rockets", datetime.now(timezone.utc))

    logger.info(f"Synced {count} rockets (incremental)")
    return count


async def sync_launches(client: LL2Client, db: Session, run_id: Optional[str] = None) -> int:
    """Incremental sync for launches using bulk upserts and prefetch of related objects."""
    logger.info("Syncing launches (incremental)...")
    count = 0
    offset = 0
    limit = settings.LL2_SYNC_PAGE_LIMIT

    # Launches are the heaviest resource. Use a more tolerant request budget so
    # rate-limit bursts don't fail the entire sync too aggressively.
    original_min_interval = client._min_request_interval
    original_base_min_interval = client._base_min_request_interval
    original_max_retries = client.max_retries
    original_max_wait_seconds = client.max_wait_seconds
    original_max_request_duration = client.max_request_duration

    client._base_min_request_interval = max(
        client._base_min_request_interval,
        settings.LL2_LAUNCHES_MIN_REQUEST_INTERVAL,
    )
    client._min_request_interval = max(
        client._min_request_interval,
        settings.LL2_LAUNCHES_MIN_REQUEST_INTERVAL,
    )
    client.max_retries = max(client.max_retries, settings.LL2_LAUNCHES_MAX_RETRIES)
    client.max_wait_seconds = max(
        client.max_wait_seconds,
        settings.LL2_LAUNCHES_MAX_WAIT_SECONDS,
    )
    client.max_request_duration = max(
        client.max_request_duration,
        settings.LL2_LAUNCHES_MAX_REQUEST_DURATION,
    )

    logger.info(
        "Launches sync request budget: min_interval=%.2fs retries=%s max_wait=%ss max_duration=%ss",
        client._min_request_interval,
        client.max_retries,
        client.max_wait_seconds,
        client.max_request_duration,
    )

    last_sync = _resolve_incremental_baseline(db, "launches", Launch)

    max_seen_ts = None

    try:
        while True:
            _touch_sync_run(
                db,
                run_id,
                current_resource="launches",
                message=f"Syncing launches page at offset {offset}",
            )

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
                    mapping["raw_data"] = item
                    insert_mappings.append(mapping)

                count += 1

            if insert_mappings:
                db.bulk_insert_mappings(Launch, insert_mappings)
            if update_mappings:
                db.bulk_update_mappings(Launch, update_mappings)

            db.commit()
            next_offset = _get_next_offset(data, offset, limit, len(results))
            if next_offset is None:
                break
            offset = next_offset

        if max_seen_ts:
            set_last_sync(db, "launches", max_seen_ts)
        else:
            set_last_sync(db, "launches", datetime.now(timezone.utc))

        logger.info(f"Synced {count} launches (incremental)")
        return count
    finally:
        client._min_request_interval = original_min_interval
        client._base_min_request_interval = original_base_min_interval
        client.max_retries = original_max_retries
        client.max_wait_seconds = original_max_wait_seconds
        client.max_request_duration = original_max_request_duration



async def sync_all(db: Session, run_id: Optional[str] = None) -> dict:
    """Sync all data from Launch Library 2 using a DB lock to prevent concurrent runs."""
    logger.info("Starting full sync from Launch Library 2...")

    owner = f"sync_all:pid:{__import__('os').getpid()}"
    # Acquire DB-level sync lock
    if not acquire_sync_lock(db, "sync_all", owner):
        logger.warning("Another sync is currently running. Aborting this run.")
        if run_id:
            update_sync_run(
                db,
                run_id,
                status="blocked",
                is_active=False,
                message="Sync blocked: another sync already holds the lock",
                error="sync_lock_conflict",
                finished_at=datetime.now(timezone.utc),
            )
        return {"error": "locked"}

    client = LL2Client()
    results = {"agencies": 0, "pads": 0, "rockets": 0, "launches": 0}
    skipped_resources = []
    rate_limited_resources = {}

    _touch_sync_run(
        db,
        run_id,
        current_resource="agencies",
        message="Sync started",
        progress_done=0,
        progress_total=len(SYNC_RESOURCES),
        stats={
            **results,
            "_skipped": skipped_resources.copy(),
            "_rate_limited": rate_limited_resources.copy(),
        },
    )
    if run_id:
        update_sync_run(db, run_id, status="running", is_active=True)

    try:
        # Sync in order (agencies first, then pads/rockets, then launches)
        resources = [
            ("agencies", sync_agencies),
            ("pads", sync_pads),
            ("rockets", sync_rockets),
            ("launches", sync_launches),
        ]

        for index, (resource_name, sync_fn) in enumerate(resources, start=1):
            if _should_skip_static_resource(db, resource_name):
                skipped_resources.append(resource_name)
                _touch_sync_run(
                    db,
                    run_id,
                    current_resource=resource_name,
                    message=f"Skipping {resource_name}: synced recently",
                    progress_done=index,
                    progress_total=len(resources),
                    stats={
                        **results,
                        "_skipped": skipped_resources.copy(),
                        "_rate_limited": rate_limited_resources.copy(),
                    },
                )
                logger.info(
                    "Skipping %s sync because last sync is within %ss",
                    resource_name,
                    settings.LL2_STATIC_RESOURCES_MIN_INTERVAL,
                )
                continue

            if resource_name == "launches":
                remaining_rate_limit = _recent_launch_rate_limit_remaining(db, run_id)
                if remaining_rate_limit:
                    skipped_resources.append("launches:rate_limit_cooldown")
                    rate_limited_resources["launches"] = remaining_rate_limit
                    _touch_sync_run(
                        db,
                        run_id,
                        current_resource=resource_name,
                        message=(
                            f"Skipping launches: LL2 cooldown active "
                            f"({remaining_rate_limit}s remaining)"
                        ),
                        progress_done=index,
                        progress_total=len(resources),
                        stats={
                            **results,
                            "_skipped": skipped_resources.copy(),
                            "_rate_limited": rate_limited_resources.copy(),
                        },
                    )
                    logger.info(
                        "Skipping launches sync due recent LL2 cooldown (%ss remaining)",
                        remaining_rate_limit,
                    )
                    continue

            _touch_sync_run(
                db,
                run_id,
                current_resource=resource_name,
                message=f"Syncing {resource_name} ({index}/{len(resources)})",
                progress_done=index - 1,
                progress_total=len(resources),
                stats={
                    **results,
                    "_skipped": skipped_resources.copy(),
                    "_rate_limited": rate_limited_resources.copy(),
                },
            )

            try:
                results[resource_name] = await sync_fn(client, db, run_id=run_id)
            except LL2RateLimitError as rate_limit_error:
                if not settings.LL2_ALLOW_PARTIAL_SYNC_ON_RATE_LIMIT:
                    raise

                skipped_resources.append(f"{resource_name}:rate_limited")
                bounded_wait = min(
                    rate_limit_error.wait_seconds,
                    float(rate_limit_error.max_wait_seconds),
                )
                rate_limited_resources[resource_name] = int(max(1, round(bounded_wait)))
                logger.warning(
                    "Skipping %s due LL2 rate limit window %.1fs (max allowed %ss)",
                    resource_name,
                    rate_limit_error.wait_seconds,
                    rate_limit_error.max_wait_seconds,
                )

                # Avoid repeatedly hammering LL2 when launch baseline is stale/missing.
                if resource_name == "launches":
                    # Keep a short fallback baseline so retry runs do not request an
                    # overly large launch delta while LL2 is throttling us.
                    fallback = datetime.now(timezone.utc) - timedelta(
                        hours=1
                    )
                    set_last_sync(db, "launches", fallback)

                _touch_sync_run(
                    db,
                    run_id,
                    current_resource=resource_name,
                    message=(
                        f"Skipped {resource_name}: LL2 rate-limited "
                        f"({rate_limit_error.wait_seconds:.0f}s window)"
                    ),
                    progress_done=index,
                    progress_total=len(resources),
                    stats={
                        **results,
                        "_skipped": skipped_resources.copy(),
                        "_rate_limited": rate_limited_resources.copy(),
                    },
                )
                continue

            _touch_sync_run(
                db,
                run_id,
                current_resource=resource_name,
                message=f"Finished {resource_name} ({index}/{len(resources)})",
                progress_done=index,
                progress_total=len(resources),
                stats={
                    **results,
                    "_skipped": skipped_resources.copy(),
                    "_rate_limited": rate_limited_resources.copy(),
                },
            )

        logger.info("Full sync complete")
        if run_id:
            had_rate_limit_skip = bool(rate_limited_resources)
            completion_status = "partial" if had_rate_limit_skip else "success"
            if had_rate_limit_skip:
                completion_message = "Sync completed with rate-limit skips"
            elif skipped_resources:
                completion_message = "Sync completed with skips"
            else:
                completion_message = "Sync completed successfully"
            complete_sync_run(
                db,
                run_id,
                status=completion_status,
                message=completion_message,
                stats={
                    **results,
                    "_skipped": skipped_resources.copy(),
                    "_rate_limited": rate_limited_resources.copy(),
                },
            )

        return results

    except Exception as e:
        logger.error("Sync failed: %s", e)
        if run_id:
            fail_sync_run(db, run_id, f"{type(e).__name__}: {e}")
        raise

    finally:
        # Release lock and close client
        release_sync_lock(db, "sync_all", owner)
        await client.close()
