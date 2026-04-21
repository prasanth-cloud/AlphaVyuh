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

ITERATIONS = 20
P50_TARGET_MS  = 400    # SEPA scan p50 (M3-B)
VCP_P95_TARGET_MS = 1500  # VCP pass-2 p95 for Nifty 500 candidate set (M3-C)
ALL_NSE_VCP_P95_TARGET_MS = 5000  # soft target for all-NSE VCP (ADR 005 §Revisit)

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


def find_latest_trade_date(client, min_symbols: int = 500) -> str | None:
    """
    Find the most recent trade_date that has at least min_symbols rows.
    Uses count=exact per candidate date to avoid the PostgREST 1000-row cap
    that would cause sampling-based approaches to miss large date partitions.
    """
    # Discover candidate dates from the last ~30 trading days
    recent = (
        client.table("daily_ohlcv")
        .select("trade_date")
        .order("trade_date", desc=True)
        .limit(1000)
        .execute()
    )
    if not recent.data:
        return None
    candidate_dates = sorted({r["trade_date"] for r in recent.data}, reverse=True)
    for dt in candidate_dates:
        r = client.table("daily_ohlcv").select("symbol", count="exact").eq("trade_date", dt).execute()
        if (r.count or 0) >= min_symbols:
            return dt
    return candidate_dates[0] if candidate_dates else None


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


POSTGREST_ROW_CAP = 1000
VCP_BATCH_SIZE = max(1, POSTGREST_ROW_CAP // LOOKBACK_DAYS)  # 13 at LOOKBACK_DAYS=75


def bench_vcp_once(client, candidate_symbols: list[str], latest_date: str) -> tuple[float, int, int]:
    """
    Time Pass 2 exactly as _run_vcp_pass2 would run in production:
    batched fetches of LOOKBACK_DAYS rows per symbol, then pivot detection.
    """
    if not candidate_symbols:
        return 0.0, 0, 0

    t0 = time.perf_counter()

    by_symbol: dict[str, list] = defaultdict(list)
    for i in range(0, len(candidate_symbols), VCP_BATCH_SIZE):
        batch = candidate_symbols[i : i + VCP_BATCH_SIZE]
        rows = (
            client.table("daily_ohlcv")
            .select("symbol,trade_date,high,low,close,volume")
            .in_("symbol", batch)
            .lte("trade_date", latest_date)
            .order("trade_date", desc=True)
            .limit(VCP_BATCH_SIZE * LOOKBACK_DAYS)
            .execute().data or []
        )
        for row in rows:
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


def _fetch_all_symbols_for_date(client, trade_date: str) -> list[str]:
    """Fetch all symbols for a given date, bypassing the PostgREST 1000-row cap."""
    all_syms: list[str] = []
    batch = 1000
    offset = 0
    while True:
        r = (client.table("daily_ohlcv")
             .select("symbol")
             .eq("trade_date", trade_date)
             .range(offset, offset + batch - 1)
             .execute())
        chunk = [x["symbol"] for x in (r.data or [])]
        all_syms.extend(chunk)
        if len(chunk) < batch:
            break
        offset += batch
    return all_syms


def run_sepa_bench(client, trade_date: str, n_iter: int = ITERATIONS) -> tuple[list[str], dict]:
    """Run SEPA benchmark; return (candidate_symbols, stats_dict)."""
    total_syms = client.table("daily_ohlcv").select("symbol", count="exact").eq("trade_date", trade_date).execute().count or 0
    print(f"\n── SEPA Benchmark ({n_iter} runs) ──────────────────────────────────")
    print(f"trade_date={trade_date}  universe={total_syms} symbols  target: p50 < {P50_TARGET_MS}ms")

    latencies: list[float] = []
    final_symbols: list[str] = []
    for i in range(n_iter):
        ms, db_rows, filtered = bench_sepa_once(client, trade_date)
        latencies.append(ms)
        if i == n_iter - 1:
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
    p99 = percentile(latencies, 99)
    print(f"\n  p50={p50:.0f}ms  p95={p95:.0f}ms  p99={p99:.0f}ms")
    print(f"  min={min(latencies):.0f}ms  max={max(latencies):.0f}ms")
    headroom = P50_TARGET_MS - p50
    print(f"  headroom (p50 vs {P50_TARGET_MS}ms target): {headroom:+.0f}ms")

    verdict = "PASS" if p50 <= P50_TARGET_MS else "FAIL"
    print(f"  {verdict}  p50 {p50:.0f}ms vs {P50_TARGET_MS}ms target")
    if verdict == "FAIL":
        print(f"         consider Postgres CTE fallback (ADR 005 §Revisit)")
        sys.exit(1)

    stats = {"p50": p50, "p95": p95, "p99": p99, "min": min(latencies), "max": max(latencies),
             "universe": total_syms, "candidates": len(final_symbols), "trade_date": trade_date}
    return final_symbols, stats


def run_vcp_bench(
    client,
    candidate_symbols: list[str],
    latest_date: str,
    label: str = "Nifty-500-equiv",
    cap: int = 500,
    p95_target: int = VCP_P95_TARGET_MS,
    n_iter: int = ITERATIONS,
    hard_fail: bool = True,
) -> dict:
    symbols = candidate_symbols[:cap]
    print(f"\n── VCP Benchmark — {label} ({n_iter} runs, {len(symbols)} candidates) ─────")
    print(f"latest_date={latest_date}  target: p95 < {p95_target}ms")

    if not symbols:
        print("  SKIP  no candidates")
        return {}

    latencies: list[float] = []
    for i in range(n_iter):
        ms, n_cands, n_hits = bench_vcp_once(client, symbols, latest_date)
        latencies.append(ms)
        print(f"  run {i + 1:2d}: {ms:6.0f}ms  candidates={n_cands}  vcp_hits={n_hits}")

    latencies.sort()
    p50 = statistics.median(latencies)
    p95 = percentile(latencies, 95)
    p99 = percentile(latencies, 99)
    print(f"\n  p50={p50:.0f}ms  p95={p95:.0f}ms  p99={p99:.0f}ms")
    print(f"  min={min(latencies):.0f}ms  max={max(latencies):.0f}ms")
    headroom = p95_target - p95
    print(f"  headroom (p95 vs {p95_target}ms target): {headroom:+.0f}ms")

    verdict = "PASS" if p95 <= p95_target else "FAIL"
    print(f"  {verdict}  p95 {p95:.0f}ms vs {p95_target}ms target")
    if verdict == "FAIL" and hard_fail:
        print(f"         VCP pass-2 too slow — see ADR 005 §Revisit triggers")
        sys.exit(1)

    return {"p50": p50, "p95": p95, "p99": p99, "min": min(latencies), "max": max(latencies),
            "candidates": len(symbols), "label": label}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--vcp-only", action="store_true",
                        help="Skip SEPA bench; run VCP bench against all symbols with any data")
    parser.add_argument("--sepa-only", action="store_true",
                        help="Skip VCP bench")
    parser.add_argument("--trade-date", metavar="YYYY-MM-DD",
                        help="Override auto-detected trade date")
    parser.add_argument("--iterations", type=int, default=ITERATIONS,
                        help=f"Number of benchmark runs (default {ITERATIONS})")
    args = parser.parse_args()
    n_iter = args.iterations

    client = get_admin_client()

    trade_date = args.trade_date or find_latest_trade_date(client)
    if not trade_date:
        print("ERROR: no trade date with >= 500 symbols found in daily_ohlcv")
        sys.exit(1)

    if args.vcp_only:
        all_syms = _fetch_all_symbols_for_date(client, trade_date)
        run_vcp_bench(client, all_syms, trade_date, label="Nifty-500-equiv",
                      cap=500, p95_target=VCP_P95_TARGET_MS, n_iter=n_iter)
        run_vcp_bench(client, all_syms, trade_date, label="all-NSE",
                      cap=len(all_syms), p95_target=ALL_NSE_VCP_P95_TARGET_MS,
                      n_iter=n_iter, hard_fail=False)
    elif args.sepa_only:
        run_sepa_bench(client, trade_date, n_iter=n_iter)
    else:
        candidates, sepa_stats = run_sepa_bench(client, trade_date, n_iter=n_iter)
        all_syms = _fetch_all_symbols_for_date(client, trade_date)
        # Nifty 500 equiv: first 500 SEPA candidates (they passed SEPA pre-filter)
        run_vcp_bench(client, candidates, trade_date, label="Nifty-500-equiv (SEPA candidates)",
                      cap=500, p95_target=VCP_P95_TARGET_MS, n_iter=n_iter)
        # All-NSE: all symbols on this date (soft target, no hard fail)
        run_vcp_bench(client, all_syms, trade_date, label="all-NSE",
                      cap=len(all_syms), p95_target=ALL_NSE_VCP_P95_TARGET_MS,
                      n_iter=n_iter, hard_fail=False)


if __name__ == "__main__":
    main()
