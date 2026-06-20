#!/usr/bin/env python3
"""Verify RS score distribution across the stock universe.

Queries rs_score for all symbols on the latest date from daily_indicators
and prints count, min, max, mean, median, std dev, and an ASCII histogram.

If std dev < 15 or range < 50, prints "RS SCORE CALIBRATION NEEDED" and exits 1.
"""

import os
import sys
import statistics

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.services.supabase import get_admin_client


def main() -> None:
    sb = get_admin_client()

    latest = (
        sb.table("daily_ohlcv")
        .select("trade_date")
        .order("trade_date", desc=True)
        .limit(1)
        .execute()
    )
    if not latest.data:
        print("No data in daily_ohlcv")
        sys.exit(1)

    latest_date = latest.data[0]["trade_date"]
    print(f"Latest trade date: {latest_date}\n")

    rows = (
        sb.table("daily_ohlcv")
        .select("symbol, rs_score")
        .eq("trade_date", latest_date)
        .not_.is_("rs_score", "null")
        .execute()
    )

    scores = [r["rs_score"] for r in rows.data if r["rs_score"] is not None]

    if not scores:
        print("No rs_score values found on latest date.")
        print("RS SCORE CALIBRATION NEEDED")
        sys.exit(1)

    count = len(scores)
    mn = min(scores)
    mx = max(scores)
    mean = statistics.mean(scores)
    median = statistics.median(scores)
    std = statistics.stdev(scores) if count > 1 else 0.0
    score_range = mx - mn

    print(f"Count:  {count}")
    print(f"Min:    {mn}")
    print(f"Max:    {mx}")
    print(f"Mean:   {mean:.1f}")
    print(f"Median: {median:.1f}")
    print(f"Std:    {std:.1f}")
    print(f"Range:  {score_range}")
    print()

    # ASCII histogram in buckets of 10
    buckets = [0] * 10
    for s in scores:
        idx = min(int(s // 10), 9)
        buckets[idx] += 1

    max_bucket = max(buckets) if buckets else 1
    print("Distribution:")
    for i, b in enumerate(buckets):
        lo = i * 10
        hi = lo + 9
        bar = "█" * max(1, int(40 * b / max_bucket)) if b > 0 else ""
        print(f"  {lo:3d}–{hi:3d}: {bar} ({b})")

    print()
    if std < 15 or score_range < 50:
        print("RS SCORE CALIBRATION NEEDED")
        sys.exit(1)
    else:
        print("RS score distribution is valid.")
        sys.exit(0)


if __name__ == "__main__":
    main()
