from __future__ import annotations

from collections import Counter


def get_latest_complete_trade_date(client, *, min_rows: int = 1000, lookback_rows: int = 5000) -> str | None:
    """
    Return the most recent trade_date with enough rows to represent a full market day.

    Partial ingests can leave a newer trade_date with only a few hundred rows, which
    makes breadth metrics and market summaries misleading. When that happens, fall back
    to the latest sufficiently populated date instead of the raw max(trade_date).
    """
    rows: list[dict] = []
    offset = 0
    page_size = min(1000, lookback_rows)
    while len(rows) < lookback_rows:
        result = (
            client.table("daily_ohlcv")
            .select("trade_date")
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

    date_counts = Counter(row["trade_date"] for row in rows if row.get("trade_date"))
    complete_date = next(
        (trade_date for trade_date in sorted(date_counts, reverse=True) if date_counts[trade_date] >= min_rows),
        None,
    )
    return complete_date or rows[0]["trade_date"]
