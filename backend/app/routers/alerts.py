"""
Scan Alerts router — save a scan config and get in-app notifications when stocks match.
The daily ingest cron calls run_all_alerts() after bhavcopy is ingested.
"""
from __future__ import annotations

from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.middleware.auth import get_current_user_id
from app.routers.scanner import ScanFilters, ScanRequest, _apply_filters, SORT_KEYS
from app.services.supabase import get_admin_client

router = APIRouter(prefix="/api/v1/alerts", tags=["alerts"])

FREE_ALERT_LIMIT = 2
PRO_ALERT_LIMIT  = 20


# ── Pydantic models ───────────────────────────────────────────────────────────

class CreateAlertRequest(BaseModel):
    name:       str
    filters:    dict = {}
    sort_by:    str  = "volume_ratio"
    sort_order: str  = "desc"


class UpdateAlertRequest(BaseModel):
    name:       str | None = None
    filters:    dict | None = None
    sort_by:    str | None = None
    sort_order: str | None = None
    is_active:  bool | None = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_user_plan(user_id: str) -> str:
    client = get_admin_client()
    r = client.table("users").select("plan").eq("id", user_id).single().execute()
    return r.data["plan"] if r.data else "free"


# ── CRUD endpoints ────────────────────────────────────────────────────────────

@router.get("")
async def list_alerts(user_id: str = Depends(get_current_user_id)):
    client = get_admin_client()
    res = client.table("scan_alerts") \
        .select("*") \
        .eq("user_id", user_id) \
        .order("created_at", desc=False) \
        .execute()
    return {"alerts": res.data or []}


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_alert(body: CreateAlertRequest, user_id: str = Depends(get_current_user_id)):
    client = get_admin_client()

    # Enforce plan limits
    plan  = _get_user_plan(user_id)
    limit = FREE_ALERT_LIMIT if plan == "free" else PRO_ALERT_LIMIT
    count_res = client.table("scan_alerts").select("id", count="exact") \
        .eq("user_id", user_id).execute()
    if (count_res.count or 0) >= limit:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"{plan.capitalize()} plan allows max {limit} scan alerts.",
        )

    if body.sort_by not in SORT_KEYS:
        raise HTTPException(status_code=400, detail=f"Invalid sort_by: {body.sort_by}")

    row = {
        "user_id":    user_id,
        "name":       body.name.strip()[:80],
        "filters":    body.filters,
        "sort_by":    body.sort_by,
        "sort_order": body.sort_order,
        "is_active":  True,
    }
    res = client.table("scan_alerts").insert(row).execute()
    return res.data[0]


@router.patch("/{alert_id}")
async def update_alert(
    alert_id: str,
    body: UpdateAlertRequest,
    user_id: str = Depends(get_current_user_id),
):
    client = get_admin_client()
    # Verify ownership
    existing = client.table("scan_alerts").select("id") \
        .eq("id", alert_id).eq("user_id", user_id).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Alert not found")

    patch: dict[str, Any] = {"updated_at": "now()"}
    if body.name       is not None: patch["name"]       = body.name.strip()[:80]
    if body.filters    is not None: patch["filters"]    = body.filters
    if body.sort_by    is not None: patch["sort_by"]    = body.sort_by
    if body.sort_order is not None: patch["sort_order"] = body.sort_order
    if body.is_active  is not None: patch["is_active"]  = body.is_active

    res = client.table("scan_alerts").update(patch).eq("id", alert_id).execute()
    return res.data[0]


@router.delete("/{alert_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_alert(alert_id: str, user_id: str = Depends(get_current_user_id)):
    client = get_admin_client()
    existing = client.table("scan_alerts").select("id") \
        .eq("id", alert_id).eq("user_id", user_id).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Alert not found")
    client.table("scan_alerts").delete().eq("id", alert_id).execute()


@router.get("/{alert_id}/matches")
async def get_alert_matches(
    alert_id: str,
    limit: int = 10,
    user_id: str = Depends(get_current_user_id),
):
    """Return the last N run results for an alert."""
    client = get_admin_client()
    existing = client.table("scan_alerts").select("id") \
        .eq("id", alert_id).eq("user_id", user_id).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Alert not found")

    res = client.table("scan_alert_matches") \
        .select("*") \
        .eq("alert_id", alert_id) \
        .order("run_date", desc=True) \
        .limit(max(1, min(limit, 30))) \
        .execute()
    return {"matches": res.data or []}


@router.get("/recent/matches")
async def get_recent_matches(user_id: str = Depends(get_current_user_id)):
    """Return today's / most-recent matches across all alerts for this user."""
    client = get_admin_client()
    res = client.table("scan_alert_matches") \
        .select("*, scan_alerts(name)") \
        .eq("user_id", user_id) \
        .order("run_date", desc=True) \
        .limit(50) \
        .execute()
    return {"matches": res.data or []}


# ── Internal: called by the daily ingest cron ─────────────────────────────────

async def run_all_alerts(trade_date: date) -> dict:
    """
    Run every active scan alert against today's data and store matches.
    Called automatically after bhavcopy ingest completes.
    """
    client = get_admin_client()

    # Fetch all active alerts
    alerts_res = client.table("scan_alerts") \
        .select("*") \
        .eq("is_active", True) \
        .execute()
    alerts = alerts_res.data or []

    if not alerts:
        return {"trade_date": str(trade_date), "alerts_run": 0, "total_matches": 0}

    # Fetch all today's OHLCV data once (paginated)
    all_rows: list[dict] = []
    offset = 0
    while True:
        chunk = client.table("daily_ohlcv") \
            .select(
                "symbol, open, high, low, close, prev_close, volume, avg_volume_20d, "
                "turnover, rsi_14, ema_20, ema_50, ema_200, atr_14, week_52_high, "
                "week_52_low, stock_universe(company_name, sector, series)"
            ) \
            .eq("trade_date", str(trade_date)) \
            .range(offset, offset + 999) \
            .execute()
        if not chunk.data:
            break
        all_rows.extend(chunk.data)
        if len(chunk.data) < 1000:
            break
        offset += 1000

    if not all_rows:
        return {"trade_date": str(trade_date), "alerts_run": 0, "total_matches": 0}

    total_matches = 0
    for alert in alerts:
        try:
            filters = ScanFilters(**alert["filters"])
        except Exception:
            continue

        matched = _apply_filters(all_rows, filters)

        # Sort
        sort_key = alert.get("sort_by", "volume_ratio")
        sort_desc = alert.get("sort_order", "desc") == "desc"
        if sort_key in SORT_KEYS:
            matched.sort(key=lambda r: (r.get(sort_key) or 0), reverse=sort_desc)

        # Keep top 50 symbols in snapshot
        snapshot = [
            {
                "symbol":       r["symbol"],
                "close":        r.get("close"),
                "pct_change":   r.get("pct_change"),
                "volume_ratio": r.get("volume_ratio"),
                "rsi_14":       r.get("rsi_14"),
            }
            for r in matched[:50]
        ]

        match_count = len(matched)
        total_matches += match_count

        # Upsert match row (one per alert per day)
        client.table("scan_alert_matches").upsert(
            {
                "alert_id":    alert["id"],
                "user_id":     alert["user_id"],
                "run_date":    str(trade_date),
                "symbols":     snapshot,
                "match_count": match_count,
            },
            on_conflict="alert_id,run_date",
            ignore_duplicates=False,
        ).execute()

        # Update last_run_at and match count on the alert
        client.table("scan_alerts").update({
            "last_run_at":     "now()",
            "last_match_count": match_count,
            "updated_at":      "now()",
        }).eq("id", alert["id"]).execute()

    return {
        "trade_date":   str(trade_date),
        "alerts_run":   len(alerts),
        "total_matches": total_matches,
    }
