from fastapi import APIRouter
from app.services.supabase import get_admin_client

router = APIRouter(prefix="/api/v1/data", tags=["data-health"])


def _unavailable_health():
    return {
        "status": "unknown",
        "latest_trade_date": None,
        "hours_since_refresh": None,
        "symbols_on_latest_date": None,
        "universe_active": None,
        "coverage_pct": None,
        "mode": "unknown",
        "message": "Data freshness check is temporarily unavailable; product views will use cached or latest known data where possible.",
        "indicators_missing": {"rsi_14": None, "ema_200": None},
        "last_run": {"id": None, "errors": None},
    }


@router.get("/health")
async def data_health():
    """Returns overall data freshness — public, no auth required."""
    try:
        sb = get_admin_client()
        health_res = sb.from_("data_health").select("*").limit(1).execute()
        h = health_res.data[0] if health_res.data else {}
    except Exception:
        return _unavailable_health()

    try:
        hours_stale = h.get("hours_since_last_run") or 999
        null_rsi = h.get("null_rsi_latest") or 0
        total_syms = max(h.get("symbols_latest") or 1, 1)
        active_universe = h.get("universe_active") or total_syms
        last_run_errors = h.get("last_run_errors") or 0
        coverage_pct = round((total_syms / max(active_universe, 1)) * 100, 1)

        if hours_stale > 28:
            status = "stale"
        elif (null_rsi / total_syms) > 0.05 or last_run_errors > 20:
            status = "degraded"
        else:
            status = "healthy"

        mode = "eod"
        if status == "degraded":
            mode = "fallback"
        elif status == "stale":
            mode = "unknown"

        if status == "healthy":
            message = "Latest complete market day is available."
        elif status == "degraded":
            message = "Newest ingest has gaps; product views use the latest complete market day."
        else:
            message = "Market data refresh is overdue; verify before acting."

        return {
            "status": status,
            "latest_trade_date": h.get("latest_trade_date"),
            "hours_since_refresh": round(float(hours_stale), 1) if hours_stale != 999 else None,
            "symbols_on_latest_date": h.get("symbols_latest"),
            "universe_active": h.get("universe_active"),
            "coverage_pct": coverage_pct,
            "mode": mode,
            "message": message,
            "indicators_missing": {
                "rsi_14": h.get("null_rsi_latest"),
                "ema_200": h.get("null_ema200_latest"),
            },
            "last_run": {
                "id": h.get("last_run_id"),
                "errors": last_run_errors,
            },
        }
    except Exception:
        return _unavailable_health()


@router.get("/runs")
async def list_recent_runs(limit: int = 10):
    """Recent refresh runs — for debugging."""
    try:
        sb = get_admin_client()
        res = sb.table("ingest_runs") \
            .select("run_id, started_at, duration_s, event_count, error_count") \
            .order("started_at", desc=True) \
            .limit(min(limit, 50)) \
            .execute()
        return {"runs": res.data or []}
    except Exception:
        return {"runs": [], "mode": "unavailable"}
