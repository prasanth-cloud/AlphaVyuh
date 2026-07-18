from __future__ import annotations

from typing import Any


MARKET_UNIVERSE_CONTRACT = {
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
}


def market_universe_evidence(
    *,
    symbols_count: int | None = None,
    universe_active: int | None = None,
) -> dict[str, Any]:
    coverage_pct = (
        round((symbols_count / universe_active) * 100, 1)
        if symbols_count is not None and universe_active and universe_active > 0
        else None
    )
    return {
        **MARKET_UNIVERSE_CONTRACT,
        "symbols_count": symbols_count,
        "universe_active": universe_active,
        "coverage_pct": coverage_pct,
    }


def _field(name: str, relation: str | None) -> str:
    return f"{relation}.{name}" if relation else name


def apply_market_universe_filters(query, *, relation: str | None = "stock_universe"):
    return (
        query.eq(_field("market", relation), MARKET_UNIVERSE_CONTRACT["market"])
        .in_(_field("series", relation), MARKET_UNIVERSE_CONTRACT["series"])
        .eq(_field("is_active", relation), MARKET_UNIVERSE_CONTRACT["active_only"])
    )


def active_market_universe_count(client) -> int | None:
    try:
        result = apply_market_universe_filters(
            client.table("stock_universe").select("symbol", count="exact").limit(1),
            relation=None,
        ).execute()
        return result.count
    except Exception:
        return None
