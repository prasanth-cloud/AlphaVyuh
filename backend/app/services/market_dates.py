from __future__ import annotations

from collections import Counter


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
                "trade_date,symbol,close,prev_close,"
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
        if "close" in row and "prev_close" in row:
            try:
                close = float(row.get("close") or 0)
                prev_close = float(row.get("prev_close") or 0)
            except (TypeError, ValueError):
                continue
            if close <= 0 or prev_close <= 0:
                continue
        date_symbols.setdefault(trade_date, set()).add(row.get("symbol") or "")

    date_counts = Counter({
        trade_date: len(symbols - {""})
        for trade_date, symbols in date_symbols.items()
    })
    complete_date = next(
        (trade_date for trade_date in sorted(date_counts, reverse=True) if date_counts[trade_date] >= required_rows),
        None,
    )
    if complete_date:
        return complete_date
    if active_universe and date_counts:
        return max(date_counts, key=date_counts.get)
    return rows[0]["trade_date"]
