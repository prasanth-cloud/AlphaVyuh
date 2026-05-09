#!/usr/bin/env python3
"""Bounded scanner-intelligence backfill for daily_ohlcv.

Examples:
  python backend/scripts/backfill_scanner_intelligence.py --from-date 2026-01-01 --to-date 2026-05-08 --dry-run
  python backend/scripts/backfill_scanner_intelligence.py --from-date 2026-05-01 --to-date 2026-05-08 --symbols AUBANK,RELIANCE
"""
from __future__ import annotations

import argparse
import os
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

import pandas as pd
from dotenv import load_dotenv
from supabase import create_client

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))
load_dotenv(ROOT / "backend" / ".env")

from app.services.scanner_intelligence import compute_scanner_intelligence_frame, to_backfill_payload  # noqa: E402


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Backfill scanner helper columns in a bounded date window.")
    parser.add_argument("--from-date", required=True, help="Inclusive start date, YYYY-MM-DD.")
    parser.add_argument("--to-date", default=date.today().isoformat(), help="Inclusive end date, YYYY-MM-DD.")
    parser.add_argument("--symbols", help="Comma-separated symbols. Defaults to active stock universe.")
    parser.add_argument("--symbol-limit", type=int, default=500, help="Safety cap when symbols are not provided.")
    parser.add_argument("--batch-size", type=int, default=200)
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def _client():
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.")
    return create_client(url, key)


def _symbols(client, explicit: str | None, limit: int) -> list[str]:
    if explicit:
        return [item.strip().upper() for item in explicit.split(",") if item.strip()]

    rows = (
        client.table("stock_universe")
        .select("symbol")
        .eq("is_active", True)
        .in_("series", ["EQ", "BE"])
        .order("symbol")
        .limit(limit)
        .execute()
        .data or []
    )
    return [row["symbol"] for row in rows if row.get("symbol")]


def _history_start(from_date: str) -> str:
    parsed = datetime.strptime(from_date, "%Y-%m-%d").date()
    return (parsed - timedelta(days=520)).isoformat()


def _fetch_daily(client, symbols: list[str], from_date: str, to_date: str) -> pd.DataFrame:
    rows = (
        client.table("daily_ohlcv")
        .select("symbol,trade_date,open,high,low,close,volume,ema_150,ema_200")
        .in_("symbol", symbols)
        .gte("trade_date", _history_start(from_date))
        .lte("trade_date", to_date)
        .order("symbol")
        .order("trade_date")
        .execute()
        .data or []
    )
    return pd.DataFrame(rows)


def _upsert_batches(client, payload: list[dict], batch_size: int) -> int:
    written = 0
    for start in range(0, len(payload), batch_size):
        batch = payload[start : start + batch_size]
        client.table("daily_ohlcv").upsert(batch, on_conflict="symbol,trade_date").execute()
        written += len(batch)
    return written


def main() -> int:
    args = _parse_args()
    client = _client()
    symbols = _symbols(client, args.symbols, args.symbol_limit)
    print(f"scanner-intelligence backfill: symbols={len(symbols)} window={args.from_date}..{args.to_date} dry_run={args.dry_run}")
    if not symbols:
        print("No symbols selected.")
        return 0

    frame = _fetch_daily(client, symbols, args.from_date, args.to_date)
    if frame.empty:
        print("No daily_ohlcv rows found for requested window.")
        return 0

    computed = compute_scanner_intelligence_frame(frame)
    payload = to_backfill_payload(computed, args.from_date, args.to_date)
    print(f"computed_rows={len(computed)} bounded_payload_rows={len(payload)}")
    if args.dry_run:
        print("dry-run complete; no database writes performed.")
        return 0

    written = _upsert_batches(client, payload, args.batch_size)
    print(f"upserted_rows={written}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
