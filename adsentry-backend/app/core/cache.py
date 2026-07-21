"""
Simple in-process TTL (time-to-live) cache for dashboard and AI summary results.
Avoids the extra cachetools dependency by using a plain dict + timestamps.
Keys expire after TTL_SECONDS and are evicted lazily on next access.
"""

import time
import threading
from typing import Any

# Default time-to-live: 5 minutes
DEFAULT_TTL_SECONDS = 300

_store: dict[str, tuple[Any, float]] = {}
_lock = threading.Lock()


def cache_set(key: str, value: Any, ttl: int = DEFAULT_TTL_SECONDS) -> None:
    """Store *value* under *key* for up to *ttl* seconds."""
    with _lock:
        _store[key] = (value, time.monotonic() + ttl)


def cache_get(key: str) -> tuple[bool, Any]:
    """
    Retrieve a cached value.

    Returns
    -------
    (True, value)  if the key exists and has not expired.
    (False, None)  if the key is missing or has expired.
    """
    with _lock:
        entry = _store.get(key)
        if entry is None:
            return False, None
        value, expires_at = entry
        if time.monotonic() > expires_at:
            del _store[key]
            return False, None
        return True, value


def cache_delete(key: str) -> None:
    """Remove a key from the cache (no-op if absent)."""
    with _lock:
        _store.pop(key, None)


def cache_delete_prefix(prefix: str) -> None:
    """Remove all keys that start with *prefix*."""
    with _lock:
        to_delete = [k for k in _store if k.startswith(prefix)]
        for k in to_delete:
            del _store[k]
