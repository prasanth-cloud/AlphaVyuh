"""Tests for rate limiter and plan cache."""
import time
import threading
import pytest
from app.services.rate_limit import RateLimiter, PlanCache


class TestRateLimiter:
    def test_allows_calls_under_limit(self):
        limiter = RateLimiter(max_calls=5, period=60.0)
        for _ in range(5):
            assert limiter.is_allowed("user1") is True

    def test_blocks_when_over_limit(self):
        limiter = RateLimiter(max_calls=3, period=60.0)
        for _ in range(3):
            limiter.is_allowed("user1")
        assert limiter.is_allowed("user1") is False
        assert 0 < limiter.retry_after("user1") <= 60

    def test_retry_after_is_zero_when_under_limit(self):
        limiter = RateLimiter(max_calls=3, period=60.0)
        limiter.is_allowed("user1")
        assert limiter.retry_after("user1") == 0

    def test_different_users_independent(self):
        limiter = RateLimiter(max_calls=2, period=60.0)
        limiter.is_allowed("a")
        limiter.is_allowed("a")
        assert limiter.is_allowed("a") is False
        assert limiter.is_allowed("b") is True  # user b unaffected

    def test_window_slides(self):
        limiter = RateLimiter(max_calls=2, period=0.2)
        limiter.is_allowed("user1")
        limiter.is_allowed("user1")
        assert limiter.is_allowed("user1") is False
        time.sleep(0.25)
        assert limiter.is_allowed("user1") is True

    def test_thread_safety(self):
        limiter = RateLimiter(max_calls=100, period=60.0)
        results = []
        def run():
            results.append(limiter.is_allowed("shared"))
        threads = [threading.Thread(target=run) for _ in range(50)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        assert len(results) == 50
        allowed = sum(1 for r in results if r)
        assert allowed == 50  # all 50 fit within 100 limit


class TestPlanCache:
    def test_get_miss(self):
        cache = PlanCache(ttl=60.0)
        assert cache.get("unknown") is None

    def test_set_and_get(self):
        cache = PlanCache(ttl=60.0)
        cache.set("u1", "pro")
        assert cache.get("u1") == "pro"

    def test_ttl_expiry(self):
        cache = PlanCache(ttl=0.1)
        cache.set("u1", "elite")
        time.sleep(0.15)
        assert cache.get("u1") is None

    def test_invalidate(self):
        cache = PlanCache(ttl=60.0)
        cache.set("u1", "pro")
        cache.invalidate("u1")
        assert cache.get("u1") is None

    def test_overwrite(self):
        cache = PlanCache(ttl=60.0)
        cache.set("u1", "free")
        cache.set("u1", "pro")
        assert cache.get("u1") == "pro"
