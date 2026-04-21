#!/usr/bin/env python3
"""
bench_scanner.py — M3-B latency benchmark for push-filter optimization (ADR 005).

Runs ITERATIONS of a SEPA-style scan against the latest trade_date and reports
p50/p95/p99 latency. Per ADR 005 §Required optimizations (M3-B): p50 must be
< 400ms for a typical SEPA scan on the full NSE+BSE universe.

Usage:
    cd backend
    SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... .venv/bin/python scripts/bench_scanner.py

    Or with .env:
    set -a && source .env && set +a
    .venv/bin/python scripts/bench_scanner.py
"""
from __future__ import annotations

import statistics
import sys
import time
from collections import Counter

sys.path.insert(0, __file__.rsplit("/scripts/", 1)[0])

from app.routers.scanner import ScanFilters, _apply_filters
from app.services.supabase import get_admin_client

ITERATIONS = 10
P50_TARGET_MS = 400

# Typical SEPA pre-filter: price > 50, RSI 55-80, positive day, above key EMAs
SEPA_FILTERS = ScanFilters(
    price_min=50,
    rsi_min=55,
    rsi_max=80,
    pct_change_min=0,
    series=["EQ"],
    price_vs_ema20="above",
    price_vs_ema50="above",
    price_vs_ema200="above",
)

SELECT_COLS = (
    "symbol,open,high,low,close,prev_close,volume,avg_volume_20d,"
    "turnover,rsi_14,ema_20,ema_50,ema_200,week_52_high,week_52_low,atr_14,"
    "pct_change,gap_pct,macd_line,macd_signal,macd_hist,"
    "bb_upper,bb_middle,bb_lower,bb_width,"
    "stoch_k,stoch_d,adx_14,cci_20,williams_r,"
    "delivery_pct,is_new_52w_high,is_new_52w_low,is_inside_bar,is_outside_bar,"
    "rs_rating,sma_50,sma_150,sma_200,volume_ratio,w52h_pct,w52l_pct,"
    "stock_universe!daily_ohlcv_symbol_fkey!inner"
    "(symbol,company_name,series,sector,is_active,market,currency,"
    "market_cap_cr,pe_ratio,pb_ratio,eps,dividend_yield,debt_to_equity,roe,roce)"
)


def find_latest_trade_date(client) -> str | None:
    dr = (
        client.table("daily_ohlcv")
        .select("trade_date")
        .order("trade_date", desc=True)
        .limit(5000)
        .execute()
    )
    if not dr.data:
        return None
    date_counts = Counter(r["trade_date"] for r in dr.data)
    return next(
        (d for d in sorted(date_counts, reverse=True) if date_counts[d] >= 1000),
        dr.data[0]["trade_date"],
    )


def bench_once(client, trade_date: str) -> tuple[float, int, int]:
    """Returns (elapsed_ms, rows_from_db, rows_after_filter)."""
    t0 = time.perf_counter()

    q = (
        client.table("daily_ohlcv")
        .select(SELECT_COLS)
        .eq("trade_date", trade_date)
        .gte("close", SEPA_FILTERS.price_min)
        .gte("rsi_14", SEPA_FILTERS.rsi_min)
        .lte("rsi_14", SEPA_FILTERS.rsi_max)
        .gte("pct_change", SEPA_FILTERS.pct_change_min)
        .limit(10_000)
    )
    rows = q.execute().data or []
    results = _apply_filters(rows, SEPA_FILTERS)

    elapsed_ms = (time.perf_counter() - t0) * 1000
    return elapsed_ms, len(rows), len(results)


def percentile(sorted_data: list[float], p: float) -> float:
    idx = max(0, int(p / 100 * len(sorted_data)) - 1)
    return sorted_data[min(idx, len(sorted_data) - 1)]


def main() -> None:
    client = get_admin_client()

    trade_date = find_latest_trade_date(client)
    if not trade_date:
        print("ERROR: no complete trade date found in daily_ohlcv (need >= 1000 rows per day)")
        sys.exit(1)

    print(f"Benchmark: SEPA scan  |  trade_date={trade_date}  |  {ITERATIONS} iterations")
    print(f"Filters: price>={SEPA_FILTERS.price_min}, rsi={SEPA_FILTERS.rsi_min}-{SEPA_FILTERS.rsi_max}, "
          f"pct_change>={SEPA_FILTERS.pct_change_min}, above EMA20/50/200, series=EQ")
    print()

    latencies: list[float] = []
    for i in range(ITERATIONS):
        ms, db_rows, filtered = bench_once(client, trade_date)
        latencies.append(ms)
        print(f"  run {i + 1:2d}: {ms:6.0f}ms  |  db_rows={db_rows}  filtered={filtered}")

    latencies.sort()
    p50 = statistics.median(latencies)
    p95 = percentile(latencies, 95)
    p99 = percentile(latencies, 99)

    print()
    print(f"Results ({ITERATIONS} runs, sorted):")
    print(f"  p50 = {p50:.0f}ms  (ADR 005 target: <{P50_TARGET_MS}ms)")
    print(f"  p95 = {p95:.0f}ms")
    print(f"  p99 = {p99:.0f}ms")
    print(f"  min = {min(latencies):.0f}ms  max = {max(latencies):.0f}ms")
    print()

    if p50 <= P50_TARGET_MS:
        print(f"PASS  p50 {p50:.0f}ms <= {P50_TARGET_MS}ms target")
    else:
        print(f"FAIL  p50 {p50:.0f}ms > {P50_TARGET_MS}ms — consider Postgres CTE fallback (ADR 005 §Revisit)")
        sys.exit(1)


if __name__ == "__main__":
    main()
