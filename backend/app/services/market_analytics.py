"""Truthful EOD market breadth and relative sector-rotation analytics.

The rotation points produced here are a simple, explainable relative-strength map.
They are not a licensed or canonical Relative Rotation Graph (RRG).
"""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone
from math import prod
from typing import Any

from app.services.market_context import eod_source_metadata

ANALYTICS_LOOKBACK_SESSIONS = 21
ANALYTICS_PAGE_SIZE = 1000
ANALYTICS_MAX_ROWS = 100_000
ROTATION_METHODOLOGY = (
    "Relative sector map, not a true RRG. Strength is the percentile rank of each "
    "sector's equal-weight 20-session constituent return; momentum is the percentile "
    "rank of its latest 5-session return minus the preceding 5-session return. "
    "Both axes are centered at 50."
)


def _finite_float(value: Any, default: float | None = None) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    if number != number or number in (float("inf"), float("-inf")):
        return default
    return number


def _recent_trade_dates(client, latest_date: str, limit: int) -> list[str]:
    """Return completed session dates, preferring the compact ingestion log."""
    dates: list[str] = []
    try:
        rows = (
            client.table("bhavcopy_ingestion_log")
            .select("trade_date")
            .in_("status", ["success", "already_done"])
            .lte("trade_date", latest_date)
            .order("trade_date", desc=True)
            .limit(limit)
            .execute()
            .data or []
        )
        dates = [str(row["trade_date"]) for row in rows if row.get("trade_date")]
    except Exception:
        dates = []

    unique_dates = list(dict.fromkeys(dates))
    if len(unique_dates) >= limit:
        return sorted(unique_dates[:limit])

    # The log can be missing on older installations. Page raw dates only as a fallback.
    seen = set(unique_dates)
    offset = 0
    while len(unique_dates) < limit and offset < ANALYTICS_MAX_ROWS:
        rows = (
            client.table("daily_ohlcv")
            .select("trade_date")
            .lte("trade_date", latest_date)
            .order("trade_date", desc=True)
            .range(offset, offset + ANALYTICS_PAGE_SIZE - 1)
            .execute()
            .data or []
        )
        if not rows:
            break
        for row in rows:
            trade_date = str(row.get("trade_date") or "")
            if trade_date and trade_date not in seen:
                seen.add(trade_date)
                unique_dates.append(trade_date)
                if len(unique_dates) >= limit:
                    break
        if len(rows) < ANALYTICS_PAGE_SIZE:
            break
        offset += ANALYTICS_PAGE_SIZE
    return sorted(unique_dates)[-limit:]


def _fetch_analytics_rows(client, trade_dates: list[str]) -> list[dict]:
    rows: list[dict] = []
    offset = 0
    select_clause = (
        "symbol,trade_date,close,prev_close,pct_change,ema_20,ema_50,ema_200,"
        "is_new_52w_high,is_new_52w_low,"
        "stock_universe!daily_ohlcv_symbol_fkey!inner(series,sector,market,is_active)"
    )
    while len(rows) < ANALYTICS_MAX_ROWS:
        chunk = (
            client.table("daily_ohlcv")
            .select(select_clause)
            .in_("trade_date", trade_dates)
            .order("trade_date")
            .range(offset, offset + ANALYTICS_PAGE_SIZE - 1)
            .execute()
            .data or []
        )
        if not chunk:
            break
        rows.extend(chunk)
        if len(chunk) < ANALYTICS_PAGE_SIZE:
            break
        offset += ANALYTICS_PAGE_SIZE
    return rows


def _universe_row(row: dict) -> dict:
    universe = row.get("stock_universe") or {}
    if isinstance(universe, list):
        return universe[0] if universe else {}
    return universe


def _is_active_nse_eq(row: dict) -> bool:
    universe = _universe_row(row)
    return (
        universe.get("series") == "EQ"
        and universe.get("market") == "NSE"
        and universe.get("is_active", True) is True
    )


def _daily_return(row: dict) -> float | None:
    close = _finite_float(row.get("close"))
    prev_close = _finite_float(row.get("prev_close"))
    if close is not None and prev_close is not None and close > 0 and prev_close > 0:
        return (close / prev_close - 1) * 100
    return _finite_float(row.get("pct_change"))


def _compounded_return(values: list[float]) -> float:
    if not values:
        return 0.0
    return (prod(1 + value / 100 for value in values) - 1) * 100


def _percentile_scores(values: dict[str, float]) -> dict[str, float]:
    """Cross-sectional percentile ranks with tied observations sharing a rank."""
    if not values:
        return {}
    if len(values) == 1:
        only_key = next(iter(values))
        return {only_key: 50.0}

    ordered = sorted(values.items(), key=lambda item: (item[1], item[0]))
    scores: dict[str, float] = {}
    index = 0
    while index < len(ordered):
        end = index
        while end + 1 < len(ordered) and ordered[end + 1][1] == ordered[index][1]:
            end += 1
        average_rank = (index + end) / 2
        score = round(average_rank / (len(ordered) - 1) * 100, 1)
        for tied_index in range(index, end + 1):
            scores[ordered[tied_index][0]] = score
        index = end + 1
    return scores


def _quadrant(strength_score: float, momentum_score: float) -> str:
    if strength_score >= 50 and momentum_score >= 50:
        return "Leading"
    if strength_score >= 50 and momentum_score < 50:
        return "Weakening"
    if strength_score < 50 and momentum_score < 50:
        return "Lagging"
    return "Improving"


def build_market_analytics(
    rows: list[dict],
    trade_date: str,
    *,
    universe_active: int | None = None,
) -> dict:
    """Build analytics from a bounded set of completed EOD rows."""
    filtered = [row for row in rows if _is_active_nse_eq(row)]
    dates = sorted({str(row.get("trade_date")) for row in filtered if row.get("trade_date")})
    if not dates:
        raise ValueError("No completed NSE EQ rows are available for market analytics")
    if trade_date not in dates:
        raise ValueError("The latest complete session is missing from market analytics rows")

    rows_by_date: dict[str, list[dict]] = defaultdict(list)
    for row in filtered:
        rows_by_date[str(row["trade_date"])].append(row)

    breadth_history: list[dict] = []
    sector_daily_returns: dict[str, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
    latest_sector_counts: dict[str, dict[str, int]] = defaultdict(lambda: {
        "constituents": 0,
        "advances": 0,
        "declines": 0,
    })

    for date in dates:
        date_rows = rows_by_date[date]
        returns = [(row, _daily_return(row)) for row in date_rows]
        valid_returns = [(row, value) for row, value in returns if value is not None]
        advances = sum(1 for _, value in valid_returns if value > 0.05)
        declines = sum(1 for _, value in valid_returns if value < -0.05)
        unchanged = len(valid_returns) - advances - declines

        def above_ema(field: str) -> tuple[int, int]:
            eligible = [
                row for row in date_rows
                if (_finite_float(row.get("close")) or 0) > 0
                and (_finite_float(row.get(field)) or 0) > 0
            ]
            count = sum(
                1 for row in eligible
                if float(row["close"]) > float(row[field])
            )
            return count, len(eligible)

        above20, valid20 = above_ema("ema_20")
        above50, valid50 = above_ema("ema_50")
        above200, valid200 = above_ema("ema_200")
        breadth_history.append({
            "date": date,
            "advances": advances,
            "declines": declines,
            "unchanged": unchanged,
            "total": len(valid_returns),
            "advance_decline_ratio": round(advances / declines, 2) if declines else None,
            "advance_pct": round(advances / len(valid_returns) * 100, 1) if valid_returns else 0.0,
            "above_ema20_pct": round(above20 / valid20 * 100, 1) if valid20 else None,
            "above_ema50_pct": round(above50 / valid50 * 100, 1) if valid50 else None,
            "above_ema200_pct": round(above200 / valid200 * 100, 1) if valid200 else None,
            "new_52w_highs": sum(row.get("is_new_52w_high") is True for row in date_rows),
            "new_52w_lows": sum(row.get("is_new_52w_low") is True for row in date_rows),
        })

        for row, daily_return in valid_returns:
            sector = _universe_row(row).get("sector")
            if not sector or sector == "Unknown":
                continue
            sector_daily_returns[sector][date].append(daily_return)
            if date == trade_date:
                latest_sector_counts[sector]["constituents"] += 1
                if daily_return > 0.05:
                    latest_sector_counts[sector]["advances"] += 1
                elif daily_return < -0.05:
                    latest_sector_counts[sector]["declines"] += 1

    sector_periods: dict[str, dict[str, float]] = {}
    for sector, by_date in sector_daily_returns.items():
        daily_averages = [
            sum(by_date[date]) / len(by_date[date])
            for date in dates
            if by_date.get(date)
        ]
        if not daily_averages:
            continue
        latest_five = _compounded_return(daily_averages[-5:])
        preceding_five = _compounded_return(daily_averages[-10:-5])
        sector_periods[sector] = {
            "return_5d": latest_five,
            "return_20d": _compounded_return(daily_averages[-20:]),
            "momentum_delta": latest_five - preceding_five,
        }

    strength_scores = _percentile_scores({
        sector: values["return_20d"] for sector, values in sector_periods.items()
    })
    momentum_scores = _percentile_scores({
        sector: values["momentum_delta"] for sector, values in sector_periods.items()
    })

    sector_leaderboard: list[dict] = []
    rotation_points: list[dict] = []
    for sector, period in sector_periods.items():
        counts = latest_sector_counts[sector]
        breadth_pct = (
            round(counts["advances"] / counts["constituents"] * 100, 1)
            if counts["constituents"] else None
        )
        sector_leaderboard.append({
            "sector": sector,
            "return_5d_pct": round(period["return_5d"], 2),
            "return_20d_pct": round(period["return_20d"], 2),
            "breadth_pct": breadth_pct,
            **counts,
        })
        strength = strength_scores[sector]
        momentum = momentum_scores[sector]
        rotation_points.append({
            "sector": sector,
            "strength_score": strength,
            "momentum_score": momentum,
            "quadrant": _quadrant(strength, momentum),
            "return_20d_pct": round(period["return_20d"], 2),
            "momentum_delta_pct": round(period["momentum_delta"], 2),
        })

    sector_leaderboard.sort(key=lambda item: (item["return_20d_pct"], item["return_5d_pct"]), reverse=True)
    for rank, sector in enumerate(sector_leaderboard, start=1):
        sector["rank"] = rank
    rotation_points.sort(key=lambda item: item["strength_score"], reverse=True)

    latest = breadth_history[-1]
    above_ema200 = latest.get("above_ema200_pct")
    if above_ema200 is not None and above_ema200 >= 60:
        phase = "Bullish"
    elif above_ema200 is not None and above_ema200 <= 40:
        phase = "Bearish"
    else:
        phase = "Neutral"

    coverage_pct = (
        round(latest["total"] / universe_active * 100, 1)
        if universe_active and universe_active > 0 else None
    )
    completeness_status = (
        "complete" if coverage_pct is not None and coverage_pct >= 90
        else "partial" if coverage_pct is not None
        else "unknown"
    )
    metadata = eod_source_metadata(
        as_of=trade_date,
        status="healthy" if completeness_status != "partial" else "degraded",
        symbols_count=latest["total"],
        universe_active=universe_active,
        coverage_pct=coverage_pct,
        cache_status="miss",
    )
    return {
        "name": "Market Pulse",
        "trade_date": trade_date,
        "phase": phase,
        "summary": latest,
        "breadth_history": breadth_history,
        "sector_leaderboard": sector_leaderboard,
        "rotation_points": rotation_points,
        "rotation_label": "Sector participation map",
        "rotation_methodology": ROTATION_METHODOLOGY,
        "lookback_sessions": len(dates),
        "completeness": {
            "status": completeness_status,
            "latest_session_rows": latest["total"],
            "active_universe": universe_active,
            "coverage_pct": coverage_pct,
            "sessions_requested": ANALYTICS_LOOKBACK_SESSIONS,
            "sessions_available": len(dates),
        },
        "mode": "eod",
        "cache_status": "miss",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "provenance": metadata,
        "source_metadata": metadata,
    }


def load_market_analytics(client, latest_date: str) -> dict:
    dates = _recent_trade_dates(client, latest_date, ANALYTICS_LOOKBACK_SESSIONS)
    if latest_date not in dates:
        dates.append(latest_date)
        dates = sorted(set(dates))[-ANALYTICS_LOOKBACK_SESSIONS:]
    rows = _fetch_analytics_rows(client, dates)
    universe_active = None
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
        universe_active = result.count
    except Exception:
        universe_active = None
    return build_market_analytics(rows, latest_date, universe_active=universe_active)
