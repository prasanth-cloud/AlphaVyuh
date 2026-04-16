"""
Broker Integration — Order placement with auto-journal entry creation.

Phase 1: Simulated broker (instant fill at submitted price).
Phase 2 (future): Zerodha Kite Connect v3 OAuth + real order routing.

Workflow: Chart → Place Order → Journal entry auto-created (status=open)
         → User closes trade via Journal → AI analysis triggered
"""
from __future__ import annotations

from datetime import date
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.middleware.auth import get_current_user_id
from app.services.supabase import get_admin_client

router = APIRouter(prefix="/api/v1/orders", tags=["orders"])


# ── Models ────────────────────────────────────────────────────────────────────

class PlaceOrderRequest(BaseModel):
    symbol:     str
    side:       Literal["buy", "sell"]
    quantity:   int = Field(gt=0)
    price:      float = Field(gt=0)                      # entry price
    order_type: Literal["market", "limit"] = "market"
    stop_loss:       Optional[float] = None
    target_price:    Optional[float] = None
    setup_type:      Optional[str]   = None   # breakout, pullback, reversal, momentum, other
    notes:           Optional[str]   = None
    broker:          Literal["simulated", "zerodha"] = "simulated"


class ClosePositionRequest(BaseModel):
    journal_id:  str
    exit_price:  float = Field(gt=0)
    exit_reason: Optional[str] = None


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("", status_code=status.HTTP_201_CREATED)
async def place_order(
    body: PlaceOrderRequest,
    user_id: str = Depends(get_current_user_id),
):
    """
    Place a simulated order and automatically create an open journal entry.
    Returns the journal entry ID so the frontend can link to it.
    """
    sb = get_admin_client()
    sym = body.symbol.strip().upper()

    # Validate symbol exists
    sym_check = sb.table("stock_universe").select("symbol, company_name") \
        .eq("symbol", sym).maybe_single().execute()
    if not sym_check.data:
        raise HTTPException(status_code=404, detail=f"Symbol {sym} not found")

    company_name = sym_check.data.get("company_name", sym)
    trade_type = "long" if body.side == "buy" else "short"

    # Risk/reward calculation
    risk_reward: Optional[float] = None
    if body.stop_loss and body.target_price and body.stop_loss != body.price:
        risk   = abs(body.price - body.stop_loss)
        reward = abs(body.target_price - body.price)
        risk_reward = round(reward / risk, 2) if risk > 0 else None

    # Auto-create journal entry (status = open)
    entry = {
        "user_id":      user_id,
        "symbol":       sym,
        "company_name": company_name,
        "trade_type":   trade_type,
        "entry_date":   str(date.today()),
        "entry_price":  body.price,
        "quantity":     body.quantity,
        "stop_loss":    body.stop_loss,
        "target_price": body.target_price,
        "setup_type":   body.setup_type,
        "entry_reason": body.notes or f"{body.side.upper()} via chart — {body.order_type} order",
        "risk_reward":  risk_reward,
        "status":       "open",
    }

    result = sb.table("trade_journal").insert(entry).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create journal entry")

    journal_entry = result.data[0]

    return {
        "status":      "filled",
        "order_type":  body.order_type,
        "broker":      body.broker,
        "symbol":      sym,
        "side":        body.side,
        "quantity":    body.quantity,
        "price":       body.price,
        "message":     f"{body.side.upper()} {body.quantity} × {sym} @ ₹{body.price:,.2f} — Journal entry created",
        "journal_id":  journal_entry["id"],
    }


@router.post("/close")
async def close_position(
    body: ClosePositionRequest,
    user_id: str = Depends(get_current_user_id),
):
    """
    Close an open trade: update journal with exit price, compute P&L,
    and trigger AI analysis asynchronously.
    """
    sb = get_admin_client()

    # Fetch the open journal entry
    r = sb.table("trade_journal").select("*") \
        .eq("id", body.journal_id).eq("user_id", user_id).maybe_single().execute()
    if not r.data:
        raise HTTPException(status_code=404, detail="Journal entry not found")

    entry = r.data
    if entry["status"] != "open":
        raise HTTPException(status_code=400, detail="Trade is not open")

    entry_price = float(entry["entry_price"])
    exit_price  = body.exit_price
    qty         = int(entry["quantity"])
    trade_type  = entry["trade_type"]

    # P&L
    if trade_type == "long":
        pnl = (exit_price - entry_price) * qty
    else:
        pnl = (entry_price - exit_price) * qty
    pnl_pct = round(pnl / (entry_price * qty) * 100, 4)

    # Holding days
    try:
        from datetime import date as date_
        ed = date_.fromisoformat(entry["entry_date"])
        holding_days = (date_.today() - ed).days
    except Exception:
        holding_days = None

    update = {
        "exit_date":    str(date.today()),
        "exit_price":   exit_price,
        "exit_reason":  body.exit_reason,
        "pnl":          round(pnl, 2),
        "pnl_pct":      pnl_pct,
        "holding_days": holding_days,
        "status":       "closed",
    }

    sb.table("trade_journal").update(update).eq("id", body.journal_id).execute()

    # Trigger AI analysis (non-blocking — best effort)
    try:
        _trigger_ai_analysis(sb, {**entry, **update})
    except Exception:
        pass  # don't fail the close if AI errors

    return {
        "status":  "closed",
        "pnl":     round(pnl, 2),
        "pnl_pct": pnl_pct,
        "message": f"Trade closed: {'profit' if pnl >= 0 else 'loss'} ₹{abs(pnl):,.2f} ({pnl_pct:+.2f}%)",
    }


@router.get("")
async def list_open_positions(user_id: str = Depends(get_current_user_id)):
    """Returns open trades from the journal (current positions)."""
    sb = get_admin_client()
    r = sb.table("trade_journal").select("*") \
        .eq("user_id", user_id).eq("status", "open") \
        .order("entry_date", desc=True).limit(50).execute()
    return r.data or []


# ── AI analysis helper ────────────────────────────────────────────────────────

def _trigger_ai_analysis(sb, entry: dict) -> None:
    """
    Call Claude API to analyse the closed trade and store result in journal.
    Runs synchronously (called from background task context).
    """
    try:
        import anthropic
        client = anthropic.Anthropic()

        pnl = entry.get("pnl", 0)
        outcome = "WIN" if pnl >= 0 else "LOSS"

        prompt = f"""You are an expert trading coach analysing a trade for an Indian stock market trader.

Trade summary:
- Symbol: {entry['symbol']} ({entry.get('company_name','')})
- Direction: {entry['trade_type'].upper()}
- Entry: ₹{entry['entry_price']} on {entry['entry_date']}
- Exit: ₹{entry['exit_price']} on {entry['exit_date']}
- Quantity: {entry['quantity']}
- P&L: ₹{pnl:,.2f} ({entry.get('pnl_pct',0):+.2f}%) — {outcome}
- Holding period: {entry.get('holding_days','?')} days
- Setup: {entry.get('setup_type') or 'Not specified'}
- Entry reason: {entry.get('entry_reason') or 'Not specified'}
- Exit reason: {entry.get('exit_reason') or 'Not specified'}
- Stop loss: {entry.get('stop_loss') or 'Not set'}
- Target: {entry.get('target_price') or 'Not set'}
- Risk/Reward: {entry.get('risk_reward') or 'Not calculated'}

In 3–5 concise bullet points, identify:
1. What was done correctly
2. What mistake(s) were made (if any)
3. One specific lesson to improve future trades
Keep each point under 20 words. Be direct and actionable."""

        resp = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=300,
            messages=[{"role": "user", "content": prompt}],
        )
        analysis = resp.content[0].text if resp.content else ""

        sb.table("trade_journal").update({"lessons": analysis}) \
            .eq("id", entry["id"]).execute()
    except Exception:
        pass  # silently skip if AI unavailable
