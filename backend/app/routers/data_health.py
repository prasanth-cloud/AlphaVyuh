from fastapi import APIRouter
from app.services.supabase import get_admin_client

router = APIRouter(prefix="/api/v1/data", tags=["data-health"])


@router.get("/health")
async def data_health():
    """Returns overall data freshness — public, no auth required."""
    sb = get_admin_client()

    health_res = sb.from_("data_health").select("*").limit(1).execute()
    h = health_res.data[0] if health_res.data else {}

    hours_stale = h.get("hours_since_last_run") or 999
    null_rsi = h.get("null_rsi_latest") or 0
    total_syms = max(h.get("symbols_latest") or 1, 1)
    last_run_errors = h.get("last_run_errors") or 0

    if hours_stale > 28:
        status = "stale"
    elif (null_rsi / total_syms) > 0.05 or last_run_errors > 20:
        status = "degraded"
    else:
        status = "healthy"

    return {
        "status": status,
        "latest_trade_date": h.get("latest_trade_date"),
        "hours_since_refresh": round(float(hours_stale), 1) if hours_stale != 999 else None,
        "symbols_on_latest_date": h.get("symbols_latest"),
        "universe_active": h.get("universe_active"),
        "indicators_missing": {
            "rsi_14": h.get("null_rsi_latest"),
            "ema_200": h.get("null_ema200_latest"),
        },
        "last_run": {
            "id": h.get("last_run_id"),
            "errors": last_run_errors,
        },
    }


@router.get("/runs")
async def list_recent_runs(limit: int = 10):
    """Recent refresh runs — for debugging."""
    sb = get_admin_client()
    res = sb.table("ingest_runs") \
        .select("run_id, started_at, duration_s, event_count, error_count") \
        .order("started_at", desc=True) \
        .limit(min(limit, 50)) \
        .execute()
    return {"runs": res.data or []}
