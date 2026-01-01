import asyncio
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from geoalchemy2 import WKTElement
import logging

from app.database import SessionLocal
from app.services.ll2_client import LL2Client
from app.models import Agency, Pad, Rocket, Launch

logger = logging.getLogger(__name__)


async def sync_agencies(client: LL2Client, db: Session) -> int:
    """Sync agencies from LL2 to database."""
    logger.info("Syncing agencies...")
    count = 0
    offset = 0
    limit = 100
    
    while True:
        data = await client.get_agencies(limit=limit, offset=offset)
        results = data.get("results", [])
        
        if not results:
            break
        
        for item in results:
            agency = db.query(Agency).filter(Agency.ll2_id == item["id"]).first()
            
            if not agency:
                agency = Agency(ll2_id=item["id"])
            
            # Basic fields
            agency.name = item.get("name", "")
            agency.abbrev = item.get("abbrev")
            agency.description = item.get("description")
            agency.administrator = item.get("administrator")
            agency.founding_year = item.get("founding_year")
            agency.is_active = not item.get("inactive", False)
            
            # Handle type (nested object)
            agency_type = item.get("type")
            if isinstance(agency_type, dict):
                agency.type = agency_type.get("name")
            else:
                agency.type = agency_type
            
            # Handle country (array of objects in v2.3.0!)
            countries = item.get("country", [])
            if countries and isinstance(countries, list) and len(countries) > 0:
                # Take first country's alpha_3_code
                agency.country_code = countries[0].get("alpha_3_code")
            
            # Handle logo (nested image object)
            logo = item.get("logo")
            if logo and isinstance(logo, dict):
                agency.logo_url = logo.get("image_url")
            
            db.add(agency)
            count += 1
        
        db.commit()
        offset += limit
        
        if offset >= data.get("count", 0):
            break
    
    logger.info(f"Synced {count} agencies")
    return count


async def sync_pads(client: LL2Client, db: Session) -> int:
    """Sync launch pads from LL2 to database."""
    logger.info("Syncing launch pads...")
    count = 0
    offset = 0
    limit = 100
    
    while True:
        data = await client.get_pads(limit=limit, offset=offset)
        results = data.get("results", [])
        
        if not results:
            break
        
        for item in results:
            pad = db.query(Pad).filter(Pad.ll2_id == item["id"]).first()
            
            if not pad:
                pad = Pad(ll2_id=item["id"])
            
            pad.name = item.get("name", "")
            
            # Handle coordinates
            try:
                lat = item.get("latitude")
                lon = item.get("longitude")
                
                if lat is not None and lon is not None:
                    pad.latitude = float(lat)
                    pad.longitude = float(lon)
                    pad.location = WKTElement(f'POINT({pad.longitude} {pad.latitude})', srid=4326)
                else:
                    logger.warning(f"⚠️  Skipping pad '{item.get('name')}' - no coordinates")
                    continue
                    
            except (ValueError, TypeError) as e:
                logger.warning(f"⚠️  Invalid coordinates for pad '{item.get('name')}': {e}")
                continue
            
            # Handle country (nested object)
            country = item.get("country")
            if country and isinstance(country, dict):
                pad.country_code = country.get("alpha_3_code")
            
            pad.map_url = item.get("map_url")
            pad.total_launch_count = item.get("total_launch_count", 0)
            
            # Link to agency if available
            location = item.get("location", {})
            if location:
                # Extract agency from location if needed
                pass
            
            db.add(pad)
            count += 1
        
        db.commit()
        offset += limit
        
        if offset >= data.get("count", 0):
            break
    
    logger.info(f"Synced {count} pads")
    return count


async def sync_rockets(client: LL2Client, db: Session) -> int:
    """Sync rocket configurations from LL2 to database."""
    logger.info("Syncing rockets...")
    count = 0
    offset = 0
    limit = 100
    
    while True:
        data = await client.get_rockets(limit=limit, offset=offset)
        results = data.get("results", [])
        
        if not results:
            break
        
        for item in results:
            rocket = db.query(Rocket).filter(Rocket.ll2_id == item["id"]).first()
            
            if not rocket:
                rocket = Rocket(ll2_id=item["id"])
            
            # Basic fields
            rocket.name = item.get("name", "")
            rocket.full_name = item.get("full_name")
            rocket.variant = item.get("variant")
            rocket.description = item.get("description")
            
            # Handle families (array of objects)
            families = item.get("families", [])
            if families and isinstance(families, list) and len(families) > 0:
                # Take first family name
                rocket.family = families[0].get("name", "")
            
            # Handle manufacturer (nested object)
            manufacturer = item.get("manufacturer")
            if manufacturer and isinstance(manufacturer, dict):
                manufacturer_ll2_id = manufacturer.get("id")
                if manufacturer_ll2_id:
                    agency = db.query(Agency).filter(Agency.ll2_id == manufacturer_ll2_id).first()
                    if agency:
                        rocket.manufacturer_id = agency.id
            
            # Specifications
            rocket.length = item.get("length")
            rocket.diameter = item.get("diameter")
            rocket.launch_mass = item.get("launch_mass")
            rocket.leo_capacity = item.get("leo_capacity")
            rocket.gto_capacity = item.get("gto_capacity")
            rocket.thrust = item.get("to_thrust")
            rocket.is_reusable = item.get("reusable", False)
            rocket.is_active = item.get("active", True)
            
            db.add(rocket)
            count += 1
        
        db.commit()
        offset += limit
        
        if offset >= data.get("count", 0):
            break
    
    logger.info(f"Synced {count} rockets")
    return count


async def sync_launches(client: LL2Client, db: Session) -> int:
    """Sync ALL launches from LL2 to database - full history."""
    logger.info("Syncing ALL launches from history...")
    count = 0
    offset = 0
    limit = 10000
    
    while True:
        data = await client.get_launches(
            limit=limit, 
            offset=offset
        )
        results = data.get("results", [])
        
        if not results:
            break
        
        for item in results:
            launch = db.query(Launch).filter(Launch.ll2_id == item["id"]).first()
            
            if not launch:
                launch = Launch(ll2_id=item["id"])
            
            # Basic fields
            launch.name = item.get("name", "")
            launch.slug = item.get("slug")
            launch.net = item.get("net")
            launch.window_start = item.get("window_start")
            launch.window_end = item.get("window_end")
            
            # Handle status (nested object)
            status = item.get("status")
            if status and isinstance(status, dict):
                launch.status = status.get("name")
            
            # Handle image (nested object)
            image = item.get("image")
            if image and isinstance(image, dict):
                launch.image_url = image.get("image_url")
            
            # Handle pad (nested object)
            pad_data = item.get("pad")
            if pad_data and isinstance(pad_data, dict):
                pad_ll2_id = pad_data.get("id")
                pad = db.query(Pad).filter(Pad.ll2_id == pad_ll2_id).first()
                if pad:
                    launch.pad_id = pad.id
            
            # Handle rocket (nested configuration)
            rocket_data = item.get("rocket", {})
            if rocket_data:
                config = rocket_data.get("configuration")
                if config and isinstance(config, dict):
                    rocket_ll2_id = config.get("id")
                    rocket = db.query(Rocket).filter(Rocket.ll2_id == rocket_ll2_id).first()
                    if rocket:
                        launch.rocket_id = rocket.id
            
            # Handle launch service provider (agency)
            lsp = item.get("launch_service_provider")
            if lsp and isinstance(lsp, dict):
                lsp_ll2_id = lsp.get("id")
                agency = db.query(Agency).filter(Agency.ll2_id == lsp_ll2_id).first()
                if agency:
                    launch.agency_id = agency.id
            
            db.add(launch)
            count += 1
        
        db.commit()
        
        # Log progress every 1000 launches
        if count % 10000 == 0:
            logger.info(f"Synced {count} launches so far...")
        
        offset += limit
        
        # Check if we've reached the end
        total_count = data.get("count", 0)
        if offset >= total_count:
            logger.info(f"Reached end: {count}/{total_count} launches")
            break
    
    logger.info(f"COMPLETE! Synced {count} total launches")
    return count



async def sync_all(db: Session) -> dict:
    """Sync all data from Launch Library 2."""
    logger.info("Starting full sync from Launch Library 2...")
    
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
        await client.close()
