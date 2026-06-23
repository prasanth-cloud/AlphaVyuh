# RAILWAY CRON: schedule "30 13 * * 1-5" (18:30 IST = 13:00 UTC, weekdays)
import logging
import os
from datetime import date

from app.constants.nse_holidays_2026 import NSE_HOLIDAYS_2026
from app.services.supabase import get_admin_client

logger = logging.getLogger(__name__)


def _is_market_holiday(today: date) -> bool:
    return today.isoformat() in NSE_HOLIDAYS_2026


def _build_digest_html(symbols_data: list[dict], trade_date: str) -> str:
    rows = ""
    for s in symbols_data:
        pct = s.get("pct_change", 0) or 0
        color = "#2DB574" if pct >= 0 else "#E15560"
        sign = "+" if pct >= 0 else ""
        vol_note = ""
        vol_ratio = s.get("volume_ratio", 0) or 0
        if vol_ratio > 1.5:
            vol_note = f' <span style="color:#A8A29E;font-size:11px">({vol_ratio:.1f}x avg vol)</span>'
        rows += (
            f'<tr style="border-top:1px solid rgba(255,255,255,0.06)">'
            f'<td style="padding:8px 0;color:#F1EFE8;font-weight:600;font-size:14px">{s["symbol"]}</td>'
            f'<td style="padding:8px 0;color:#F1EFE8;font-family:monospace;text-align:right">{s.get("close", "–")}</td>'
            f'<td style="padding:8px 0;text-align:right;color:{color}">{sign}{pct:.2f}%{vol_note}</td>'
            f'</tr>'
        )

    return f"""
    <div style="background:#0A0E13;padding:32px 24px;font-family:Inter,sans-serif;max-width:600px;margin:0 auto">
      <div style="color:#00D9A7;font-size:14px;font-weight:700;letter-spacing:0.14em;margin-bottom:24px">ALPHAVYUH</div>
      <div style="color:#F1EFE8;font-size:18px;font-weight:600;margin-bottom:4px">Your watchlist — {trade_date}</div>
      <div style="color:#A8A29E;font-size:13px;margin-bottom:20px">End-of-day summary for your tracked symbols.</div>
      <table style="width:100%;border-collapse:collapse">{rows}</table>
      <div style="margin-top:32px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.06)">
        <a href="https://alphavyuh.com/settings?unsubscribe=digest" style="color:#6A6A6A;font-size:11px;text-decoration:none">Unsubscribe from daily digest</a>
      </div>
    </div>
    """


async def run_eod_digest():
    today = date.today()
    if _is_market_holiday(today):
        logger.info("Skipping EOD digest — NSE holiday %s", today.isoformat())
        return

    resend_key = os.getenv("RESEND_API_KEY")
    if not resend_key:
        logger.warning("RESEND_API_KEY not set — skipping EOD digest")
        return

    import resend
    resend.api_key = resend_key

    sb = get_admin_client()
    users_resp = (
        sb.table("users")
        .select("id, email, email_digest_enabled")
        .eq("email_digest_enabled", True)
        .execute()
    )
    users = users_resp.data or []

    for user in users:
        user_id = user["id"]
        email = user.get("email")
        if not email:
            continue

        try:
            wl_resp = (
                sb.table("watchlist_items")
                .select("symbol, watchlists!inner(user_id)")
                .eq("watchlists.user_id", user_id)
                .limit(50)
                .execute()
            )
            symbols = list({item["symbol"] for item in (wl_resp.data or [])})
            if not symbols:
                continue

            ohlcv_resp = (
                sb.table("daily_ohlcv")
                .select("symbol, close, prev_close, volume, avg_volume_20d")
                .in_("symbol", symbols)
                .eq("trade_date", today.isoformat())
                .execute()
            )
            symbols_data = []
            for row in ohlcv_resp.data or []:
                close = row.get("close", 0)
                prev = row.get("prev_close", 0)
                pct = ((close - prev) / prev * 100) if prev else 0
                avg_vol = row.get("avg_volume_20d", 0) or 1
                symbols_data.append({
                    "symbol": row["symbol"],
                    "close": f"₹{close:,.2f}",
                    "pct_change": pct,
                    "volume_ratio": (row.get("volume", 0) or 0) / avg_vol,
                })

            if not symbols_data:
                continue

            html = _build_digest_html(symbols_data, today.isoformat())
            resend.Emails.send({
                "from": "AlphaVyuh <digest@alphavyuh.com>",
                "to": email,
                "subject": f"AlphaVyuh · {today.isoformat()} — your watchlist",
                "html": html,
            })

            sb.table("digest_logs").insert({
                "user_id": user_id,
                "status": "sent",
                "symbol_count": len(symbols_data),
            }).execute()

        except Exception as e:
            logger.error("EOD digest failed for user %s: %s", user_id, e)
            sb.table("digest_logs").insert({
                "user_id": user_id,
                "status": "failed",
                "error_message": str(e)[:500],
            }).execute()
