from datetime import datetime, timezone
from typing import Optional


def normalize_utc(value: Optional[datetime]) -> Optional[datetime]:
    """Attach UTC tzinfo to a naive datetime; pass tz-aware values through unchanged."""
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value
