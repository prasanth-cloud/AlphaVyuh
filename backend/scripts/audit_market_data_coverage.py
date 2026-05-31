"""
Audit NSE universe and 5-year chart-history readiness.

Read-only. Prints aggregate coverage only; does not write schema or data.

Usage:
    cd backend
    python scripts/audit_market_data_coverage.py
    python scripts/audit_market_data_coverage.py --sample-limit 5000
"""

from __future__ import annotations

import argparse
import os
import sys
from collections import Counter
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv
from supabase import create_client

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

FIVE_YEAR_MIN_TRADING_ROWS = int(252 * 5 * 0.9)
DEFAULT_SENTINEL_SYMBOLS = ("RELIANCE", "ITC", "AUBANK")


def _client():
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")
    return create_client(url, key)


def _paged(query, *, page_size: int = 1000, max_rows: int | None = None) -> list[dict]:
    rows: list[dict] = []
    offset = 0
    while max_rows is None or len(rows) < max_rows:
        end = offset + page_size - 1
        if max_rows is not None:
            end = min(end, max_rows - 1)
        chunk = query.range(offset, end).execute().data or []
        if not chunk:
            break
        rows.extend(chunk)
        if len(chunk) < page_size:
            break
        offset += page_size
    return rows


def _active_nse_symbols(client) -> list[str]:
    rows = _paged(
        client.table("stock_universe")
        .select("symbol")
        .eq("is_active", True)
        .eq("market", "NSE")
        .eq("series", "EQ")
        .order("symbol")
    )
    return [row["symbol"] for row in rows if row.get("symbol")]


def _audit_history(client, symbols: list[str], start_date: date, max_rows: int | None) -> tuple[Counter[str], Counter[str]]:
    by_symbol: Counter[str] = Counter()
    latest_counts: Counter[str] = Counter()
    batch_size = 100
    for index in range(0, len(symbols), batch_size):
        batch = symbols[index:index + batch_size]
        query = (
            client.table("daily_ohlcv")
            .select("symbol,trade_date,close,volume")
            .in_("symbol", batch)
            .gte("trade_date", str(start_date))
            .order("trade_date", desc=False)
        )
        for row in _paged(query, max_rows=max_rows):
            symbol = row.get("symbol")
            trade_date = row.get("trade_date")
            if symbol and trade_date:
                by_symbol[symbol] += 1
                latest_counts[trade_date] += 1
    return by_symbol, latest_counts


def _sentinel_counts(client, symbols: list[str], start_date: date) -> dict[str, int]:
    if not symbols:
        return {}
    counts: dict[str, int] = {}
    query = (
        client.table("daily_ohlcv")
        .select("symbol,trade_date")
        .in_("symbol", symbols)
        .gte("trade_date", str(start_date))
        .order("trade_date", desc=False)
    )
    for row in _paged(query):
        symbol = row.get("symbol")
        if symbol:
            counts[symbol] = counts.get(symbol, 0) + 1
    return counts


def _rpc_audit(client, years: int) -> dict | None:
    try:
        result = client.rpc("market_data_coverage_audit", {"p_years": years}).execute()
        rows = result.data or []
        if rows:
            return rows[0]
    except Exception:
        return None
    return None


def main() -> int:
    parser = argparse.ArgumentParser(description="Audit market data coverage for AlphaVyuh.")
    parser.add_argument("--years", type=int, default=5, help="History window to audit")
    parser.add_argument("--sample-limit", type=int, default=None, help="Optional row cap per symbol batch for quick checks")
    parser.add_argument(
        "--sentinel-symbols",
        default=",".join(DEFAULT_SENTINEL_SYMBOLS),
        help="Comma-separated established symbols that should satisfy the 5Y launch contract",
    )
    parser.add_argument("--fail-under-contract", action="store_true", help="Exit non-zero if any sentinel is below the 5Y row contract")
    args = parser.parse_args()

    client = _client()
    sentinel_symbols = [symbol.strip().upper() for symbol in args.sentinel_symbols.split(",") if symbol.strip()]
    if args.sample_limit is None:
        rpc = _rpc_audit(client, args.years)
        if rpc:
            print("Market data coverage audit")
            print(f"  Active NSE EQ symbols:      {rpc.get('active_nse_eq_symbols')}")
            print(f"  Window start:               {rpc.get('window_start')}")
            print(f"  Latest covered trade date:  {rpc.get('latest_covered_trade_date')}")
            print(f"  Symbols on latest date:     {rpc.get('symbols_on_latest_date')}")
            print(f"  {args.years}Y chart-ready:          {rpc.get('chart_ready_symbols')}")
            print(f"  Partial history:            {rpc.get('partial_history_symbols')}")
            print(f"  Missing history:            {rpc.get('missing_history_symbols')}")
            print(f"  Min 5Y daily rows/sentinel: {FIVE_YEAR_MIN_TRADING_ROWS}")
            print("  Path:                       database RPC")
            if not sentinel_symbols:
                return 0
            window_start = rpc.get("window_start")
            try:
                sentinel_start = date.fromisoformat(str(window_start))
            except ValueError:
                sentinel_start = date.today() - timedelta(days=365 * args.years + 10)
            counts = _sentinel_counts(client, sentinel_symbols, sentinel_start)
            weak = [symbol for symbol in sentinel_symbols if counts.get(symbol, 0) < FIVE_YEAR_MIN_TRADING_ROWS]
            print(f"  Sentinel symbols:           {', '.join(f'{symbol}({counts.get(symbol, 0)})' for symbol in sentinel_symbols)}")
            if weak:
                print(f"  Sentinel below contract:    {', '.join(weak)}")
            return 1 if args.fail_under_contract and weak else 0

    symbols = _active_nse_symbols(client)
    start_date = date.today() - timedelta(days=365 * args.years + 10)

    by_symbol, latest_counts = _audit_history(client, symbols, start_date, args.sample_limit)

    min_trading_rows = int(252 * args.years * 0.9)
    chart_ready = [symbol for symbol in symbols if by_symbol.get(symbol, 0) >= min_trading_rows]
    partial = [symbol for symbol in symbols if symbol not in chart_ready and by_symbol.get(symbol)]
    missing = [symbol for symbol in symbols if not by_symbol.get(symbol)]
    latest_date, latest_count = latest_counts.most_common(1)[0] if latest_counts else (None, 0)

    print("Market data coverage audit")
    print(f"  Active NSE EQ symbols:      {len(symbols)}")
    print(f"  Window start:               {start_date}")
    print(f"  Latest covered trade date:  {latest_date}")
    print(f"  Symbols on latest date:     {latest_count}")
    print(f"  {args.years}Y chart-ready:          {len(chart_ready)}")
    print(f"  Partial history:            {len(partial)}")
    print(f"  Missing history:            {len(missing)}")
    print(f"  Min 5Y daily rows/sentinel: {FIVE_YEAR_MIN_TRADING_ROWS}")
    sentinel_counts = {symbol: by_symbol.get(symbol, 0) for symbol in sentinel_symbols}
    weak = [symbol for symbol in sentinel_symbols if sentinel_counts.get(symbol, 0) < FIVE_YEAR_MIN_TRADING_ROWS]
    if sentinel_symbols:
        print(f"  Sentinel symbols:           {', '.join(f'{symbol}({sentinel_counts.get(symbol, 0)})' for symbol in sentinel_symbols)}")
    if weak:
        print(f"  Sentinel below contract:    {', '.join(weak)}")
    if missing[:10]:
        print(f"  Missing sample:             {', '.join(missing[:10])}")
    if partial[:10]:
        sample = ", ".join(f"{symbol}({by_symbol[symbol]})" for symbol in partial[:10])
        print(f"  Partial sample:             {sample}")
    return 1 if args.fail_under_contract and weak else 0


if __name__ == "__main__":
    raise SystemExit(main())
