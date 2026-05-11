"""
Precomputed market breadth snapshots for the dashboard.

The dashboard should not recompute all-market breadth during cold page load.
This service builds the same overview payload from daily_ohlcv after ingest,
persists it, and lets the API use that read model first.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timezone
from typing import Any

from app.services.market_context import eod_source_metadata


def _f(value: Any, default=None):
    try:
        return float(value) if value is not None else default
    except (TypeError, ValueError):
        return default


def _mover(row: dict) -> dict:
    return {
        "symbol": row["symbol"],
        "company_name": row["company_name"],
        "close": row["close"],
        "pct_change": row["pct_change"],
        "volume_ratio": row["volume_ratio"],
    }


def _active_universe_count(client) -> int | None:
    try:
        result = (
            client.table("stock_universe")
            .select("symbol", count="exact")
            .eq("series", "EQ")
            .eq("market", "NSE")
            .eq("is_active", True)
            .limit(1)
            .execute()
        )
        return result.count
    except Exception:
        return None


def build_market_breadth_snapshot(
    client,
    trade_date: str | date,
    indices: list[dict] | None = None,
    quote_source: str = "latest_complete_session",
    indices_live: bool = False,
    cache_status: str = "snapshot_build",
) -> dict:
    latest_date = str(trade_date)
    universe_active = _active_universe_count(client)

    rows = (
        client.table("daily_ohlcv")
        .select(
            "symbol,close,prev_close,open,high,low,volume,avg_volume_20d,"
            "week_52_high,week_52_low,rsi_14,ema_20,ema_50,ema_200,atr_14,"
            "stock_universe!daily_ohlcv_symbol_fkey!inner(symbol,company_name,series,sector,market,is_active)"
        )
        .eq("trade_date", latest_date)
        .limit(5000)
        .execute()
        .data or []
    )

    rows = [
        row for row in rows
        if (row.get("stock_universe") or {}).get("series") == "EQ"
        and (row.get("stock_universe") or {}).get("market") == "NSE"
        and (row.get("stock_universe") or {}).get("is_active", True)
    ]

    enriched: list[dict] = []
    for row in rows:
        universe_row = row.get("stock_universe") or {}
        close = _f(row.get("close"), None)
        prev_close = _f(row.get("prev_close"), None)
        if not close or close <= 0 or not prev_close or prev_close <= 0:
            continue

        volume = int(row.get("volume") or 0)
        avg_volume = int(row.get("avg_volume_20d") or 0)
        pct_change = round((close - prev_close) / prev_close * 100, 2)
        volume_ratio = round(volume / avg_volume, 2) if avg_volume else None
        week_52_high = _f(row.get("week_52_high"), None)
        week_52_low = _f(row.get("week_52_low"), None)
        week_52_high_pct = round((week_52_high - close) / close * 100, 2) if week_52_high and close else None

        enriched.append({
            "symbol": row["symbol"],
            "company_name": universe_row.get("company_name") or row["symbol"],
            "sector": universe_row.get("sector"),
            "close": close,
            "pct_change": pct_change,
            "volume": volume,
            "avg_volume_20d": avg_volume,
            "volume_ratio": volume_ratio,
            "ema_20": _f(row.get("ema_20"), None),
            "ema_50": _f(row.get("ema_50"), None),
            "ema_200": _f(row.get("ema_200"), None),
            "week_52_high": week_52_high,
            "week_52_high_pct": week_52_high_pct,
            "is_new_52w_high": bool(week_52_high and close and close >= week_52_high * 0.995),
            "is_new_52w_low": bool(week_52_low and close and close <= week_52_low * 1.005),
        })

    total = len(enriched)
    advances = sum(1 for row in enriched if row["pct_change"] > 0.05)
    declines = sum(1 for row in enriched if row["pct_change"] < -0.05)
    unchanged = total - advances - declines
    new_highs = sum(1 for row in enriched if row["is_new_52w_high"])
    new_lows = sum(1 for row in enriched if row["is_new_52w_low"])
    if new_highs == 0:
        new_highs = sum(
            1 for row in enriched
            if row.get("week_52_high_pct") is not None and row["week_52_high_pct"] <= 0.5
        )
    advance_decline_ratio = round(advances / declines, 2) if declines else float(advances)

    valid_ema20 = sum(1 for row in enriched if row["ema_20"])
    valid_ema50 = sum(1 for row in enriched if row["ema_50"])
    valid_ema200 = sum(1 for row in enriched if row["ema_200"])
    above_ema20 = sum(1 for row in enriched if row["ema_20"] and row["close"] > row["ema_20"])
    above_ema50 = sum(1 for row in enriched if row["ema_50"] and row["close"] > row["ema_50"])
    above_ema200 = sum(1 for row in enriched if row["ema_200"] and row["close"] > row["ema_200"])

    def pct(count: int, denominator: int) -> float:
        return round(count / denominator * 100, 1) if denominator else 0

    above_ema20_pct = pct(above_ema20, valid_ema20)
    above_ema50_pct = pct(above_ema50, valid_ema50)
    above_ema200_pct = pct(above_ema200, valid_ema200)

    if above_ema200_pct >= 60:
        market_phase = "Bullish"
        market_phase_desc = f"Strong breadth - {above_ema20_pct}% of stocks above 20 EMA"
    elif above_ema200_pct <= 40:
        market_phase = "Bearish"
        market_phase_desc = f"Weak breadth - only {above_ema200_pct}% of stocks above 200 EMA"
    else:
        market_phase = "Neutral"
        market_phase_desc = f"Mixed market - {above_ema200_pct}% of stocks above 200 EMA"

    sector_map: dict = defaultdict(lambda: {
        "total": 0,
        "advances": 0,
        "declines": 0,
        "pct_sum": 0.0,
        "ema20_valid": 0,
        "above_ema20": 0,
    })
    for row in enriched:
        sector = row["sector"] or "Unknown"
        sector_map[sector]["total"] += 1
        if row["pct_change"] > 0.05:
            sector_map[sector]["advances"] += 1
        elif row["pct_change"] < -0.05:
            sector_map[sector]["declines"] += 1
        sector_map[sector]["pct_sum"] += row["pct_change"]
        if row["ema_20"]:
            sector_map[sector]["ema20_valid"] += 1
            if row["close"] > row["ema_20"]:
                sector_map[sector]["above_ema20"] += 1

    sector_breadth: list[dict] = []
    for sector, data in sector_map.items():
        if data["total"] < 3:
            continue
        advance_breadth = round(data["advances"] / data["total"] * 100, 1)
        above_sector_ema20_pct = (
            round(data["above_ema20"] / data["ema20_valid"] * 100, 1)
            if data["ema20_valid"] else None
        )
        sector_breadth.append({
            "sector": sector,
            "total": data["total"],
            "advances": data["advances"],
            "declines": data["declines"],
            "avg_pct_change": round(data["pct_sum"] / data["total"], 2),
            "breadth_pct": advance_breadth,
            "advance_breadth_pct": advance_breadth,
            "above_ema20_pct": above_sector_ema20_pct,
            "basis": "advancing_constituents",
        })
    sector_breadth.sort(key=lambda item: (item["avg_pct_change"], item["breadth_pct"]), reverse=True)

    with_pct = [row for row in enriched if row["pct_change"] is not None]
    top_gainers = sorted(with_pct, key=lambda item: item["pct_change"], reverse=True)[:5]
    top_losers = sorted(with_pct, key=lambda item: item["pct_change"])[:5]
    with_volume = [row for row in enriched if row["volume_ratio"] is not None]
    most_active = sorted(with_volume, key=lambda item: item["volume_ratio"] or 0, reverse=True)[:5]

    coverage_pct = round((total / universe_active) * 100, 1) if universe_active else None
    coverage_status = "healthy" if coverage_pct is None or coverage_pct >= 90 else "degraded"
    metadata = eod_source_metadata(
        as_of=latest_date,
        status=coverage_status,
        coverage_pct=coverage_pct,
        symbols_count=total,
        universe_active=universe_active or total,
        cache_status=cache_status,
    )

    generated_at = datetime.now(timezone.utc).isoformat()
    return {
        "trade_date": latest_date,
        "advances": advances,
        "declines": declines,
        "unchanged": unchanged,
        "total": total,
        "advance_decline_ratio": advance_decline_ratio,
        "new_52w_highs": new_highs,
        "new_52w_lows": new_lows,
        "above_ema20_count": above_ema20,
        "above_ema20_pct": above_ema20_pct,
        "above_ema50_count": above_ema50,
        "above_ema50_pct": above_ema50_pct,
        "above_ema200_count": above_ema200,
        "above_ema200_pct": above_ema200_pct,
        "market_phase": market_phase,
        "market_phase_desc": market_phase_desc,
        "sector_breadth": sector_breadth[:12],
        "sector_breadth_basis": "advancing_constituents",
        "sector_breadth_source": "latest_complete_nse_eq_universe",
        "top_sectors": sector_breadth[:5],
        "top_gainers": [_mover(row) for row in top_gainers],
        "top_losers": [_mover(row) for row in top_losers],
        "most_active": [_mover(row) for row in most_active],
        "indices": indices or [],
        "market_data_source": quote_source,
        "is_live": indices_live,
        "as_of": latest_date,
        "generated_at": generated_at,
        "cache_status": cache_status,
        "provider": metadata,
        "source_metadata": metadata,
        "coverage_pct": coverage_pct,
        "universe_active": universe_active or total,
    }


def read_market_breadth_snapshot(
    client,
    trade_date: str | date,
    indices: list[dict],
    quote_source: str,
    indices_live: bool,
) -> dict | None:
    result = (
        client.table("market_breadth_snapshots")
        .select("*")
        .eq("trade_date", str(trade_date))
        .maybe_single()
        .execute()
    )
    row = result.data
    if not row:
        return None

    metadata = eod_source_metadata(
        as_of=row.get("trade_date"),
        status="healthy" if (row.get("coverage_pct") is None or row.get("coverage_pct") >= 90) else "degraded",
        coverage_pct=row.get("coverage_pct"),
        symbols_count=row.get("total"),
        universe_active=row.get("universe_active") or row.get("total"),
        cache_status="snapshot",
    )
    source_metadata = row.get("source_metadata") or {}
    if isinstance(source_metadata, dict):
        metadata = {**source_metadata, **metadata}

    return {
        "trade_date": row.get("trade_date"),
        "advances": row.get("advances") or 0,
        "declines": row.get("declines") or 0,
        "unchanged": row.get("unchanged") or 0,
        "total": row.get("total") or 0,
        "advance_decline_ratio": _f(row.get("advance_decline_ratio"), 0),
        "new_52w_highs": row.get("new_52w_highs") or 0,
        "new_52w_lows": row.get("new_52w_lows") or 0,
        "above_ema20_count": row.get("above_ema20_count") or 0,
        "above_ema20_pct": _f(row.get("above_ema20_pct"), 0),
        "above_ema50_count": row.get("above_ema50_count") or 0,
        "above_ema50_pct": _f(row.get("above_ema50_pct"), 0),
        "above_ema200_count": row.get("above_ema200_count") or 0,
        "above_ema200_pct": _f(row.get("above_ema200_pct"), 0),
        "market_phase": row.get("market_phase") or "Pending",
        "market_phase_desc": row.get("market_phase_desc") or "Using the latest complete market session.",
        "sector_breadth": row.get("sector_breadth") or [],
        "sector_breadth_basis": "advancing_constituents",
        "sector_breadth_source": row.get("source_name") or "latest_complete_nse_eq_universe",
        "top_sectors": row.get("top_sectors") or [],
        "top_gainers": row.get("top_gainers") or [],
        "top_losers": row.get("top_losers") or [],
        "most_active": row.get("most_active") or [],
        "indices": indices,
        "market_data_source": quote_source,
        "is_live": indices_live,
        "as_of": row.get("trade_date"),
        "generated_at": row.get("generated_at"),
        "cache_status": "snapshot",
        "provider": metadata,
        "source_metadata": metadata,
    }


def persist_market_breadth_snapshot(client, trade_date: str | date) -> dict:
    snapshot = build_market_breadth_snapshot(client, trade_date, cache_status="snapshot_build")
    payload = {
        "trade_date": snapshot["trade_date"],
        "advances": snapshot["advances"],
        "declines": snapshot["declines"],
        "unchanged": snapshot["unchanged"],
        "total": snapshot["total"],
        "advance_decline_ratio": snapshot["advance_decline_ratio"],
        "new_52w_highs": snapshot["new_52w_highs"],
        "new_52w_lows": snapshot["new_52w_lows"],
        "above_ema20_count": snapshot["above_ema20_count"],
        "above_ema20_pct": snapshot["above_ema20_pct"],
        "above_ema50_count": snapshot["above_ema50_count"],
        "above_ema50_pct": snapshot["above_ema50_pct"],
        "above_ema200_count": snapshot["above_ema200_count"],
        "above_ema200_pct": snapshot["above_ema200_pct"],
        "market_phase": snapshot["market_phase"],
        "market_phase_desc": snapshot["market_phase_desc"],
        "sector_breadth": snapshot["sector_breadth"],
        "top_sectors": snapshot["top_sectors"],
        "top_gainers": snapshot["top_gainers"],
        "top_losers": snapshot["top_losers"],
        "most_active": snapshot["most_active"],
        "coverage_pct": snapshot["coverage_pct"],
        "universe_active": snapshot["universe_active"],
        "source_name": "latest_complete_nse_eq_universe",
        "source_metadata": snapshot["source_metadata"],
        "generated_at": snapshot["generated_at"],
    }
    client.table("market_breadth_snapshots").upsert(payload, on_conflict="trade_date").execute()
    return snapshot
