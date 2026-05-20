import asyncio
import os

import pytest
from fastapi import HTTPException

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")

from app.routers import stocks  # noqa: E402


class _Result:
    def __init__(self, data=None):
        self.data = data


class _SectorQuery:
    def __init__(self, data=None, fail=False):
        self.data = data if data is not None else []
        self.fail = fail

    def select(self, *_args, **_kwargs):
        return self

    @property
    def not_(self):
        return self

    def is_(self, *_args, **_kwargs):
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def execute(self):
        if self.fail:
            raise RuntimeError("sector universe unavailable")
        return _Result(self.data)


class _SectorClient:
    def __init__(self, data=None, fail=False):
        self.data = data
        self.fail = fail

    def table(self, table_name):
        assert table_name == "stock_universe"
        return _SectorQuery(self.data, self.fail)


def test_market_movers_raise_503_when_latest_trade_date_is_unavailable(monkeypatch):
    monkeypatch.setattr(stocks, "get_admin_client", lambda: object())
    monkeypatch.setattr(stocks, "get_latest_complete_trade_date", lambda client: None)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(stocks.get_market_movers())

    assert exc.value.status_code == 503
    assert exc.value.detail == "Market movers are temporarily unavailable."


def test_sector_breadth_raises_503_when_latest_trade_date_is_unavailable(monkeypatch):
    monkeypatch.setattr(stocks, "get_admin_client", lambda: object())
    monkeypatch.setattr(stocks, "get_latest_complete_trade_date", lambda client: None)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(stocks.get_sector_breadth())

    assert exc.value.status_code == 503
    assert exc.value.detail == "Sector breadth is temporarily unavailable."


def test_sector_list_keeps_valid_empty_state(monkeypatch):
    monkeypatch.setattr(
        stocks,
        "get_admin_client",
        lambda: _SectorClient(
            data=[
                {"sector": "Energy"},
                {"sector": "Energy"},
                {"sector": "Financial Services"},
            ],
        ),
    )

    assert asyncio.run(stocks.list_sectors()) == {"sectors": []}


def test_sector_list_raises_503_when_stock_universe_query_fails(monkeypatch):
    monkeypatch.setattr(stocks, "get_admin_client", lambda: _SectorClient(fail=True))

    with pytest.raises(HTTPException) as exc:
        asyncio.run(stocks.list_sectors())

    assert exc.value.status_code == 503
    assert exc.value.detail == "Sector list is temporarily unavailable."
