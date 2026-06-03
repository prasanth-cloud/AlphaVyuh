import os
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")

from app.routers import charts, stocks
from app.services.rate_limit import RateLimiter, client_rate_key


class _FakeHeaders(dict):
    def get(self, key, default=None):
        return super().get(key.lower(), default)


class _FakeRequest:
    def __init__(self, host="127.0.0.1", forwarded_for: str | None = None):
        self.client = SimpleNamespace(host=host)
        self.headers = _FakeHeaders()
        if forwarded_for:
            self.headers["x-forwarded-for"] = forwarded_for


def test_client_rate_key_ignores_spoofable_forwarded_for():
    request = _FakeRequest(host="10.0.0.2", forwarded_for="203.0.113.10, 10.0.0.2")

    assert client_rate_key(request, "quote-live") == "quote-live:10.0.0.2"


def test_quote_live_rate_limit_blocks_before_provider_call(monkeypatch):
    limiter = RateLimiter(max_calls=1, period=60)
    request = _FakeRequest(host="198.51.100.7")
    provider_calls = {"count": 0}

    class _Provider:
        def live_quote(self, *args, **kwargs):
            provider_calls["count"] += 1
            return {"symbol": "AUBANK", "source": "mock"}

    monkeypatch.setattr(stocks, "public_market_limiter", limiter)
    monkeypatch.setattr(stocks, "_lookup_market", lambda symbol: ("NSE", "INR"))
    monkeypatch.setattr(stocks, "get_market_data_provider", lambda: _Provider())

    import asyncio

    assert asyncio.run(stocks.get_quote_live("AUBANK", request))["symbol"] == "AUBANK"
    with pytest.raises(HTTPException) as exc:
        asyncio.run(stocks.get_quote_live("AUBANK", request))

    assert exc.value.status_code == 429
    assert exc.value.headers["Retry-After"]
    assert provider_calls["count"] == 1


def test_candles_live_rate_limit_blocks_before_provider_call(monkeypatch):
    limiter = RateLimiter(max_calls=1, period=60)
    request = _FakeRequest(host="198.51.100.8")
    provider_calls = {"count": 0}

    class _Provider:
        def live_candles(self, *args, **kwargs):
            provider_calls["count"] += 1
            return {"symbol": "AUBANK", "candles": [], "source": "mock"}

    monkeypatch.setattr(charts, "public_market_limiter", limiter)
    monkeypatch.setattr(charts, "_lookup_market_identity", lambda symbol: SimpleNamespace(market="NSE", currency="INR"))
    monkeypatch.setattr(charts, "get_market_data_provider", lambda: _Provider())

    import asyncio

    assert asyncio.run(charts.get_candles_live("AUBANK", request, timeframe="D", limit=500))["symbol"] == "AUBANK"
    with pytest.raises(HTTPException) as exc:
        asyncio.run(charts.get_candles_live("AUBANK", request, timeframe="D", limit=500))

    assert exc.value.status_code == 429
    assert exc.value.headers["Retry-After"]
    assert provider_calls["count"] == 1
