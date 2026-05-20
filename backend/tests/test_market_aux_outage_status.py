import asyncio
import os

import pytest
from fastapi import HTTPException

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")

from app.routers import stocks  # noqa: E402


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
