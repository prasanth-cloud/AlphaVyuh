import asyncio
import os

import pytest
from fastapi import HTTPException

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")

from app.routers import market as market_router  # noqa: E402
from app.services.market_analytics import build_market_analytics  # noqa: E402


def _row(symbol: str, sector: str, trade_date: str, pct_change: float) -> dict:
    close = 100 * (1 + pct_change / 100)
    return {
        "symbol": symbol,
        "trade_date": trade_date,
        "close": close,
        "prev_close": 100,
        "pct_change": pct_change,
        "ema_20": 99,
        "ema_50": 98,
        "ema_200": 97,
        "is_new_52w_high": False,
        "is_new_52w_low": False,
        "stock_universe": {
            "series": "EQ",
            "sector": sector,
            "market": "NSE",
            "is_active": True,
        },
    }


def _rotation_rows() -> tuple[list[dict], list[str]]:
    dates = [f"2026-06-{day:02d}" for day in range(1, 11)]
    patterns = {
        "Leading sector": [0.1] * 5 + [2.0] * 5,
        "Weakening sector": [2.0] * 5 + [0.1] * 5,
        "Lagging sector": [-0.1] * 5 + [-2.0] * 5,
        "Improving sector": [-2.0] * 5 + [-0.1] * 5,
    }
    rows = []
    for index, (sector, returns) in enumerate(patterns.items()):
        for trade_date, pct_change in zip(dates, returns, strict=True):
            rows.append(_row(f"S{index}", sector, trade_date, pct_change))
    return rows, dates


def test_market_pulse_builds_truthful_breadth_sector_and_rotation_contract():
    rows, dates = _rotation_rows()

    result = build_market_analytics(rows, dates[-1], universe_active=4)

    assert result["name"] == "Market Pulse"
    assert result["trade_date"] == dates[-1]
    assert result["mode"] == "eod"
    assert result["phase"] == "Bullish"
    assert result["lookback_sessions"] == 10
    assert len(result["breadth_history"]) == 10
    assert result["summary"]["date"] == dates[-1]
    assert result["summary"]["advances"] == 2
    assert result["summary"]["declines"] == 2
    assert result["summary"]["above_ema200_pct"] == 100.0
    assert result["sector_leaderboard"][0]["rank"] == 1
    assert result["rotation_label"] == "Sector participation map"
    assert "not a true RRG" in result["rotation_methodology"]

    points = {point["sector"]: point for point in result["rotation_points"]}
    assert points["Leading sector"]["quadrant"] == "Leading"
    assert points["Weakening sector"]["quadrant"] == "Weakening"
    assert points["Lagging sector"]["quadrant"] == "Lagging"
    assert points["Improving sector"]["quadrant"] == "Improving"
    assert points["Leading sector"]["strength_score"] >= 50
    assert points["Leading sector"]["momentum_score"] >= 50
    assert points["Weakening sector"]["strength_score"] >= 50
    assert points["Weakening sector"]["momentum_score"] < 50
    assert points["Lagging sector"]["strength_score"] < 50
    assert points["Lagging sector"]["momentum_score"] < 50
    assert points["Improving sector"]["strength_score"] < 50
    assert points["Improving sector"]["momentum_score"] >= 50


def test_market_pulse_reports_completeness_and_provenance_without_inventing_coverage():
    rows, dates = _rotation_rows()

    known = build_market_analytics(rows, dates[-1], universe_active=5)
    unknown = build_market_analytics(rows, dates[-1])

    assert known["completeness"] == {
        "status": "partial",
        "latest_session_rows": 4,
        "active_universe": 5,
        "coverage_pct": 80.0,
        "sessions_requested": 21,
        "sessions_available": 10,
    }
    assert known["provenance"]["source_name"] == "NSE bhavcopy"
    assert known["provenance"]["mode"] == "fallback"
    assert known["provenance"]["coverage_pct"] == 80.0
    assert unknown["completeness"]["status"] == "unknown"
    assert unknown["completeness"]["coverage_pct"] is None
    assert unknown["provenance"]["coverage_pct"] is None


def test_market_pulse_rejects_rows_without_the_latest_complete_session():
    rows, _ = _rotation_rows()

    with pytest.raises(ValueError, match="latest complete session"):
        build_market_analytics(rows, "2026-06-11", universe_active=4)


def test_market_analytics_endpoint_raises_503_when_complete_session_is_unavailable(monkeypatch):
    market_router._analytics_cache = None
    market_router._analytics_cache_expires_at = 0
    client = object()
    monkeypatch.setattr(market_router, "get_user_client", lambda token: client)
    monkeypatch.setattr(market_router, "get_latest_complete_trade_date", lambda _client: None)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(market_router.market_analytics(user_token="user-jwt"))

    assert exc.value.status_code == 503
    assert exc.value.detail == "Market Pulse is temporarily unavailable."


def test_market_analytics_endpoint_caches_successful_payload(monkeypatch):
    market_router._analytics_cache = None
    market_router._analytics_cache_expires_at = 0
    payload = {
        "name": "Market Pulse",
        "trade_date": "2026-06-10",
        "cache_status": "miss",
        "provenance": {"cache_status": "miss"},
        "source_metadata": {"cache_status": "miss"},
    }
    calls = []
    client = object()
    monkeypatch.setattr(
        market_router,
        "get_user_client",
        lambda token: calls.append(("client", token)) or client,
    )
    monkeypatch.setattr(market_router, "get_latest_complete_trade_date", lambda _client: "2026-06-10")
    monkeypatch.setattr(
        market_router,
        "load_market_analytics",
        lambda _client, _date: calls.append(("analytics", _client, _date)) or payload,
    )

    first = asyncio.run(market_router.market_analytics(user_token="user-jwt"))
    second = asyncio.run(market_router.market_analytics(user_token="user-jwt"))

    assert first["cache_status"] == "miss"
    assert second["cache_status"] == "hit"
    assert second["provenance"]["cache_status"] == "hit"
    assert calls == [
        ("client", "user-jwt"),
        ("analytics", client, "2026-06-10"),
    ]
