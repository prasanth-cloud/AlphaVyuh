"""Redis cache client for scanner indicator data."""
from __future__ import annotations

import json
import logging
import os

logger = logging.getLogger(__name__)

_redis_client = None
_redis_unavailable = False

SCANNER_CACHE_TTL = 6 * 60 * 60  # 6 hours


def _get_redis():
    global _redis_client, _redis_unavailable
    if _redis_unavailable:
        return None
    if _redis_client is not None:
        return _redis_client

    url = os.environ.get("REDIS_URL")
    if not url:
        _redis_unavailable = True
        logger.info("REDIS_URL not set — scanner cache disabled")
        return None

    try:
        import redis
        _redis_client = redis.from_url(url, decode_responses=True, socket_connect_timeout=3)
        _redis_client.ping()
        logger.info("Redis connected for scanner cache")
        return _redis_client
    except Exception as exc:
        _redis_unavailable = True
        logger.warning("Redis unavailable — scanner cache disabled: %s", exc)
        return None


def scanner_cache_key(trade_date: str) -> str:
    return f"scan:indicators:latest:{trade_date}"


def get_cached_rows(trade_date: str) -> list[dict] | None:
    r = _get_redis()
    if r is None:
        return None
    try:
        data = r.get(scanner_cache_key(trade_date))
        if data is not None:
            return json.loads(data)
    except Exception as exc:
        logger.warning("Redis GET failed: %s", exc)
    return None


def set_cached_rows(trade_date: str, rows: list[dict]) -> None:
    r = _get_redis()
    if r is None:
        return
    try:
        r.setex(scanner_cache_key(trade_date), SCANNER_CACHE_TTL, json.dumps(rows, default=str))
    except Exception as exc:
        logger.warning("Redis SET failed: %s", exc)


def invalidate_scanner_cache(trade_date: str) -> None:
    r = _get_redis()
    if r is None:
        return
    try:
        key = scanner_cache_key(trade_date)
        deleted = r.delete(key)
        if deleted:
            logger.info("Invalidated scanner cache for %s", trade_date)
    except Exception as exc:
        logger.warning("Redis DEL failed: %s", exc)
