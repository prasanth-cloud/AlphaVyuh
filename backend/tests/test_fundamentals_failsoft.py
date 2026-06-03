import asyncio
import os

import pytest
from fastapi import HTTPException

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")

from app.routers import stocks  # noqa: E402


class _FailingTicker:
    @property
    def info(self):
        raise RuntimeError("provider down")


class _Ticker:
    @property
    def info(self):
        return {
            "marketCap": 1_000_000_000,
            "trailingPE": 22.4,
            "dividendYield": 0.01,
        }


def test_fundamentals_rejects_invalid_symbols_before_provider_call(monkeypatch):
    stocks._fund_cache.clear()
    provider_calls = {"count": 0}

    def _ticker(_symbol):
        provider_calls["count"] += 1
        return _Ticker()

    monkeypatch.setattr(stocks.yf, "Ticker", _ticker)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(stocks.get_fundamentals("../RELIANCE"))

    assert exc.value.status_code == 400
    assert provider_calls["count"] == 0


def test_fundamentals_cache_is_bounded(monkeypatch):
    stocks._fund_cache.clear()
    monkeypatch.setattr(stocks, "_lookup_market", lambda _symbol: ("NSE", "INR"))
    monkeypatch.setattr(stocks.yf, "Ticker", lambda _ticker: _Ticker())

    for index in range(stocks._FUND_CACHE_MAX + 1):
        asyncio.run(stocks.get_fundamentals(f"SYM{index}"))

    assert len(stocks._fund_cache) == stocks._FUND_CACHE_MAX
    assert "SYM0" not in stocks._fund_cache
    assert f"SYM{stocks._FUND_CACHE_MAX}" in stocks._fund_cache


def test_fundamentals_returns_unavailable_payload_when_provider_fails(monkeypatch):
    stocks._fund_cache.clear()
    monkeypatch.setattr(stocks, "_lookup_market", lambda _symbol: ("NSE", "INR"))
    monkeypatch.setattr(stocks.yf, "Ticker", lambda _ticker: _FailingTicker())

    result = asyncio.run(stocks.get_fundamentals("reliance"))

    assert result["symbol"] == "RELIANCE"
    assert result["data_status"] == "unavailable"
    assert result["trailing_pe"] is None
    assert "workflow can continue" in result["message"]


def test_fundamentals_returns_stale_cache_when_refresh_fails(monkeypatch):
    stocks._fund_cache.clear()
    stocks._fund_cache["TCS"] = (
        0,
        {
            "symbol": "TCS",
            "market": "NSE",
            "currency": "INR",
            "trailing_pe": 28.4,
            "forward_pe": None,
            "price_to_book": None,
            "dividend_yield": None,
            "trailing_eps": None,
            "forward_eps": None,
            "earnings_growth": None,
            "revenue_growth": None,
            "return_on_equity": None,
            "debt_to_equity": None,
            "market_cap": None,
            "market_cap_str": "₹12L Cr",
            "shares_outstanding": None,
        },
    )
    monkeypatch.setattr(stocks, "_lookup_market", lambda _symbol: ("NSE", "INR"))
    monkeypatch.setattr(stocks.yf, "Ticker", lambda _ticker: _FailingTicker())

    result = asyncio.run(stocks.get_fundamentals("tcs"))

    assert result["symbol"] == "TCS"
    assert result["trailing_pe"] == 28.4
    assert result["data_status"] == "stale"
