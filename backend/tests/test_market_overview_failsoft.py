import asyncio
import os

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")

from app.routers import market as market_router


def _reset_cache():
    market_router._overview_cache = None
    market_router._overview_cache_expires_at = 0.0


def _indices():
    return ([{"symbol": "NIFTY", "label": "NIFTY 50", "close": None, "pct_change": None}], "mock", False)


class _FailingQuery:
    def select(self, *_args, **_kwargs):
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def limit(self, *_args, **_kwargs):
        return self

    def execute(self):
        raise RuntimeError("daily data unavailable")


class _FailingDailyClient:
    def table(self, _table_name: str):
        return _FailingQuery()


def test_market_overview_fails_soft_when_admin_client_unavailable(monkeypatch):
    _reset_cache()
    monkeypatch.setattr(market_router, "_index_quotes", _indices)
    monkeypatch.setattr(market_router, "get_admin_client", lambda: (_ for _ in ()).throw(RuntimeError("db down")))

    overview = asyncio.run(market_router.market_overview(user_id="user-1"))

    assert overview["mode"] == "unavailable"
    assert overview["total"] == 0
    assert overview["indices"][0]["symbol"] == "NIFTY"
    assert "Market summary" in overview["message"]


def test_market_overview_fails_soft_when_daily_rows_unavailable(monkeypatch):
    _reset_cache()
    monkeypatch.setattr(market_router, "_index_quotes", _indices)
    monkeypatch.setattr(market_router, "get_admin_client", lambda: _FailingDailyClient())
    monkeypatch.setattr(market_router, "get_latest_complete_trade_date", lambda _client: "2026-05-04")

    overview = asyncio.run(market_router.market_overview(user_id="user-1"))

    assert overview["mode"] == "unavailable"
    assert overview["trade_date"] == "2026-05-04"
    assert overview["top_gainers"] == []
    assert overview["cache_status"] == "miss"
