import asyncio
import os

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")

from app.routers import stocks  # noqa: E402


class _FailingTicker:
    @property
    def info(self):
        raise RuntimeError("provider down")


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
