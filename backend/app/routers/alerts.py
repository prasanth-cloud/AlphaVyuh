"""
Scan Alerts router — save a scan config and get in-app notifications when stocks match.
The daily ingest cron calls run_all_alerts() after bhavcopy is ingested.
"""
from __future__ import annotations

from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel

import httpx
import logging

from app.middleware.auth import get_current_user_id
from app.routers.scanner import ScanFilters, _apply_filters, SORT_KEYS
from app.services.supabase import get_admin_client, settings

logger = logging.getLogger(__name__)

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

    # Send Telegram notifications if bot token is configured
    if settings.telegram_bot_token:
        await _send_telegram_summaries(client, alerts, trade_date)

    return {
        "trade_date":   str(trade_date),
        "alerts_run":   len(alerts),
        "total_matches": total_matches,
    }


async def _send_telegram_summaries(client, alerts: list[dict], trade_date) -> None:
    """
    Send a Telegram message to each user who has a Telegram chat_id stored,
    summarising which of their alerts fired today.
    """
    token = settings.telegram_bot_token
    if not token:
        return

    # Group alerts by user_id
    from collections import defaultdict
    user_alerts: dict[str, list[dict]] = defaultdict(list)
    for alert in alerts:
        if alert.get("last_match_count", 0):
            user_alerts[alert["user_id"]].append(alert)

    if not user_alerts:
        return

    # Fetch chat_ids for users who have them stored
    user_ids = list(user_alerts.keys())
    res = client.table("users").select("id,telegram_chat_id").in_("id", user_ids).execute()
    chat_map = {r["id"]: r["telegram_chat_id"] for r in (res.data or []) if r.get("telegram_chat_id")}

    if not chat_map:
        return

    async with httpx.AsyncClient(timeout=10) as http:
        for user_id, fired in user_alerts.items():
            chat_id = chat_map.get(user_id)
            if not chat_id:
                continue
            lines = [f"📊 *Artha Scan Alerts — {trade_date}*\n"]
            for a in fired:
                count = a.get("last_match_count", 0)
                lines.append(f"• *{a['name']}*: {count} stock{'s' if count != 1 else ''} matched")
            lines.append("\nOpen Artha to see results →")
            text = "\n".join(lines)
            try:
                await http.post(
                    f"https://api.telegram.org/bot{token}/sendMessage",
                    json={"chat_id": chat_id, "text": text, "parse_mode": "Markdown"},
                )
            except Exception as e:
                logger.warning(f"Telegram send failed for {user_id}: {e}")


# ── Telegram Bot Webhook ──────────────────────────────────────────────────────

@router.post("/telegram/webhook")
async def telegram_webhook(request: Request):
    """Receive Telegram bot updates (messages/commands from users)."""
    from app.services.supabase import settings as _settings
    if not _settings.telegram_bot_token:
        return {"ok": True}

    payload = await request.json()
    message = payload.get("message", {})
    chat_id = message.get("chat", {}).get("id")
    text = (message.get("text") or "").strip()

    if not chat_id or not text.startswith("/"):
        return {"ok": True}

    parts = text.split(maxsplit=1)
    cmd = parts[0].lower().split("@")[0]  # strip @botname
    args = parts[1].strip() if len(parts) > 1 else ""

    async def send_msg(msg: str):
        url = f"https://api.telegram.org/bot{_settings.telegram_bot_token}/sendMessage"
        async with httpx.AsyncClient() as http_client:
            await http_client.post(url, json={"chat_id": chat_id, "text": msg, "parse_mode": "HTML"})

    sb = get_admin_client()

    if cmd in ("/start", "/help"):
        await send_msg(
            "👋 <b>AlphaVyuh Bot</b>\n\n"
            "Commands:\n"
            "/price &lt;SYMBOL&gt; — live quote (e.g. /price RELIANCE)\n"
            "/scan &lt;name&gt; — run your saved scan (e.g. /scan My Momentum)\n"
            "/help — show this menu\n\n"
            "Link your Telegram Chat ID in AlphaVyuh Settings → Profile to get scan alerts."
        )

    elif cmd == "/price":
        symbol = args.upper()
        if not symbol:
            await send_msg("Usage: /price SYMBOL (e.g. /price RELIANCE)")
        else:
            try:
                dr = sb.table("daily_ohlcv").select("trade_date").order("trade_date", desc=True).limit(1).execute()
                latest_date = dr.data[0]["trade_date"] if dr.data else None
                if latest_date:
                    row = sb.table("daily_ohlcv").select(
                        "symbol,close,prev_close,volume,rsi_14,stock_universe(company_name)"
                    ).eq("symbol", symbol).eq("trade_date", latest_date).maybe_single().execute()
                    if row and row.data:
                        d = row.data
                        close = float(d["close"] or 0)
                        prev = float(d["prev_close"] or 0)
                        pct = round((close - prev) / prev * 100, 2) if prev else 0
                        arrow = "▲" if pct >= 0 else "▼"
                        su = d.get("stock_universe") or {}
                        name = (su.get("company_name") if isinstance(su, dict) else (su[0].get("company_name") if su else None)) or symbol
                        rsi = d.get("rsi_14")
                        rsi_str = f" | RSI {float(rsi):.0f}" if rsi is not None else ""
                        await send_msg(
                            f"<b>{symbol}</b> — {name}\n"
                            f"₹{close:,.2f}  {arrow} {abs(pct):.2f}%{rsi_str}\n"
                            f"Vol: {int(d['volume'] or 0):,} | Date: {latest_date}"
                        )
                    else:
                        await send_msg(f"Symbol {symbol} not found. Check the symbol and try again.")
                else:
                    await send_msg("No market data available yet.")
            except Exception as e:
                await send_msg(f"Error fetching {symbol}: {e}")

    elif cmd == "/scan":
        if not args:
            await send_msg("Usage: /scan &lt;name&gt; (e.g. /scan My Momentum)")
        else:
            user_r = sb.table("users").select("id").eq("telegram_chat_id", str(chat_id)).maybe_single().execute()
            if not user_r or not user_r.data:
                await send_msg("Link your Telegram Chat ID in AlphaVyuh Settings → Profile first.")
            else:
                tg_user_id = user_r.data["id"]
                screen_r = sb.table("saved_screens").select("*").eq("user_id", tg_user_id).ilike("name", f"%{args}%").limit(1).execute()
                if not screen_r.data:
                    await send_msg(f"No saved screen named \"{args}\" found.")
                else:
                    screen = screen_r.data[0]
                    from app.routers.scanner import ScanFilters, _apply_filters
                    dr = sb.table("daily_ohlcv").select("trade_date").order("trade_date", desc=True).limit(1).execute()
                    latest_date = dr.data[0]["trade_date"] if dr.data else None
                    if not latest_date:
                        await send_msg("No market data available.")
                    else:
                        try:
                            filters = ScanFilters(**screen["filters"])
                            rows = sb.table("daily_ohlcv").select(
                                "symbol,open,high,low,close,prev_close,volume,avg_volume_20d,"
                                "turnover,rsi_14,ema_20,ema_50,ema_200,week_52_high,week_52_low,atr_14,"
                                "stock_universe!daily_ohlcv_symbol_fkey!inner(symbol,company_name,series,sector,is_active,market,currency)"
                            ).eq("trade_date", latest_date).limit(2000).execute().data or []
                            matched = _apply_filters(rows, filters)
                            matched.sort(key=lambda x: (x.get("volume_ratio") is not None, x.get("volume_ratio") or 0), reverse=True)
                            top = matched[:5]
                            if not top:
                                await send_msg(f"Scan \"{screen['name']}\" matched 0 stocks today.")
                            else:
                                lines = [f"<b>{screen['name']}</b> — {len(matched)} matches today\n"]
                                for r in top:
                                    pct = r.get("pct_change")
                                    arrow = "▲" if (pct or 0) >= 0 else "▼"
                                    lines.append(f"• {r['symbol']}  ₹{r['close']:,.2f}  {arrow}{abs(pct or 0):.2f}%")
                                await send_msg("\n".join(lines))
                        except Exception as e:
                            await send_msg(f"Scan failed: {e}")

    return {"ok": True}
