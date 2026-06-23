from __future__ import annotations

import threading
import time
from collections import defaultdict


class RateLimiter:
    def __init__(self, max_calls: int, period: float):
        self.max_calls = max_calls
        self.period = period
        self._calls: dict[str, list[float]] = defaultdict(list)
        self._lock = threading.Lock()

    def is_allowed(self, key: str) -> bool:
        now = time.time()
        with self._lock:
            cutoff = now - self.period
            calls = [t for t in self._calls[key] if t > cutoff]
            self._calls[key] = calls
            if len(calls) >= self.max_calls:
                return False
            self._calls[key].append(now)
            return True

    def retry_after(self, key: str) -> int:
        now = time.time()
        with self._lock:
            cutoff = now - self.period
            calls = [t for t in self._calls[key] if t > cutoff]
            self._calls[key] = calls
            if len(calls) < self.max_calls:
                return 0
            return max(1, int(self.period - (now - min(calls))) + 1)


class PlanCache:
    def __init__(self, ttl: float = 60.0):
        self._cache: dict[str, tuple[float, str]] = {}
        self._lock = threading.Lock()
        self.ttl = ttl

    def get(self, user_id: str) -> str | None:
        with self._lock:
            if user_id in self._cache:
                ts, plan = self._cache[user_id]
                if time.time() - ts < self.ttl:
                    return plan
        return None

    def set(self, user_id: str, plan: str):
        with self._lock:
            self._cache[user_id] = (time.time(), plan)

    def invalidate(self, user_id: str):
        with self._lock:
            self._cache.pop(user_id, None)


# Singletons
scanner_limiter = RateLimiter(max_calls=30, period=60.0)   # 30 scans/minute per user
ai_limiter      = RateLimiter(max_calls=5,  period=300.0)  # 5 trade-review calls per 5 min per user
public_market_limiter = RateLimiter(max_calls=120, period=60.0)  # Provider-backed public quotes/candles
market_live_limiter = RateLimiter(max_calls=30, period=60.0)  # Authenticated provider-backed live status/sectors
public_options_limiter = RateLimiter(max_calls=60, period=60.0)  # Public options calculators
plan_cache      = PlanCache(ttl=60.0)


def client_rate_key(request, scope: str) -> str:
    """Build a coarse per-client key for public route protection."""
    # Public clients can spoof X-Forwarded-For unless the deployment proxy
    # overwrites it. Prefer the ASGI client address for provider-backed routes.
    client = getattr(request, "client", None)
    client_ip = getattr(client, "host", None) or "unknown"
    return f"{scope}:{client_ip}"
