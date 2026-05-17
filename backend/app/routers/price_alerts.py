"""
Price Alerts router.
Users set "alert me when SYMBOL goes above/below PRICE".
APScheduler checks active alerts every 5 minutes against latest daily_ohlcv close.
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.middleware.auth import get_current_user_id
from app.services.plans import get_effective_user_plan
from app.services.supabase import get_admin_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/price-alerts", tags=["price-alerts"])

FREE_LIMIT = 5
PRO_LIMIT  = 50


# ── Models ────────────────────────────────────────────────────────────────────

class CreateAlertRequest(BaseModel):
    symbol:       str
    condition:    str   # "above" | "below"
    target_price: float
    note:         Optional[str] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_user_plan(user_id: str) -> str:
    sb = get_admin_client()
    return get_effective_user_plan(sb, user_id)


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("")
async def list_price_alerts(user_id: str = Depends(get_current_user_id)):
    sb = get_admin_client()
    res = (
        sb.table("price_alerts")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    return {"alerts": res.data or []}


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_price_alert(
    body: CreateAlertRequest,
    user_id: str = Depends(get_current_user_id),
):
    if body.condition not in ("above", "below"):
        raise HTTPException(status_code=400, detail="condition must be 'above' or 'below'")
    if body.target_price <= 0:
        raise HTTPException(status_code=400, detail="target_price must be positive")

    sb = get_admin_client()
    plan  = _get_user_plan(user_id)
    limit = FREE_LIMIT if plan == "free" else PRO_LIMIT
    count = (
        sb.table("price_alerts")
        .select("id", count="exact")
        .eq("user_id", user_id)
        .eq("is_active", True)
        .execute()
    )
    if (count.count or 0) >= limit:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"{plan.capitalize()} plan allows max {limit} active price alerts.",
        )

    row = {
        "user_id":      user_id,
        "symbol":       body.symbol.upper(),
        "condition":    body.condition,
        "target_price": body.target_price,
        "note":         body.note,
        "is_active":    True,
    }
    res = sb.table("price_alerts").insert(row).execute()
    return res.data[0]


@router.delete("/{alert_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_price_alert(
    alert_id: str,
    user_id: str = Depends(get_current_user_id),
):
    sb = get_admin_client()
    sb.table("price_alerts").delete().eq("id", alert_id).eq("user_id", user_id).execute()


# ── Background job (called from APScheduler every 5 minutes) ─────────────────

def check_price_alerts() -> None:
    """
    For each active price alert, fetch the latest close from daily_ohlcv.
    If condition is met, mark triggered and (optionally) send Telegram notification.
    """
    sb = get_admin_client()

    # Load all active alerts
    res = sb.table("price_alerts").select("*").eq("is_active", True).execute()
    alerts = res.data or []
    if not alerts:
        return

    # Get unique symbols and their latest close prices
    symbols = list({a["symbol"] for a in alerts})
    prices: dict[str, float] = {}
    for sym in symbols:
        row = (
            sb.table("daily_ohlcv")
            .select("close")
            .eq("symbol", sym)
            .order("trade_date", desc=True)
            .limit(1)
            .execute()
        )
        if row.data:
            prices[sym] = float(row.data[0]["close"])

    triggered_ids: list[str] = []
    for alert in alerts:
        sym = alert["symbol"]
        price = prices.get(sym)
        if price is None:
            continue

        target = float(alert["target_price"])
        met = (alert["condition"] == "above" and price >= target) or \
              (alert["condition"] == "below" and price <= target)

        if met:
            triggered_ids.append(alert["id"])
            logger.info("Price alert triggered: %s %s %.2f (current %.2f)",
                        sym, alert["condition"], target, price)
            _send_telegram(alert, price)

    if triggered_ids:
        sb.table("price_alerts") \
            .update({"is_active": False, "triggered_at": "now()"}) \
            .in_("id", triggered_ids) \
            .execute()


def _send_telegram(alert: dict, current_price: float) -> None:
    """Fire-and-forget Telegram notification. Requires user's telegram_chat_id."""
    try:
        from app.services.supabase import settings
        if not settings.telegram_bot_token:
            return
        sb = get_admin_client()
        user = sb.table("users").select("telegram_chat_id").eq("id", alert["user_id"]).maybe_single().execute()
        chat_id = (user.data or {}).get("telegram_chat_id")
        if not chat_id:
            return
        import httpx, asyncio
        cond = "above" if alert["condition"] == "above" else "below"
        text = (
            f"🔔 *Price Alert*\n"
            f"{alert['symbol']} is now ₹{current_price:,.2f}\n"
            f"Your alert: {cond} ₹{float(alert['target_price']):,.2f}"
        )
        url = f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendMessage"
        httpx.post(url, json={"chat_id": chat_id, "text": text, "parse_mode": "Markdown"}, timeout=5)
    except Exception as e:
        logger.warning("Telegram send failed: %s", e)
