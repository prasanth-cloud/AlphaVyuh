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
        self.warnings: list[dict] = []
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

    def warn(self, msg: str, exc: Exception | None = None):
        ts = datetime.utcnow().strftime("%H:%M:%S")
        warn_text = f"{msg}: {exc}" if exc else msg
        print(f"[{ts}] WARN: {warn_text}")
        self.warnings.append({
            "msg": warn_text,
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
        meta = dict(result_meta)
        if log.warnings:
            meta["warnings"] = log.warnings[:10]
        sb.table("ingest_runs").insert({
            "run_id": log.run_id,
            "started_at": log.started.isoformat(),
            "duration_s": round(log.duration_s(), 1),
            "event_count": len(log.events),
            "error_count": len(log.errors),
            "errors": log.errors[:5],
            "meta": meta,
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


def classify_yfinance_failure(status: str | None = None, error: str | None = None) -> str:
    text = f"{status or ''} {error or ''}".lower()
    if "too many requests" in text or "rate limit" in text or "rate_limited" in text or "429" in text:
        return "rate_limited"
    if status == "no_data" or "no data" in text:
        return "no_data"
    if status:
        return status
    return "error"


def _yfinance_rate_limit_backoff_s() -> float:
    raw = os.getenv("YFINANCE_RATE_LIMIT_BACKOFF_S", "2")
    try:
        return max(0.0, min(float(raw), 30.0))
    except ValueError:
        return 2.0


def run_yfinance_top200(target: date, log: Logger, dry_run: bool = False) -> dict:
    """
    Refresh top-200 NSE symbols via yfinance (fallback / supplement).
    Uses period='5d' so we always catch the latest trading day.
    """
    from app.services.yfinance_ingest import fetch_and_ingest, NSE_UNIVERSE

    log.info("Starting yfinance refresh for top-200 symbols...")
    symbols = NSE_UNIVERSE[:200]
    success = 0
    rows_updated = 0
    failures: list[dict] = []
    failure_reasons: dict[str, int] = {}
    rate_limited = 0
    backoff_s = _yfinance_rate_limit_backoff_s()

    for sym in symbols:
        if dry_run:
            log.info(f"  [dry-run] would refresh {sym}")
            success += 1
            continue
        try:
            r = fetch_and_ingest(sym, period="5d")
            if r.get("status") == "success":
                success += 1
                rows_updated += int(r.get("rows") or 0)
            else:
                reason = classify_yfinance_failure(r.get("status"), r.get("error"))
                failure_reasons[reason] = failure_reasons.get(reason, 0) + 1
                if reason == "rate_limited":
                    rate_limited += 1
                    if backoff_s:
                        time.sleep(backoff_s)
                failures.append({
                    "symbol": sym,
                    "status": r.get("status", "unknown"),
                    "reason": reason,
                    "error": str(r.get("error") or "")[:180],
                })
        except Exception as e:
            reason = classify_yfinance_failure(error=str(e))
            failure_reasons[reason] = failure_reasons.get(reason, 0) + 1
            if reason == "rate_limited":
                rate_limited += 1
                if backoff_s:
                    time.sleep(backoff_s)
            failures.append({
                "symbol": sym,
                "status": "exception",
                "reason": reason,
                "error": str(e)[:180],
            })
        time.sleep(0.25)

    attempted = len(symbols)
    failed = len(failures)
    coverage_pct = round((success / attempted) * 100, 1) if attempted else 0.0
    if dry_run:
        status = "dry-run"
    elif failed == 0:
        status = "success"
    elif success == 0:
        status = "failed"
    else:
        status = "degraded"

    detail = (
        f"  yfinance: status={status}, updated={success}/{attempted}, "
        f"failures={failed}, rate_limited={rate_limited}, rows={rows_updated}"
    )
    if status in {"degraded", "failed"}:
        log.warn(detail)
    else:
        log.info(detail)
    return {
        "status": status,
        "attempted": attempted,
        "success": success,
        "failed": failed,
        "coverage_pct": coverage_pct,
        "rows_updated": rows_updated,
        "rate_limited": rate_limited,
        "failure_reasons": failure_reasons,
        "failures": failures[:10],
    }


def summarize_supplemental_data(result_meta: dict, *, yfinance_only: bool = False, skip_yfinance: bool = False) -> dict:
    """Summarize non-critical indicator supplements without hiding degraded coverage."""
    warnings: list[str] = []
    status = "healthy"

    bhavcopy = result_meta.get("bhavcopy") if isinstance(result_meta.get("bhavcopy"), dict) else {}
    rs_score = bhavcopy.get("rs_score") if isinstance(bhavcopy, dict) else None
    if isinstance(rs_score, dict) and rs_score.get("status") == "failed":
        status = "degraded"
        warnings.append("RS score calculation failed for the latest bhavcopy run.")

    yfinance = result_meta.get("yfinance") if isinstance(result_meta.get("yfinance"), dict) else None
    if skip_yfinance:
        yfinance_summary = {"status": "skipped"}
    elif yfinance:
        yfinance_status = yfinance.get("status")
        yfinance_summary = {
            "status": yfinance_status,
            "attempted": yfinance.get("attempted"),
            "success": yfinance.get("success"),
            "failed": yfinance.get("failed"),
            "coverage_pct": yfinance.get("coverage_pct"),
            "rate_limited": yfinance.get("rate_limited"),
            "failure_reasons": yfinance.get("failure_reasons") or {},
        }
        if yfinance_status in {"degraded", "failed"}:
            status = "failed" if yfinance_only and yfinance_status == "failed" else "degraded"
            warnings.append(
                "yfinance supplement degraded: "
                f"{yfinance.get('success', 0)}/{yfinance.get('attempted', 0)} symbols updated."
            )
    else:
        yfinance_summary = {"status": "missing"}
        if yfinance_only:
            status = "failed"
            warnings.append("yfinance-only refresh did not produce supplement metadata.")

    return {
        "status": status,
        "warnings": warnings,
        "rs_score": rs_score or {"status": "not_run" if yfinance_only else "unknown"},
        "yfinance": yfinance_summary,
    }


def build_breadth_snapshot(sb, target: date, log: Logger, dry_run: bool = False) -> dict:
    """Persist the dashboard breadth read model after all market data updates."""
    if dry_run:
        log.info(f"[dry-run] would build market breadth snapshot for {target}")
        return {"status": "dry-run"}

    from app.services.market_breadth_snapshot import persist_market_breadth_snapshot

    log.info(f"Building market breadth snapshot for {target}...")
    snapshot = persist_market_breadth_snapshot(sb, target)
    log.info(
        "  market breadth snapshot: "
        f"total={snapshot.get('total', 0)}, coverage={snapshot.get('coverage_pct')}%"
    )
    return {
        "status": "success",
        "trade_date": str(target),
        "total": snapshot.get("total", 0),
        "coverage_pct": snapshot.get("coverage_pct"),
        "generated_at": snapshot.get("generated_at"),
    }


def should_run_scan_alerts(bhavcopy_result: dict | None, *, dry_run: bool, yfinance_only: bool) -> tuple[bool, str]:
    """Guard saved scan alerts so they only run after a trusted EOD ingest."""
    if dry_run:
        return False, "dry_run"
    if yfinance_only:
        return False, "yfinance_only"
    if not bhavcopy_result:
        return False, "missing_bhavcopy_result"

    status = bhavcopy_result.get("status")
    rows = int(bhavcopy_result.get("rows_ingested") or 0)
    if status not in {"success", "already_done"}:
        return False, f"bhavcopy_{status or 'unknown'}"
    if bhavcopy_result.get("partial_ingest") is True:
        return False, "partial_ingest"
    if rows <= 0:
        return False, "no_rows_ingested"
    return True, "eligible"


async def run_scan_alerts(target: date, log: Logger) -> dict:
    from app.routers.alerts import run_all_alerts

    log.info(f"Running saved EOD scan alerts for {target}...")
    result = await run_all_alerts(target)
    log.info(
        "  scan alerts: "
        f"alerts_run={result.get('alerts_run', 0)}, total_matches={result.get('total_matches', 0)}"
    )
    return result


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

    # ── Step 3: dashboard breadth read model ──────────────────────────────────
    try:
        result_meta["market_breadth_snapshot"] = build_breadth_snapshot(sb, target, log, dry_run=args.dry_run)
    except Exception as e:
        log.error("Market breadth snapshot failed", e)
        result_meta["market_breadth_snapshot"] = {"status": "failed", "error": str(e)}

    # ── Step 4: saved scan alerts ─────────────────────────────────────────────
    can_run_alerts, alert_skip_reason = should_run_scan_alerts(
        result_meta.get("bhavcopy"),
        dry_run=args.dry_run,
        yfinance_only=args.yfinance_only,
    )
    if can_run_alerts:
        try:
            result_meta["scan_alerts"] = asyncio.run(run_scan_alerts(target, log))
        except Exception as e:
            log.error("Scan alerts failed", e)
            result_meta["scan_alerts"] = {"status": "failed", "error": str(e)}
    else:
        result_meta["scan_alerts"] = {"status": "skipped", "reason": alert_skip_reason}
        log.info(f"Skipping saved EOD scan alerts: {alert_skip_reason}")

    # ── Step 5: supplemental data trust summary ───────────────────────────────
    result_meta["supplemental_data"] = summarize_supplemental_data(
        result_meta,
        yfinance_only=args.yfinance_only,
        skip_yfinance=args.skip_yfinance,
    )
    supplemental = result_meta["supplemental_data"]
    if supplemental["status"] == "healthy":
        log.info("Supplemental data: status=healthy")
    else:
        log.warn(f"Supplemental data: status={supplemental['status']}; warnings={'; '.join(supplemental['warnings'])}")
        if supplemental["status"] == "failed" and args.yfinance_only:
            log.error("yfinance-only refresh failed; no trusted EOD source was updated")

    # ── Step 6: write run log ─────────────────────────────────────────────────
    if not args.dry_run:
        write_run_log(sb, log, result_meta)

    log.info("───────────────────────────────────────────────────────")
    log.info(f"Done. Duration: {log.duration_s():.1f}s · Errors: {len(log.errors)}")

    return 0 if len(log.errors) == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
