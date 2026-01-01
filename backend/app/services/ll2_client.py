import httpx
import asyncio
import random
import re
from typing import Optional, Dict, Any, List
from datetime import datetime
import logging


logger = logging.getLogger(__name__)


class LL2Client:
    """
    Launch Library 2 API client with rate limiting and retry logic.
    """
    
    def __init__(
        self,
        base_url: str = "https://ll.thespacedevs.com/2.3.0",
        min_request_interval: float = 2.0,
        base_backoff: float = 1.0,
        max_backoff: float = 120.0,
        jitter_factor: float = 0.1,
    ):
        self.base_url = base_url
        self.client = httpx.AsyncClient(timeout=30.0, follow_redirects=True)
        self._last_request_time = 0
        self._min_request_interval = min_request_interval
        self.base_backoff = base_backoff
        self.max_backoff = max_backoff
        self.jitter_factor = jitter_factor

    async def _rate_limit(self):
        """Ensure we don't exceed rate limits (simple per-client spacing)."""
        current_time = asyncio.get_event_loop().time()
        time_since_last = current_time - self._last_request_time

        if time_since_last < self._min_request_interval:
            await asyncio.sleep(self._min_request_interval - time_since_last)

        self._last_request_time = asyncio.get_event_loop().time()

    async def _request(
        self,
        endpoint: str,
        params: Optional[Dict[str, Any]] = None,
        retries: int = 40,
    ) -> Dict[str, Any]:
        """Make rate-limited request with robust retry/backoff logic.

        Behavior:
        - Honor `Retry-After` header when present on 429.
        - Honor `X-RateLimit-Reset` if provided.
        - Use exponential backoff (base_backoff * 2**attempt) with jitter and a max cap.
        - Handle network issues and 5xx server errors with retries.
        """
        # Ensure trailing slash
        if not endpoint.endswith('/'):
            endpoint = endpoint + '/'

        url = f"{self.base_url}/{endpoint}"

        for attempt in range(retries):
            # Ensure we respect spacing between calls
            await self._rate_limit()

            try:
                logger.info(f"📡 Requesting: {url} (attempt {attempt + 1}/{retries})")
                response = await self.client.get(url, params=params)
                response.raise_for_status()
                logger.info(f"✅ Success: {url}")
                return response.json()

            except httpx.HTTPStatusError as e:
                status = e.response.status_code
                logger.error(f"❌ HTTP {status}: {url}")
                logger.debug(f"Response headers: {e.response.headers}")
                logger.error(f"Response body: {e.response.text[:500]}")

                # 429: Rate limited
                if status == 429:
                    wait_time = None

                    # Respect Retry-After header if present
                    ra = e.response.headers.get("Retry-After")
                    if ra:
                        try:
                            wait_time = float(ra)
                        except ValueError:
                            # Could be HTTP date; try to compute delta
                            try:
                                import email.utils as eut
                                import time as _time

                                parsed = eut.parsedate_to_datetime(ra)
                                wait_time = max(0, (parsed.timestamp() - _time.time()))
                            except Exception:
                                wait_time = None

                    # Check X-RateLimit-Reset (epoch seconds)
                    if wait_time is None:
                        rr = e.response.headers.get("X-RateLimit-Reset") or e.response.headers.get("RateLimit-Reset")
                        if rr:
                            try:
                                import time as _time
                                reset = float(rr)
                                wait_time = max(0, reset - _time.time())
                            except Exception:
                                wait_time = None

                    if wait_time is None:
                        # Try to extract a suggested wait time from the response body (LL2 sometimes returns a message)
                        try:
                            text = e.response.text or ""
                            m = re.search(r"Expected available in\s*(\d+)\s*seconds", text)
                            if m:
                                wait_time = float(m.group(1))
                        except Exception:
                            wait_time = None

                    if wait_time is None:
                        # Fall back to exponential backoff
                        wait_time = min(self.base_backoff * (2 ** attempt), self.max_backoff)

                    # Add jitter
                    jitter = random.uniform(0, self.jitter_factor * wait_time)
                    total_sleep = wait_time + jitter

                    # If wait time is very long (e.g., >5 minutes), abort so caller can decide to retry later
                    if total_sleep > 300:
                        logger.warning(f"Rate limited long-term: suggested wait {total_sleep:.1f}s; aborting run to allow manual retry later.")
                        raise Exception(f"Rate limited long-term: suggested wait {int(total_sleep)} seconds")

                    # Optionally increase spacing between requests temporarily
                    try:
                        self._min_request_interval = max(self._min_request_interval, total_sleep)
                    except Exception:
                        pass

                    logger.warning(f"Rate limited (429). Sleeping {total_sleep:.1f}s (base {wait_time:.1f}s, jitter {jitter:.2f}s)")
                    await asyncio.sleep(total_sleep)
                    continue

                # 5xx server errors - retry with backoff
                if 500 <= status < 600:
                    if attempt < retries - 1:
                        wait_time = min(self.base_backoff * (2 ** attempt), self.max_backoff)
                        jitter = random.uniform(0, self.jitter_factor * wait_time)
                        total_sleep = wait_time + jitter
                        logger.warning(f"Server error {status}. Retrying in {total_sleep:.1f}s...")
                        await asyncio.sleep(total_sleep)
                        continue
                    raise

                # Other client errors: don't retry
                raise

            except httpx.RequestError as e:
                logger.error(f"❌ Request error: {type(e).__name__}: {e}")
                if attempt < retries - 1:
                    wait_time = min(self.base_backoff * (2 ** attempt), self.max_backoff)
                    jitter = random.uniform(0, self.jitter_factor * wait_time)
                    total_sleep = wait_time + jitter
                    logger.warning(f"Network error, retrying in {total_sleep:.1f}s...")
                    await asyncio.sleep(total_sleep)
                    continue
                raise

            except Exception as e:
                logger.error(f"❌ Unexpected error: {type(e).__name__}: {e}")
                raise

        raise Exception(f"Failed after {retries} retries for {url}")
    
    async def get_agencies(
        self,
        limit: int = 1000,
        offset: int = 0,
        params: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Fetch agencies from LL2. Extra `params` are forwarded to the API to support filters like `updated__gte`."""
        base = {"limit": limit, "offset": offset}
        if params:
            base.update(params)
        return await self._request("agencies", params=base)
    
    async def get_pads(
        self,
        limit: int = 1000,
        offset: int = 0,
        params: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Fetch launch pads from LL2."""
        base = {"limit": limit, "offset": offset}
        if params:
            base.update(params)
        return await self._request("pads", params=base)
    
    async def get_rockets(
        self,
        limit: int = 1000,
        offset: int = 0,
        params: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Fetch rocket configurations from LL2."""
        base = {"limit": limit, "offset": offset}
        if params:
            base.update(params)
        return await self._request("launcher_configurations", params=base)
    
    async def get_launches(
        self,
        limit: int = 10000,
        offset: int = 0,
        net__gte: Optional[str] = None,
        net__lte: Optional[str] = None,
        params: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Fetch launches from LL2. Additional `params` can be forwarded for filtering like `updated__gte`."""
        base = {"limit": limit, "offset": offset}
        if net__gte:
            base["net__gte"] = net__gte
        if net__lte:
            base["net__lte"] = net__lte
        if params:
            base.update(params)
        return await self._request("launches", params=base)
    
    async def close(self):
        """Close HTTP client."""
        await self.client.aclose()
