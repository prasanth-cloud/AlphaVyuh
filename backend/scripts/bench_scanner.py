#!/usr/bin/env python3
"""
bench_scanner.py — M3-B/M3-C latency benchmark for push-filter + VCP (ADR 005).

SEPA benchmark (M3-B): p50 target < 400ms on full NSE+BSE universe.
VCP benchmark (M3-C): p95 target < 1500ms on Nifty 500 candidate set.

Usage:
    cd backend
    SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... .venv/bin/python scripts/bench_scanner.py
    .venv/bin/python scripts/bench_scanner.py --vcp-only
"""
from __future__ import annotations

import argparse
import statistics
import sys
import time
from collections import Counter, defaultdict

sys.path.insert(0, __file__.rsplit("/scripts/", 1)[0])

from app.routers.scanner import ScanFilters, _apply_filters
from app.scanners.vcp import detect_vcp, LOOKBACK_DAYS
from app.services.supabase import get_admin_client

ITERATIONS = 10
P50_TARGET_MS  = 400    # SEPA scan p50 (M3-B)
VCP_P95_TARGET_MS = 1500  # VCP pass-2 p95 for Nifty 500 candidate set (M3-C)

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


def bench_sepa_once(client, trade_date: str) -> tuple[float, int, int]:
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


def bench_vcp_once(client, candidate_symbols: list[str], latest_date: str) -> tuple[float, int, int]:
    """Time Pass 2 only: 75-day lookback + pivot detection on candidate_symbols."""
    if not candidate_symbols:
        return 0.0, 0, 0

    t0 = time.perf_counter()

    lookback_rows = (
        client.table("daily_ohlcv")
        .select("symbol,trade_date,high,low,close,volume")
        .in_("symbol", candidate_symbols)
        .lte("trade_date", latest_date)
        .order("trade_date", desc=True)
        .limit(LOOKBACK_DAYS * len(candidate_symbols))
        .execute().data or []
    )

    by_symbol: dict[str, list] = defaultdict(list)
    for row in lookback_rows:
        by_symbol[row["symbol"]].append(row)
    for sym in by_symbol:
        by_symbol[sym].sort(key=lambda r: r["trade_date"])
        by_symbol[sym] = by_symbol[sym][-LOOKBACK_DAYS:]

    hits = [
        sym for sym in candidate_symbols
        if detect_vcp(by_symbol.get(sym, []))
    ]

    elapsed_ms = (time.perf_counter() - t0) * 1000
    return elapsed_ms, len(candidate_symbols), len(hits)


def percentile(sorted_data: list[float], p: float) -> float:
    n = len(sorted_data)
    if n < 4:
        return sorted_data[-1]
    quantiles = statistics.quantiles(sorted_data, n=100, method="inclusive")
    idx = max(0, min(int(p) - 1, 98))
    return quantiles[idx]


def run_sepa_bench(client, trade_date: str) -> list[str]:
    """Run SEPA benchmark; return final candidate symbol list for VCP bench."""
    print(f"\n── SEPA Benchmark ({ITERATIONS} runs) ──────────────────────────────")
    print(f"trade_date={trade_date}  target: p50 < {P50_TARGET_MS}ms")

    latencies: list[float] = []
    final_symbols: list[str] = []
    for i in range(ITERATIONS):
        ms, db_rows, filtered = bench_sepa_once(client, trade_date)
        latencies.append(ms)
        if i == ITERATIONS - 1:
            # Capture candidates from the last run for VCP bench input
            q = (
                client.table("daily_ohlcv")
                .select("symbol,rsi_14,close,pct_change")
                .eq("trade_date", trade_date)
                .gte("close", SEPA_FILTERS.price_min)
                .gte("rsi_14", SEPA_FILTERS.rsi_min)
                .lte("rsi_14", SEPA_FILTERS.rsi_max)
                .gte("pct_change", SEPA_FILTERS.pct_change_min)
                .limit(10_000)
                .execute()
            )
            final_symbols = [r["symbol"] for r in (q.data or [])]
        print(f"  run {i + 1:2d}: {ms:6.0f}ms  db_rows={db_rows}  filtered={filtered}")

    latencies.sort()
    p50 = statistics.median(latencies)
    p95 = percentile(latencies, 95)
    print(f"\n  p50={p50:.0f}ms  p95={p95:.0f}ms  min={min(latencies):.0f}ms  max={max(latencies):.0f}ms")

    if p50 <= P50_TARGET_MS:
        print(f"  PASS  p50 {p50:.0f}ms <= {P50_TARGET_MS}ms")
    else:
        print(f"  FAIL  p50 {p50:.0f}ms > {P50_TARGET_MS}ms — consider Postgres CTE fallback (ADR 005)")
        sys.exit(1)

    return final_symbols


def run_vcp_bench(client, candidate_symbols: list[str], latest_date: str) -> None:
    # Use up to 500 symbols (Nifty 500 equivalent) to match the hard-fail threshold
    symbols = candidate_symbols[:500]
    print(f"\n── VCP Benchmark ({ITERATIONS} runs, {len(symbols)} candidates) ─────")
    print(f"latest_date={latest_date}  target: p95 < {VCP_P95_TARGET_MS}ms")

    if not symbols:
        print("  SKIP  no SEPA candidates to run VCP against")
        return

    latencies: list[float] = []
    for i in range(ITERATIONS):
        ms, n_cands, n_hits = bench_vcp_once(client, symbols, latest_date)
        latencies.append(ms)
        print(f"  run {i + 1:2d}: {ms:6.0f}ms  candidates={n_cands}  vcp_hits={n_hits}")

    latencies.sort()
    p95 = percentile(latencies, 95)
    p99 = percentile(latencies, 99)
    print(f"\n  p50={statistics.median(latencies):.0f}ms  p95={p95:.0f}ms  p99={p99:.0f}ms")
    print(f"  min={min(latencies):.0f}ms  max={max(latencies):.0f}ms")

    if p95 <= VCP_P95_TARGET_MS:
        print(f"  PASS  p95 {p95:.0f}ms <= {VCP_P95_TARGET_MS}ms")
    else:
        print(f"  FAIL  p95 {p95:.0f}ms > {VCP_P95_TARGET_MS}ms — VCP pass-2 too slow (ADR 005 §Revisit)")
        sys.exit(1)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--vcp-only", action="store_true",
                        help="Skip SEPA bench; run VCP bench against all symbols with any data")
    parser.add_argument("--sepa-only", action="store_true",
                        help="Skip VCP bench")
    args = parser.parse_args()

    client = get_admin_client()

    trade_date = find_latest_trade_date(client)
    if not trade_date:
        print("ERROR: no complete trade date found in daily_ohlcv (need >= 1000 rows per day)")
        sys.exit(1)

    if args.vcp_only:
        # Use a broad symbol list (all with data on this date) as VCP input
        r = client.table("daily_ohlcv").select("symbol").eq("trade_date", trade_date).limit(500).execute()
        symbols = [row["symbol"] for row in (r.data or [])]
        run_vcp_bench(client, symbols, trade_date)
    elif args.sepa_only:
        run_sepa_bench(client, trade_date)
    else:
        candidates = run_sepa_bench(client, trade_date)
        run_vcp_bench(client, candidates, trade_date)


if __name__ == "__main__":
    main()
