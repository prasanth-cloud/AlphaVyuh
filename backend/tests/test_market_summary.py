import asyncio
import os

import pytest
from fastapi import HTTPException

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")

from app.routers import stocks  # noqa: E402


def test_market_summary_raises_503_when_database_is_unavailable(monkeypatch):
    stocks._market_summary_cache = None
    monkeypatch.setattr(stocks, "get_admin_client", lambda: (_ for _ in ()).throw(RuntimeError("db down")))

    with pytest.raises(HTTPException) as exc:
        asyncio.run(stocks.get_market_summary())

    assert exc.value.status_code == 503
    assert exc.value.detail == "Market summary is temporarily unavailable."


def test_market_summary_uses_precomputed_snapshot(monkeypatch):
    stocks._market_summary_cache = None
    client = object()
    snapshot = {
        "trade_date": "2026-05-20",
        "advances": 1548,
        "declines": 1486,
        "unchanged": 42,
        "advance_decline_ratio": 1.04,
        "new_52w_highs": 78,
        "new_52w_lows": 12,
        "above_ema20_pct": 52.1,
        "above_ema50_pct": 48.4,
        "above_ema200_pct": 38.9,
        "total": 3076,
        "universe_active": 3100,
        "cache_status": "snapshot",
    }

    monkeypatch.setattr(stocks, "get_admin_client", lambda: client)
    monkeypatch.setattr(
        stocks,
        "read_latest_market_breadth_snapshot",
        lambda *args, **kwargs: snapshot,
    )
    monkeypatch.setattr(
        stocks,
        "get_latest_complete_trade_date",
        lambda *_args: (_ for _ in ()).throw(AssertionError("snapshot should avoid live scan")),
    )

    summary = asyncio.run(stocks.get_market_summary())

    assert summary["trade_date"] == "2026-05-20"
    assert summary["advances"] == 1548
    assert summary["declines"] == 1486
    assert summary["above_ema200_pct"] == 38.9
    assert summary["total_stocks"] == 3076
    assert summary["universe"] == {
        "schema_version": 1,
        "id": "nse_active_eq",
        "label": "Active NSE equity universe",
        "market": "NSE",
        "series": ["EQ"],
        "active_only": True,
        "session_basis": "latest_complete_eod_session",
        "numerator": "distinct_symbols_with_valid_eod_row",
        "denominator": "active_stock_universe_symbols",
        "complete_session_min_coverage_pct": 75,
        "healthy_coverage_pct": 90,
        "symbols_count": 3076,
        "universe_active": 3100,
        "coverage_pct": 99.2,
    }
