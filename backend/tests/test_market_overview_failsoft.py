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


class _NoopClient:
    pass


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


def test_market_overview_uses_breadth_snapshot_before_recomputing(monkeypatch):
    _reset_cache()
    monkeypatch.setattr(market_router, "_index_quotes", _indices)
    monkeypatch.setattr(market_router, "get_admin_client", lambda: _NoopClient())
    monkeypatch.setattr(market_router, "get_latest_complete_trade_date", lambda _client: "2026-05-04")

    def _snapshot(_client, trade_date, indices, quote_source, indices_live):
        return {
            "trade_date": trade_date,
            "total": 1234,
            "advances": 700,
            "declines": 400,
            "unchanged": 134,
            "sector_breadth": [{"sector": "Banks", "breadth_pct": 66.7}],
            "top_gainers": [],
            "top_losers": [],
            "most_active": [],
            "indices": indices,
            "market_data_source": quote_source,
            "is_live": indices_live,
            "cache_status": "snapshot",
        }

    monkeypatch.setattr(market_router, "read_market_breadth_snapshot", _snapshot)

    def _unexpected_build(*_args, **_kwargs):
        raise AssertionError("snapshot miss path should not run when snapshot exists")

    monkeypatch.setattr(market_router, "build_market_breadth_snapshot", _unexpected_build)

    overview = asyncio.run(market_router.market_overview(user_id="user-1"))

    assert overview["cache_status"] == "snapshot"
    assert overview["trade_date"] == "2026-05-04"
    assert overview["total"] == 1234
    assert overview["sector_breadth"][0]["sector"] == "Banks"


def test_live_sector_index_contract_uses_official_labels():
    labels = [label for _symbol, label in market_router.SECTOR_INDEXES]

    assert "Nifty IT Index" in labels
    assert "Nifty Healthcare Index" in labels
    assert "Nifty Chemicals Index" in labels
    assert "Nifty Consumer Durables Index" in labels
    assert "Nifty Cement Index" in labels
    assert "IT" not in labels
    assert "Banks" not in labels
