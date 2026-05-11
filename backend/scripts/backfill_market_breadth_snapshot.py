"""
Build or verify the dashboard market breadth snapshot for one market day.

This is intentionally a narrow operator tool: it writes only one ingest_runs
metadata row with run_id market-breadth-snapshot-YYYY-MM-DD. It does not touch
schema, orders, broker state, or user data.

Usage:
    python scripts/backfill_market_breadth_snapshot.py
    python scripts/backfill_market_breadth_snapshot.py --date 2026-05-08
    python scripts/backfill_market_breadth_snapshot.py --verify-only
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv
from supabase import create_client

from app.services.market_breadth_snapshot import (
    SNAPSHOT_RUN_ID_PREFIX,
    persist_market_breadth_snapshot,
    read_market_breadth_snapshot,
)
from app.services.market_dates import get_latest_complete_trade_date

load_dotenv(Path(__file__).parent.parent / ".env")


def _client():
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")
    return create_client(url, key)


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Backfill one market breadth dashboard snapshot.")
    parser.add_argument("--date", help="Trade date to snapshot, YYYY-MM-DD. Defaults to latest complete market day.")
    parser.add_argument("--verify-only", action="store_true", help="Read the stored snapshot without writing.")
    return parser.parse_args()


def main() -> int:
    args = _parse_args()
    client = _client()

    trade_date = args.date or get_latest_complete_trade_date(client)
    if not trade_date:
        print("No complete market day found.")
        return 1

    if args.verify_only:
        snapshot = read_market_breadth_snapshot(
            client,
            trade_date,
            indices=[],
            quote_source="latest_complete_session",
            indices_live=False,
        )
        if not snapshot:
            print(f"Snapshot missing for {trade_date}.")
            return 1
        print(
            "Snapshot verified: "
            f"date={snapshot.get('trade_date')} "
            f"run_id={SNAPSHOT_RUN_ID_PREFIX}-{trade_date} "
            f"total={snapshot.get('total')} "
            f"coverage={snapshot.get('coverage_pct')}% "
            f"generated_at={snapshot.get('generated_at')}"
        )
        return 0

    started = datetime.now(timezone.utc)
    snapshot = persist_market_breadth_snapshot(client, trade_date)
    duration = (datetime.now(timezone.utc) - started).total_seconds()
    print(
        "Snapshot backfilled: "
        f"date={snapshot.get('trade_date')} "
        f"run_id={SNAPSHOT_RUN_ID_PREFIX}-{snapshot.get('trade_date')} "
        f"total={snapshot.get('total')} "
        f"coverage={snapshot.get('coverage_pct')}% "
        f"phase={snapshot.get('market_phase')} "
        f"duration={duration:.1f}s"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
