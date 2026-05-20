import asyncio
import os

import pytest
from fastapi import HTTPException

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")

from app.routers import journal  # noqa: E402


class _Result:
    def __init__(self, data=None):
        self.data = data


class _PortfolioQuery:
    def __init__(self, client, table_name):
        self.client = client
        self.table_name = table_name

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def in_(self, *_args, **_kwargs):
        return self

    def order(self, *_args, **_kwargs):
        return self

    def execute(self):
        if self.table_name in self.client.fail_tables:
            raise RuntimeError(f"{self.table_name} unavailable")
        if self.table_name == "trade_journal":
            return _Result(self.client.positions)
        if self.table_name == "daily_ohlcv":
            return _Result(self.client.prices)
        if self.table_name == "stock_universe":
            return _Result(self.client.stock_rows)
        raise AssertionError(self.table_name)


class _PortfolioClient:
    def __init__(self, *, positions=None, prices=None, stock_rows=None, fail_tables=None):
        self.positions = positions if positions is not None else []
        self.prices = prices if prices is not None else []
        self.stock_rows = stock_rows if stock_rows is not None else []
        self.fail_tables = set(fail_tables or [])

    def table(self, table_name):
        return _PortfolioQuery(self, table_name)


def _open_position(symbol="RELIANCE"):
    return {
        "id": "trade-1",
        "symbol": symbol,
        "company_name": "Reliance Industries",
        "trade_type": "long",
        "entry_date": "2026-05-15",
        "entry_price": 2500,
        "quantity": 2,
        "stop_loss": 2440,
        "target_price": 2680,
        "setup_type": "breakout",
    }


def test_portfolio_keeps_no_open_positions_as_valid_empty_state(monkeypatch):
    monkeypatch.setattr(journal, "get_admin_client", lambda: _PortfolioClient(positions=[]))

    result = asyncio.run(journal.get_portfolio(user_id="user-1"))

    assert result == {
        "positions": [],
        "summary": {"total_invested": 0, "total_current": 0, "total_pnl": 0, "total_pnl_pct": 0},
        "sectors": [],
    }


def test_portfolio_raises_503_when_open_position_query_fails(monkeypatch):
    monkeypatch.setattr(journal, "get_admin_client", lambda: _PortfolioClient(fail_tables={"trade_journal"}))

    with pytest.raises(HTTPException) as exc:
        asyncio.run(journal.get_portfolio(user_id="user-1"))

    assert exc.value.status_code == 503
    assert exc.value.detail == "Portfolio is temporarily unavailable."


def test_portfolio_raises_503_when_eod_price_query_fails(monkeypatch):
    monkeypatch.setattr(
        journal,
        "get_admin_client",
        lambda: _PortfolioClient(positions=[_open_position()], fail_tables={"daily_ohlcv"}),
    )

    with pytest.raises(HTTPException) as exc:
        asyncio.run(journal.get_portfolio(user_id="user-1"))

    assert exc.value.status_code == 503
    assert exc.value.detail == "Portfolio is temporarily unavailable."


def test_portfolio_raises_503_when_sector_query_fails(monkeypatch):
    monkeypatch.setattr(
        journal,
        "get_admin_client",
        lambda: _PortfolioClient(
            positions=[_open_position()],
            prices=[{"symbol": "RELIANCE", "close": 2600, "pct_change": 1.5}],
            fail_tables={"stock_universe"},
        ),
    )
    monkeypatch.setattr(journal.yf, "Ticker", lambda *_args, **_kwargs: None)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(journal.get_portfolio(user_id="user-1"))

    assert exc.value.status_code == 503
    assert exc.value.detail == "Portfolio is temporarily unavailable."
