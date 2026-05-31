from __future__ import annotations

from collections import Counter
from typing import Any


MIN_QUALITY_SAMPLE_ROWS = 500
MAX_FLAT_BREADTH_RATIO = 0.85
MAX_PREVIOUS_DUPLICATE_RATIO = 0.85
MIN_MOVING_BREADTH_RATIO = 0.08
UNCHANGED_MOVE_THRESHOLD_PCT = 0.05


def _f(value: Any, default=None):
    try:
        return float(value) if value is not None else default
    except (TypeError, ValueError):
        return default


def _i(value: Any, default=None):
    try:
        return int(float(value)) if value is not None else default
    except (TypeError, ValueError):
        return default


def _pct_change(row: dict) -> float | None:
    close = _f(row.get("close"), None)
    prev_close = _f(row.get("prev_close"), None)
    stored_pct_change = _f(row.get("pct_change"), None)
    if close is None or close <= 0:
        return None
    if prev_close and prev_close > 0:
        return (close - prev_close) / prev_close * 100
    return stored_pct_change


def _ohlcv_signature(row: dict) -> tuple | None:
    values = [
        _f(row.get("open"), None),
        _f(row.get("high"), None),
        _f(row.get("low"), None),
        _f(row.get("close"), None),
        _i(row.get("volume"), None),
    ]
    if any(value is None for value in values):
        return None
    return tuple(round(value, 4) if isinstance(value, float) else value for value in values)


def analyze_trade_date_quality(
    rows: list[dict],
    previous_rows: list[dict] | None = None,
    *,
    min_sample_rows: int = MIN_QUALITY_SAMPLE_ROWS,
) -> dict:
    pct_changes = [
        pct_change
        for row in rows
        if (pct_change := _pct_change(row)) is not None
    ]
    total = len(pct_changes)
    advances = sum(1 for pct_change in pct_changes if pct_change > UNCHANGED_MOVE_THRESHOLD_PCT)
    declines = sum(1 for pct_change in pct_changes if pct_change < -UNCHANGED_MOVE_THRESHOLD_PCT)
    unchanged = total - advances - declines
    moving = advances + declines
    flat_ratio = (unchanged / total) if total else 0
    moving_ratio = (moving / total) if total else 0

    duplicate_count = 0
    comparable_count = 0
    if previous_rows:
        previous_by_symbol = {
            row.get("symbol"): signature
            for row in previous_rows
            if row.get("symbol") and (signature := _ohlcv_signature(row)) is not None
        }
        for row in rows:
            symbol = row.get("symbol")
            signature = _ohlcv_signature(row)
            previous_signature = previous_by_symbol.get(symbol)
            if signature is None or previous_signature is None:
                continue
            comparable_count += 1
            if signature == previous_signature:
                duplicate_count += 1
    duplicate_ratio = (duplicate_count / comparable_count) if comparable_count else 0

    reasons: list[str] = []
    if total >= min_sample_rows and flat_ratio >= MAX_FLAT_BREADTH_RATIO and moving_ratio < MIN_MOVING_BREADTH_RATIO:
        reasons.append(
            f"implausibly flat breadth: advances={advances}, declines={declines}, unchanged={unchanged}"
        )
    if (
        comparable_count >= min_sample_rows
        and duplicate_ratio >= MAX_PREVIOUS_DUPLICATE_RATIO
    ):
        reasons.append(
            f"duplicated previous session rows: {duplicate_count}/{comparable_count}"
        )

    return {
        "is_suspicious": bool(reasons),
        "reasons": reasons,
        "total": total,
        "advances": advances,
        "declines": declines,
        "unchanged": unchanged,
        "flat_ratio": flat_ratio,
        "moving_ratio": moving_ratio,
        "duplicate_count": duplicate_count,
        "comparable_count": comparable_count,
        "duplicate_ratio": duplicate_ratio,
    }


def _active_nse_eq_universe_count(client) -> int | None:
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


def get_latest_complete_trade_date(
    client,
    *,
    min_rows: int = 1000,
    lookback_rows: int = 20000,
    min_coverage_pct: float = 0.75,
) -> str | None:
    """
    Return the most recent trade_date with enough rows to represent a full market day.

    Partial ingests can leave a newer trade_date with only a few hundred rows, which
    makes breadth metrics and market summaries misleading. When that happens, fall back
    to the latest sufficiently populated date instead of the raw max(trade_date).
    """
    active_universe = _active_nse_eq_universe_count(client)
    required_rows = min_rows
    if active_universe:
        required_rows = max(min_rows, int(active_universe * min_coverage_pct))

    rows: list[dict] = []
    offset = 0
    page_size = min(1000, lookback_rows)
    while len(rows) < lookback_rows:
        result = (
            client.table("daily_ohlcv")
            .select(
                "trade_date,symbol,open,high,low,close,prev_close,volume,pct_change,"
                "stock_universe!daily_ohlcv_symbol_fkey!inner(series,market,is_active)"
            )
            .order("trade_date", desc=True)
            .range(offset, offset + page_size - 1)
            .execute()
        )
        chunk = result.data or []
        if not chunk:
            break
        rows.extend(chunk)
        if len(chunk) < page_size:
            break
        offset += page_size

    if not rows:
        return None

    date_symbols: dict[str, set[str]] = {}
    date_rows: dict[str, list[dict]] = {}
    for row in rows:
        trade_date = row.get("trade_date")
        if not trade_date:
            continue
        universe_row = row.get("stock_universe")
        if universe_row is not None:
            if universe_row.get("series") != "EQ" or universe_row.get("market") != "NSE":
                continue
            if not universe_row.get("is_active", True):
                continue
        if "close" in row:
            try:
                close = float(row.get("close") or 0)
                prev_close = float(row.get("prev_close") or 0)
            except (TypeError, ValueError):
                continue
            if close <= 0:
                continue
            if prev_close <= 0 and row.get("pct_change") is None:
                continue
        date_symbols.setdefault(trade_date, set()).add(row.get("symbol") or "")
        date_rows.setdefault(trade_date, []).append(row)

    date_counts = Counter({
        trade_date: len(symbols - {""})
        for trade_date, symbols in date_symbols.items()
    })
    sorted_dates = sorted(date_counts, reverse=True)
    for index, trade_date in enumerate(sorted_dates):
        if date_counts[trade_date] < required_rows:
            continue
        previous_trade_date = sorted_dates[index + 1] if index + 1 < len(sorted_dates) else None
        quality = analyze_trade_date_quality(
            date_rows.get(trade_date, []),
            date_rows.get(previous_trade_date, []) if previous_trade_date else None,
        )
        if not quality["is_suspicious"]:
            return trade_date

    if active_universe and date_counts:
        trustworthy_counts = {
            trade_date: count
            for trade_date, count in date_counts.items()
            if not analyze_trade_date_quality(date_rows.get(trade_date, []))["is_suspicious"]
        }
        if trustworthy_counts:
            return max(trustworthy_counts, key=trustworthy_counts.get)
        return None
    for trade_date in sorted_dates:
        if not analyze_trade_date_quality(date_rows.get(trade_date, []))["is_suspicious"]:
            return trade_date
    return None
