import asyncio
import logging
import random
import re
from typing import Any, Dict, Optional

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


class LL2RateLimitError(Exception):
    def __init__(self, wait_seconds: float, max_wait_seconds: int, url: str):
        self.wait_seconds = wait_seconds
        self.max_wait_seconds = max_wait_seconds
        self.url = url
        super().__init__(
            f"LL2 rate limit window too long ({wait_seconds:.1f}s) for {url}; max allowed wait is {max_wait_seconds}s"
        )


class LL2Client:
    """
    Launch Library 2 API client with rate limiting and retry logic.
    """

    def __init__(
        self,
        base_url: Optional[str] = None,
        min_request_interval: Optional[float] = None,
        base_backoff: Optional[float] = None,
        max_backoff: Optional[float] = None,
        jitter_factor: float = 0.1,
        max_retries: Optional[int] = None,
        max_wait_seconds: Optional[int] = None,
        max_request_duration: Optional[int] = None,
    ):
        raw_base_url = (base_url or settings.LL2_BASE_URL).rstrip("/")
        if raw_base_url.endswith("/2.3.0"):
            self.base_url = raw_base_url
        else:
            self.base_url = f"{raw_base_url}/2.3.0"
        self.client = httpx.AsyncClient(timeout=30.0, follow_redirects=True)
        self._last_request_time = 0.0
        self._min_request_interval = (
            min_request_interval if min_request_interval is not None else settings.LL2_MIN_REQUEST_INTERVAL
        )
        self._base_min_request_interval = self._min_request_interval
        self.base_backoff = base_backoff if base_backoff is not None else settings.LL2_BASE_BACKOFF
        self.max_backoff = max_backoff if max_backoff is not None else settings.LL2_MAX_BACKOFF
        self.jitter_factor = jitter_factor
        self.max_retries = max_retries if max_retries is not None else settings.LL2_MAX_RETRIES
        self.max_wait_seconds = max_wait_seconds if max_wait_seconds is not None else settings.LL2_MAX_WAIT_SECONDS
        self.max_request_duration = (
            max_request_duration if max_request_duration is not None else settings.LL2_MAX_REQUEST_DURATION
        )

    @property
    def min_request_interval(self) -> float:
        """Current spacing between requests (self-adapts on 429s and successes)."""
        return self._min_request_interval

    @min_request_interval.setter
    def min_request_interval(self, value: float) -> None:
        self._min_request_interval = value

    @property
    def base_min_request_interval(self) -> float:
        """Floor that `min_request_interval` recovers back down to after a rate limit."""
        return self._base_min_request_interval

    @base_min_request_interval.setter
    def base_min_request_interval(self, value: float) -> None:
        self._base_min_request_interval = value

    async def _rate_limit(self):
        """Ensure we don't exceed rate limits (simple per-client spacing)."""
        current_time = asyncio.get_running_loop().time()
        time_since_last = current_time - self._last_request_time

        if time_since_last < self._min_request_interval:
            await asyncio.sleep(self._min_request_interval - time_since_last)

        self._last_request_time = asyncio.get_running_loop().time()

    async def _request(
        self,
        endpoint: str,
        params: Optional[Dict[str, Any]] = None,
        retries: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Make rate-limited request with robust retry/backoff logic.

        Behavior:
        - Honor `Retry-After` header when present on 429.
        - Honor `X-RateLimit-Reset` if provided.
        - Use exponential backoff (base_backoff * 2**attempt) with jitter and a max cap.
        - Handle network issues and 5xx server errors with retries.
        """
        # Ensure trailing slash
        if not endpoint.endswith("/"):
            endpoint = endpoint + "/"

        url = f"{self.base_url}/{endpoint}"
        retries = retries or self.max_retries
        request_started = asyncio.get_running_loop().time()

        for attempt in range(retries):
            # Ensure we respect spacing between calls
            await self._rate_limit()

            try:
                logger.info("Requesting: %s (attempt %s/%s)", url, attempt + 1, retries)
                response = await self.client.get(url, params=params)
                response.raise_for_status()

                # Recover to the baseline request interval after successful calls.
                self._min_request_interval = max(
                    self._base_min_request_interval,
                    self._min_request_interval * 0.8,
                )
                return response.json()

            except httpx.HTTPStatusError as e:
                status = e.response.status_code
                logger.error("HTTP %s: %s", status, url)
                logger.debug("Response headers: %s", e.response.headers)

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
                        wait_time = min(self.base_backoff * (2**attempt), self.max_backoff)

                    # Add jitter
                    jitter = random.uniform(0, self.jitter_factor * wait_time)
                    total_sleep = wait_time + jitter

                    # Fail fast when the server asks for a very long wait. This keeps
                    # sync responsive and surfaces actionable information to the user.
                    if wait_time > self.max_wait_seconds:
                        logger.warning(
                            "Rate limited for %.1fs which exceeds max wait %ss; aborting request",
                            wait_time,
                            self.max_wait_seconds,
                        )
                        raise LL2RateLimitError(wait_time, self.max_wait_seconds, url)

                    # Optionally increase spacing between requests temporarily
                    self._min_request_interval = max(self._min_request_interval, min(total_sleep, 30.0))

                    logger.warning(
                        "Rate limited (429). Waiting after Retry-After/backoff (base %.1fs, jitter %.2fs)",
                        wait_time,
                        jitter,
                    )
                    elapsed = asyncio.get_running_loop().time() - request_started
                    remaining = self.max_request_duration - elapsed
                    if remaining <= 0:
                        raise TimeoutError(f"Retry budget exceeded for {url} after {elapsed:.1f}s")
                    effective_sleep = min(total_sleep, remaining)
                    logger.warning(
                        "Rate limited (429). Sleeping %.1fs (remaining budget %.1fs)",
                        effective_sleep,
                        remaining,
                    )
                    total_sleep = effective_sleep
                    await asyncio.sleep(total_sleep)
                    continue

                # 5xx server errors - retry with backoff
                if 500 <= status < 600:
                    if attempt < retries - 1:
                        wait_time = min(self.base_backoff * (2**attempt), self.max_backoff)
                        jitter = random.uniform(0, self.jitter_factor * wait_time)
                        total_sleep = wait_time + jitter
                        logger.warning(
                            "Server error %s. Retrying after %.1fs backoff",
                            status,
                            total_sleep,
                        )
                        elapsed = asyncio.get_running_loop().time() - request_started
                        remaining = self.max_request_duration - elapsed
                        if remaining <= 0:
                            raise TimeoutError(f"Retry budget exceeded for {url} after {elapsed:.1f}s")
                        effective_sleep = min(total_sleep, remaining)
                        logger.warning(
                            "Server error %s. Sleeping %.1fs (remaining budget %.1fs)",
                            status,
                            effective_sleep,
                            remaining,
                        )
                        total_sleep = effective_sleep
                        await asyncio.sleep(total_sleep)
                        continue
                    raise

                # Other client errors: don't retry
                raise

            except httpx.RequestError as e:
                logger.error("Request error: %s: %s", type(e).__name__, e)
                if attempt < retries - 1:
                    wait_time = min(self.base_backoff * (2**attempt), self.max_backoff)
                    jitter = random.uniform(0, self.jitter_factor * wait_time)
                    total_sleep = wait_time + jitter
                    logger.warning(
                        "Network error, retrying after %.1fs backoff",
                        total_sleep,
                    )
                    elapsed = asyncio.get_running_loop().time() - request_started
                    remaining = self.max_request_duration - elapsed
                    if remaining <= 0:
                        raise TimeoutError(f"Retry budget exceeded for {url} after {elapsed:.1f}s")
                    effective_sleep = min(total_sleep, remaining)
                    logger.warning(
                        "Network error, sleeping %.1fs (remaining budget %.1fs)",
                        effective_sleep,
                        remaining,
                    )
                    total_sleep = effective_sleep
                    await asyncio.sleep(total_sleep)
                    continue
                raise

            except Exception as e:
                logger.error("Unexpected error: %s: %s", type(e).__name__, e)
                raise

        elapsed = asyncio.get_running_loop().time() - request_started
        raise Exception(f"Failed after {retries} retries for {url} ({elapsed:.1f}s elapsed)")

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
