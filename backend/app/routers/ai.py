"""
AI MistakeEngine — analyses the user's trade journal and surfaces
recurring patterns, mistakes, and actionable improvements using Claude.
"""
from __future__ import annotations

import datetime
import logging
from collections import defaultdict

import anthropic
from fastapi import APIRouter, Depends, HTTPException

from app.middleware.auth import get_current_user_id
from app.services.supabase import get_admin_client, settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/ai", tags=["ai"])

MIN_TRADES = 3


def _build_prompt(trades: list[dict]) -> str:
    lines = []
    for t in trades:
        parts = [
            f"Symbol: {t['symbol']}",
            f"Type: {t['trade_type']}",
            f"Setup: {t.get('setup_type') or 'untagged'}",
            f"Entry: {t['entry_date']} @ ₹{t['entry_price']}",
        ]
        if t.get("exit_date"):
            parts.append(f"Exit: {t['exit_date']} @ ₹{t.get('exit_price', '?')}")
        if t.get("pnl") is not None:
            pnl_str = f"₹{t['pnl']:+.0f} ({t.get('pnl_pct', 0):+.1f}%)"
            parts.append(f"P&L: {pnl_str}")
        if t.get("holding_days"):
            parts.append(f"Holding: {t['holding_days']}d")
        if t.get("entry_reason"):
            parts.append(f"Entry reason: {t['entry_reason']}")
        if t.get("exit_reason"):
            parts.append(f"Exit reason: {t['exit_reason']}")
        if t.get("mistakes"):
            parts.append(f"Noted mistakes: {t['mistakes']}")
        lines.append(" | ".join(parts))

    trade_text = "\n".join(f"- {l}" for l in lines)

    return f"""You are an experienced Indian stock market trading coach and performance analyst.

The trader has given you their complete trade journal. Analyse it carefully and provide:

1. **Key Patterns** (2-4 bullet points): What recurring behaviours — both good and bad — do you see? Look at setups, timing, holding periods, position management.

2. **Top Mistakes** (2-3 bullet points): Specific, concrete mistakes this trader keeps repeating. Be direct.

3. **What's Working** (1-2 bullet points): Positive patterns worth reinforcing.

4. **Actionable Rules** (2-3 bullet points): Specific rules this trader should add to their trading plan right now. Make them concrete and measurable (e.g., "Never hold a loss more than 3 days" not "Manage risk better").

Keep each bullet point to 1-2 sentences. Be direct and specific — use the actual symbols and numbers from their journal. Don't give generic advice.

Trade Journal:
{trade_text}

Respond in clean markdown with the four sections above. No preamble."""


@router.post("/analyse")
async def analyse_journal(user_id: str = Depends(get_current_user_id)):
    if not settings.anthropic_api_key:
        raise HTTPException(503, "AI analysis not available — contact support")

    sb = get_admin_client()
    result = (
        sb.table("trade_journal")
        .select(
            "symbol,trade_type,setup_type,entry_date,entry_price,"
            "exit_date,exit_price,pnl,pnl_pct,holding_days,"
            "entry_reason,exit_reason,mistakes"
        )
        .eq("user_id", user_id)
        .eq("status", "closed")
        .order("entry_date", desc=False)
        .execute()
    )
    trades = result.data or []

    if len(trades) < MIN_TRADES:
        raise HTTPException(
            400,
            f"Need at least {MIN_TRADES} closed trades for analysis. You have {len(trades)}."
        )

    prompt = _build_prompt(trades)

    try:
        client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        message = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}],
        )
        analysis = message.content[0].text
    except anthropic.BadRequestError as e:
        err_body = str(e)
        logger.error(f"Claude API error: {e}")
        if "credit balance" in err_body.lower() or "too low" in err_body.lower():
            raise HTTPException(503, "AI service is temporarily unavailable — please try again later")
        raise HTTPException(500, "AI analysis failed — please try again")
    except anthropic.AuthenticationError:
        logger.error("Anthropic API key invalid or expired")
        raise HTTPException(503, "AI service is temporarily unavailable — please try again later")
    except Exception as e:
        logger.error(f"Claude API error: {e}")
        raise HTTPException(500, "AI analysis failed — please try again")

    return {
        "analysis": analysis,
        "trades_analysed": len(trades),
    }


@router.get("/patterns")
async def get_patterns(user_id: str = Depends(get_current_user_id)):
    """
    Compute statistical patterns from closed trades without calling the AI.
    Returns win rates by day of week, direction, holding period bucket, and time-in-trade stats.
    """
    sb = get_admin_client()
    result = (
        sb.table("trade_journal")
        .select("symbol,trade_type,setup_type,entry_date,exit_date,pnl,holding_days")
        .eq("user_id", user_id)
        .eq("status", "closed")
        .execute()
    )
    trades = result.data or []

    if len(trades) < MIN_TRADES:
        return {
            "min_trades_required": MIN_TRADES,
            "trades_available": len(trades),
            "ready": False,
        }

    day_stats: dict = defaultdict(lambda: {"trades": 0, "wins": 0, "total_pnl": 0.0})
    direction_stats: dict = defaultdict(lambda: {"trades": 0, "wins": 0, "total_pnl": 0.0})
    holding_buckets: dict = {
        "Intraday (0d)": {"trades": 0, "wins": 0},
        "Short (1–3d)":  {"trades": 0, "wins": 0},
        "Swing (4–10d)": {"trades": 0, "wins": 0},
        "Position (11d+)": {"trades": 0, "wins": 0},
    }

    win_hold: list[int] = []
    loss_hold: list[int] = []

    for t in trades:
        pnl = float(t["pnl"]) if t.get("pnl") is not None else 0.0
        win = pnl > 0

        # Day of week at entry
        if t.get("entry_date"):
            try:
                dt = datetime.date.fromisoformat(t["entry_date"])
                day_name = dt.strftime("%A")
                day_stats[day_name]["trades"] += 1
                day_stats[day_name]["total_pnl"] += pnl
                if win:
                    day_stats[day_name]["wins"] += 1
            except Exception:
                pass

        # Long vs Short
        direction = t.get("trade_type") or "long"
        direction_stats[direction]["trades"] += 1
        direction_stats[direction]["total_pnl"] += pnl
        if win:
            direction_stats[direction]["wins"] += 1

        # Holding period buckets
        hd = int(t.get("holding_days") or 0)
        if hd == 0:
            bucket = "Intraday (0d)"
        elif hd <= 3:
            bucket = "Short (1–3d)"
        elif hd <= 10:
            bucket = "Swing (4–10d)"
        else:
            bucket = "Position (11d+)"
        holding_buckets[bucket]["trades"] += 1
        if win:
            holding_buckets[bucket]["wins"] += 1

        # Avg holding: win vs loss
        if hd is not None:
            if win:
                win_hold.append(hd)
            else:
                loss_hold.append(hd)

    # Sort days in calendar order
    day_order = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
    day_of_week = [
        {
            "day": day,
            "trades": day_stats[day]["trades"],
            "wins": day_stats[day]["wins"],
            "win_rate": round(day_stats[day]["wins"] / day_stats[day]["trades"] * 100, 1)
                        if day_stats[day]["trades"] > 0 else 0,
            "total_pnl": round(day_stats[day]["total_pnl"], 2),
        }
        for day in day_order if day_stats[day]["trades"] > 0
    ]

    by_direction = [
        {
            "direction": d.capitalize(),
            "trades": v["trades"],
            "wins": v["wins"],
            "win_rate": round(v["wins"] / v["trades"] * 100, 1) if v["trades"] else 0,
            "total_pnl": round(v["total_pnl"], 2),
        }
        for d, v in direction_stats.items()
    ]

    by_holding = [
        {
            "bucket": b,
            "trades": v["trades"],
            "wins": v["wins"],
            "win_rate": round(v["wins"] / v["trades"] * 100, 1) if v["trades"] else 0,
        }
        for b, v in holding_buckets.items()
        if v["trades"] > 0
    ]

    return {
        "ready": True,
        "total_trades": len(trades),
        "avg_hold_winners": round(sum(win_hold) / len(win_hold), 1) if win_hold else None,
        "avg_hold_losers":  round(sum(loss_hold) / len(loss_hold), 1) if loss_hold else None,
        "day_of_week":      day_of_week,
        "by_direction":     by_direction,
        "by_holding_period": by_holding,
    }
