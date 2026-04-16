"""
AI MistakeEngine — analyses the user's trade journal and surfaces
recurring patterns, mistakes, and actionable improvements using Claude.
"""
from __future__ import annotations

import json
import logging

import anthropic
from fastapi import APIRouter, Depends, HTTPException

from app.middleware.auth import get_current_user_id
from app.services.supabase import get_admin_client, settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/ai", tags=["ai"])

MIN_TRADES = 3  # minimum closed trades before analysis is meaningful


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

    # Fetch all closed trades
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
