"""
AlphaVyuh — Daily NSE data refresh.

Runs at 4:30 PM IST on NSE trading days (via GitHub Actions cron or local cron).
Reuses existing ingest services — bhavcopy for full NSE universe,
yfinance for top-200 fallback when bhavcopy is unavailable.

Usage:
    python scripts/daily_refresh.py                    # today's EOD
    python scripts/daily_refresh.py --date 2026-04-18  # specific date
    python scripts/daily_refresh.py --dry-run          # log only, no writes
    python scripts/daily_refresh.py --force            # ignore weekend check
    python scripts/daily_refresh.py --yfinance-only    # skip bhavcopy, use yfinance
"""

import argparse
import asyncio
import os
import sys
import time
import traceback
from datetime import date, datetime
from pathlib import Path

# Load .env from backend/ regardless of invocation directory
sys.path.insert(0, str(Path(__file__).parent.parent))
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent / ".env")


class Logger:
    def __init__(self, run_id: str):
        self.run_id = run_id
        self.started = datetime.utcnow()
        self.events: list[dict] = []
        self.errors: list[dict] = []

    def info(self, msg: str):
        ts = datetime.utcnow().strftime("%H:%M:%S")
        print(f"[{ts}] {msg}")
        self.events.append({"level": "info", "msg": msg, "ts": ts})

    def error(self, msg: str, exc: Exception | None = None):
        ts = datetime.utcnow().strftime("%H:%M:%S")
        err_text = f"{msg}: {exc}" if exc else msg
        print(f"[{ts}] ERROR: {err_text}", file=sys.stderr)
        self.errors.append({
            "msg": err_text,
            "ts": ts,
            "trace": traceback.format_exc() if exc else None,
        })

    def duration_s(self) -> float:
        return (datetime.utcnow() - self.started).total_seconds()


def is_nse_trading_day(d: date) -> bool:
    """Mon–Fri only. NSE holiday list not included — add later."""
    return d.weekday() < 5


def write_run_log(sb, log: Logger, result_meta: dict):
    """Persist run summary to ingest_runs table (best-effort)."""
    try:
        sb.table("ingest_runs").insert({
            "run_id": log.run_id,
            "started_at": log.started.isoformat(),
            "duration_s": round(log.duration_s(), 1),
            "event_count": len(log.events),
            "error_count": len(log.errors),
            "errors": log.errors[:5],
            "meta": result_meta,
        }).execute()
    except Exception as e:
        print(f"[WARN] Could not write run log: {e}", file=sys.stderr)


async def run_bhavcopy(target: date, log: Logger) -> dict:
    """
    Download NSE bhavcopy and ingest full universe (~3000 symbols).
    Returns status dict from bhavcopy service.
    """
    from app.services.bhavcopy import download_and_ingest
    log.info(f"Starting bhavcopy ingest for {target}...")
    result = await download_and_ingest(target)
    status = result.get("status", "unknown")
    rows = result.get("rows_ingested", 0)
    log.info(f"  Bhavcopy: status={status}, rows_ingested={rows}")
    return result


def run_yfinance_top200(target: date, log: Logger, dry_run: bool = False) -> dict:
    """
    Refresh top-200 NSE symbols via yfinance (fallback / supplement).
    Uses period='5d' so we always catch the latest trading day.
    """
    from app.services.yfinance_ingest import fetch_and_ingest, NSE_UNIVERSE

    log.info("Starting yfinance refresh for top-200 symbols...")
    success, failures = 0, []

    for sym in NSE_UNIVERSE[:200]:
        if dry_run:
            log.info(f"  [dry-run] would refresh {sym}")
            success += 1
            continue
        try:
            r = fetch_and_ingest(sym, period="5d")
            if r.get("status") == "success":
                success += 1
            else:
                failures.append(sym)
        except Exception as e:
            failures.append(sym)
            log.error(f"  yfinance {sym}", e)
        time.sleep(0.25)

    log.info(f"  yfinance: {success}/200 updated, {len(failures)} failures")
    return {"success": success, "failures": failures[:10]}


def main() -> int:
    parser = argparse.ArgumentParser(description="AlphaVyuh daily data refresh")
    parser.add_argument("--date", help="YYYY-MM-DD (default: today)")
    parser.add_argument("--dry-run", action="store_true", help="Log only, no writes")
    parser.add_argument("--force", action="store_true", help="Ignore weekend check")
    parser.add_argument("--yfinance-only", action="store_true", help="Skip bhavcopy; use yfinance top-200")
    parser.add_argument("--skip-yfinance", action="store_true", help="Skip yfinance supplement step")
    args = parser.parse_args()

    target = datetime.strptime(args.date, "%Y-%m-%d").date() if args.date else date.today()
    run_id = f"refresh-{target}-{datetime.utcnow().strftime('%H%M%S')}"
    log = Logger(run_id)

    log.info("═══════════════════════════════════════════════════════")
    log.info(f"AlphaVyuh daily refresh — target: {target}  run: {run_id}")
    log.info("═══════════════════════════════════════════════════════")

    if not args.force and not is_nse_trading_day(target):
        log.info(f"{target} is a weekend. Use --force to override.")
        return 0

    if not os.getenv("SUPABASE_URL"):
        log.error("SUPABASE_URL not set in environment")
        return 1

    from supabase import create_client
    sb = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_ROLE_KEY"))

    result_meta: dict = {}

    # ── Step 1: bhavcopy (full NSE universe) ─────────────────────────────────
    if not args.yfinance_only:
        if args.dry_run:
            log.info("[dry-run] would run bhavcopy ingest")
            result_meta["bhavcopy"] = {"status": "dry-run"}
        else:
            try:
                bhavcopy_result = asyncio.run(run_bhavcopy(target, log))
                result_meta["bhavcopy"] = bhavcopy_result
            except Exception as e:
                log.error("Bhavcopy ingest failed", e)
                result_meta["bhavcopy"] = {"status": "failed", "error": str(e)}

    # ── Step 2: yfinance top-200 supplement ──────────────────────────────────
    if not args.skip_yfinance:
        try:
            yf_result = run_yfinance_top200(target, log, dry_run=args.dry_run)
            result_meta["yfinance"] = yf_result
        except Exception as e:
            log.error("yfinance refresh failed", e)
            result_meta["yfinance"] = {"status": "failed", "error": str(e)}

    # ── Step 3: write run log ─────────────────────────────────────────────────
    if not args.dry_run:
        write_run_log(sb, log, result_meta)

    log.info("───────────────────────────────────────────────────────")
    log.info(f"Done. Duration: {log.duration_s():.1f}s · Errors: {len(log.errors)}")

    return 0 if len(log.errors) == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
