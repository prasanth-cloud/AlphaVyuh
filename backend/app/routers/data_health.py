from fastapi import APIRouter
from app.brokers.kite import api as kite_api
from app.services.kite_stream import kite_live_ticker
from app.services.market_data import _kite_access_token, _kite_api_key
from app.services.market_context import fallback_source_metadata, normalize_health_row
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
        "last_successful_eod_date": None,
        "last_bhavcopy": {"trade_date": None, "status": None, "rows_ingested": None, "source_url": None, "error_message": None},
        "provider": fallback_source_metadata("Data freshness endpoint unavailable."),
        "fallback_active": True,
        "next_refresh_hint": "After the next successful market-data ingest.",
        "live_market": _kite_market_status(),
    }


def _kite_market_status() -> dict:
    api_key = _kite_api_key()
    access_token_configured = False
    token_valid = False
    profile_error = None
    try:
        access_token = _kite_access_token()
        access_token_configured = True
    except Exception as exc:
        access_token = ""
        profile_error = str(exc)

    if api_key and access_token:
        try:
            profile = kite_api.get_profile(access_token, api_key=api_key)
            token_valid = bool(profile.get("user_id"))
        except Exception as exc:
            profile_error = str(exc)

    stream_status = kite_live_ticker.status()
    return {
        "provider": "kite",
        "api_key_configured": bool(api_key),
        "access_token_configured": access_token_configured,
        "access_token_valid": token_valid,
        "token_refresh": "daily_manual",
        "stream_connected": bool(stream_status.get("connected")),
        "stream_connecting": bool(stream_status.get("connecting")),
        "subscriber_count": stream_status.get("subscriber_count", 0),
        "subscribed_symbols": stream_status.get("subscribed_symbols", []),
        "last_error": stream_status.get("last_error") or profile_error,
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
        return {**normalize_health_row(h), "live_market": _kite_market_status()}
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
