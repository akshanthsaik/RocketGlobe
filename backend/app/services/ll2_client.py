import httpx
import asyncio
from typing import Optional, Dict, Any, List
from datetime import datetime
import logging


logger = logging.getLogger(__name__)


class LL2Client:
    """
    Launch Library 2 API client with rate limiting and retry logic.
    """
    
    def __init__(self, base_url: str = "https://ll.thespacedevs.com/2.3.0"):
        self.base_url = base_url
        self.client = httpx.AsyncClient(timeout=30.0, follow_redirects=True)
        self._last_request_time = 0
        self._min_request_interval = 2.0  # 2 seconds for dev endpoint
    
    async def _rate_limit(self):
        """Ensure we don't exceed rate limits."""
        current_time = asyncio.get_event_loop().time()
        time_since_last = current_time - self._last_request_time
        
        if time_since_last < self._min_request_interval:
            await asyncio.sleep(self._min_request_interval - time_since_last)
        
        self._last_request_time = asyncio.get_event_loop().time()
    
    async def _request(
        self,
        endpoint: str,
        params: Optional[Dict[str, Any]] = None,
        retries: int = 40
    ) -> Dict[str, Any]:
        """Make rate-limited request with retry logic."""
        await self._rate_limit()
        
        # Ensure trailing slash
        if not endpoint.endswith('/'):
            endpoint = endpoint + '/'
        
        url = f"{self.base_url}/{endpoint}"
        
        for attempt in range(retries):
            try:
                logger.info(f"📡 Requesting: {url} (attempt {attempt + 1}/{retries})")
                response = await self.client.get(url, params=params)
                response.raise_for_status()
                logger.info(f"✅ Success: {url}")
                return response.json()
            
            except httpx.HTTPStatusError as e:
                logger.error(f"❌ HTTP {e.response.status_code}: {url}")
                logger.error(f"Response body: {e.response.text[:500]}")
                
                if e.response.status_code == 429:  # Rate limited
                    wait_time = 2 ** attempt
                    logger.warning(f"Rate limited, waiting {wait_time}s...")
                    await asyncio.sleep(wait_time)
                    continue
                else:
                    raise
            
            except httpx.RequestError as e:
                logger.error(f"❌ Request error: {type(e).__name__}: {e}")
                if attempt < retries - 1:
                    wait_time = 2 ** attempt
                    logger.warning(f"Retrying in {wait_time}s...")
                    await asyncio.sleep(wait_time)
                    continue
                raise
            
            except Exception as e:
                logger.error(f"❌ Unexpected error: {type(e).__name__}: {e}")
                raise
        
        raise Exception(f"Failed after {retries} retries for {url}")
    
    async def get_agencies(
        self,
        limit: int = 1000,
        offset: int = 0
    ) -> Dict[str, Any]:
        """Fetch agencies from LL2."""
        return await self._request("agencies", params={"limit": limit, "offset": offset})
    
    async def get_pads(
        self,
        limit: int = 1000,
        offset: int = 0
    ) -> Dict[str, Any]:
        """Fetch launch pads from LL2."""
        return await self._request("pads", params={"limit": limit, "offset": offset})
    
    async def get_rockets(
        self,
        limit: int = 1000,
        offset: int = 0
    ) -> Dict[str, Any]:
        """Fetch rocket configurations from LL2."""
        return await self._request("launcher_configurations", params={"limit": limit, "offset": offset})
    
    async def get_launches(
        self,
        limit: int = 10000,
        offset: int = 0,
        net__gte: Optional[str] = None,
        net__lte: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Fetch launches from LL2."""
        params = {"limit": limit, "offset": offset}
        if net__gte:
            params["net__gte"] = net__gte
        if net__lte:
            params["net__lte"] = net__lte
        
        return await self._request("launches", params=params)
    
    async def close(self):
        """Close HTTP client."""
        await self.client.aclose()
