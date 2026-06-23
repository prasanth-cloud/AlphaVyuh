"""
Daily watchlist email digest — runs at 18:30 IST via APScheduler.

Fetches each opted-in user's watchlist, joins latest EOD data,
checks for scanner triggers, and sends a summary email via Resend.
Skips weekends and market holidays (detected via bhavcopy_log).
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timedelta

import resend

from app.services.supabase import get_admin_client, settings

logger = logging.getLogger(__name__)

RESEND_FROM = "AlphaVyuh <digest@alphavyuh.com>"


def _is_trading_day(client, target: date) -> bool:
    """Check bhavcopy_log to see if today had a successful ingest (= trading day)."""
    if target.weekday() >= 5:
        return False
    result = client.table("bhavcopy_log") \
        .select("status") \
        .eq("trade_date", str(target)) \
        .in_("status", ["success", "already_done"]) \
        .limit(1) \
        .execute()
    return bool(result.data)


def _get_or_create_unsubscribe_token(client, user_id: str) -> str:
    existing = client.table("email_unsubscribe_tokens") \
        .select("token") \
        .eq("user_id", user_id) \
        .limit(1) \
        .execute()
    if existing.data:
        return existing.data[0]["token"]
    result = client.table("email_unsubscribe_tokens") \
        .insert({"user_id": user_id}) \
        .execute()
    return result.data[0]["token"]


def _render_email(user_name: str, items: list[dict], unsubscribe_url: str, trade_date: str) -> tuple[str, str]:
    """Returns (subject, html_body)."""
    subject = f"Your Watchlist Digest — {trade_date}"

    rows_html = ""
    for item in items:
        symbol = item["symbol"]
        close = item.get("close")
        pct = item.get("pct_change")
        triggers = item.get("triggers", [])

        pct_str = f"{pct:+.2f}%" if pct is not None else "—"
        pct_color = "#26a65b" if pct and pct >= 0 else "#e5383b"
        close_str = f"₹{close:,.2f}" if close is not None else "—"
        trigger_str = ", ".join(triggers) if triggers else "—"

        rows_html += f"""
        <tr style="border-bottom:1px solid #2a2a2a">
          <td style="padding:8px 12px;font-weight:600">{symbol}</td>
          <td style="padding:8px 12px;text-align:right">{close_str}</td>
          <td style="padding:8px 12px;text-align:right;color:{pct_color}">{pct_str}</td>
          <td style="padding:8px 12px;font-size:12px;color:#aaa">{trigger_str}</td>
        </tr>"""

    html = f"""
    <div style="max-width:600px;margin:0 auto;font-family:Inter,sans-serif;background:#0A0E13;color:#F1EFE8;padding:24px">
      <h2 style="margin:0 0 4px;font-size:18px">Watchlist Digest</h2>
      <p style="margin:0 0 20px;color:#888;font-size:13px">{trade_date} • Hi {user_name or "there"}</p>

      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <thead>
          <tr style="border-bottom:2px solid #2a2a2a;color:#888;font-size:11px;text-transform:uppercase;letter-spacing:0.06em">
            <th style="padding:6px 12px;text-align:left">Symbol</th>
            <th style="padding:6px 12px;text-align:right">Close</th>
            <th style="padding:6px 12px;text-align:right">Change</th>
            <th style="padding:6px 12px;text-align:left">Scanner Triggers</th>
          </tr>
        </thead>
        <tbody>{rows_html}</tbody>
      </table>

      <p style="margin:24px 0 0;font-size:12px;color:#666;text-align:center">
        <a href="{unsubscribe_url}" style="color:#888;text-decoration:underline">Unsubscribe</a>
        from daily digest emails.
      </p>
    </div>
    """
    return subject, html


def _detect_triggers(row: dict) -> list[str]:
    """Check if the stock triggered any scanner conditions."""
    triggers = []
    rs = row.get("rs_score")
    if rs is not None and rs >= 85:
        triggers.append("RS ≥ 85")
    vol_ratio = row.get("volume_ratio")
    if vol_ratio is not None and vol_ratio >= 2.0:
        triggers.append(f"Vol {vol_ratio:.1f}x")
    pct = row.get("pct_change")
    if pct is not None and pct >= 3.0:
        triggers.append(f"Gap +{pct:.1f}%")
    w52h_pct = row.get("w52h_pct")
    if w52h_pct is not None and w52h_pct <= 5.0:
        triggers.append("Near 52w High")
    vcp = row.get("vcp_contraction")
    if vcp:
        triggers.append("VCP")
    return triggers


async def send_daily_digests():
    """Main entry point — called by APScheduler at 18:30 IST."""
    if not settings.resend_api_key:
        logger.info("Email digest skipped: RESEND_API_KEY not configured")
        return {"status": "skipped", "reason": "no_resend_key"}

    resend.api_key = settings.resend_api_key
    client = get_admin_client()
    today = date.today()

    if not _is_trading_day(client, today):
        logger.info("Email digest skipped: %s is not a trading day", today)
        return {"status": "skipped", "reason": "not_trading_day"}

    users_res = client.table("users") \
        .select("id, email, full_name, email_digest_enabled") \
        .eq("email_digest_enabled", True) \
        .execute()

    if not users_res.data:
        logger.info("Email digest: no opted-in users")
        return {"status": "ok", "sent": 0}

    sent = 0
    errors = 0
    frontend_url = settings.frontend_url.rstrip("/")

    for user in users_res.data:
        try:
            user_id = user["id"]

            watchlists = client.table("watchlists") \
                .select("id") \
                .eq("user_id", user_id) \
                .execute()
            if not watchlists.data:
                continue

            wl_ids = [w["id"] for w in watchlists.data]
            items_res = client.table("watchlist_items") \
                .select("symbol") \
                .in_("watchlist_id", wl_ids) \
                .execute()
            if not items_res.data:
                continue

            symbols = list({i["symbol"] for i in items_res.data})

            ohlcv_res = client.table("daily_ohlcv") \
                .select("symbol, close, prev_close, pct_change, volume, avg_volume_20d, "
                        "volume_ratio, rs_score, w52h_pct, vcp_contraction, rsi_14") \
                .eq("trade_date", str(today)) \
                .in_("symbol", symbols) \
                .execute()

            quote_map = {r["symbol"]: r for r in (ohlcv_res.data or [])}

            digest_items = []
            for sym in sorted(symbols):
                row = quote_map.get(sym, {})
                close = row.get("close")
                prev = row.get("prev_close")
                pct = row.get("pct_change")
                if pct is None and close and prev and prev > 0:
                    pct = (close - prev) / prev * 100
                digest_items.append({
                    "symbol": sym,
                    "close": close,
                    "pct_change": pct,
                    "triggers": _detect_triggers(row),
                })

            if not digest_items:
                continue

            unsub_token = _get_or_create_unsubscribe_token(client, user_id)
            unsubscribe_url = f"{frontend_url}/api/unsubscribe?token={unsub_token}"

            subject, html = _render_email(
                user_name=user.get("full_name"),
                items=digest_items,
                unsubscribe_url=unsubscribe_url,
                trade_date=str(today),
            )

            resend.Emails.send({
                "from": RESEND_FROM,
                "to": [user["email"]],
                "subject": subject,
                "html": html,
                "headers": {
                    "List-Unsubscribe": f"<{unsubscribe_url}>",
                    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
                },
            })
            sent += 1

        except Exception:
            logger.exception("Email digest failed for user %s", user.get("id"))
            errors += 1

    logger.info("Email digest complete: sent=%d errors=%d", sent, errors)
    return {"status": "ok", "sent": sent, "errors": errors}
