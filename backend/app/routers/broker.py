"""
Broker Integration — Order placement with auto-journal entry creation.

Simulated broker:  instant fill at submitted price, journal entry created.
Zerodha Kite v3:   routes through Kite Connect when API key + access token exist.
                   Access token is fetched via the /broker/zerodha/connect flow.

Workflow:
  Chart → Place Order → Journal entry (status=open)
  Journal → Close Trade → P&L computed → AI analysis stored in lessons field
"""
from __future__ import annotations

import logging
from datetime import date
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field

from app.middleware.auth import get_current_user_id
from app.services.supabase import get_admin_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["orders"])


# ── Models ────────────────────────────────────────────────────────────────────

class PlaceOrderRequest(BaseModel):
    symbol:      str
    side:        Literal["buy", "sell"]
    quantity:    int = Field(gt=0)
    price:       float = Field(gt=0)
    order_type:  Literal["market", "limit"] = "market"
    stop_loss:      Optional[float] = None
    target_price:   Optional[float] = None
    setup_type:     Optional[str]   = None
    notes:          Optional[str]   = None


class ClosePositionRequest(BaseModel):
    journal_id:  str
    exit_price:  float = Field(gt=0)
    exit_reason: Optional[str] = None


# ── Zerodha helpers ───────────────────────────────────────────────────────────

def _get_kite(api_key: str, access_token: str):
    """Return a KiteConnect instance with access token set, or None if unavailable."""
    try:
        from kiteconnect import KiteConnect  # type: ignore
        kite = KiteConnect(api_key=api_key)
        kite.set_access_token(access_token)
        return kite
    except Exception as e:
        logger.warning(f"KiteConnect unavailable: {e}")
        return None


def _place_zerodha_order(kite, symbol: str, side: str, quantity: int, order_type: str) -> str | None:
    """Place order via Zerodha. Returns broker order ID or None on failure."""
    try:
        txn = kite.TRANSACTION_TYPE_BUY if side == "buy" else kite.TRANSACTION_TYPE_SELL
        otype = kite.ORDER_TYPE_MARKET if order_type == "market" else kite.ORDER_TYPE_LIMIT
        order_id = kite.place_order(
            variety=kite.VARIETY_REGULAR,
            exchange=kite.EXCHANGE_NSE,
            tradingsymbol=symbol,
            transaction_type=txn,
            quantity=quantity,
            product=kite.PRODUCT_CNC,
            order_type=otype,
        )
        return str(order_id)
    except Exception as e:
        logger.error(f"Zerodha order failed: {e}")
        return None


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/orders", status_code=status.HTTP_201_CREATED)
async def place_order(
    body: PlaceOrderRequest,
    user_id: str = Depends(get_current_user_id),
):
    """
    Place an order. Auto-creates an open journal entry.
    Routes through Zerodha if user has connected broker credentials.
    """
    sb = get_admin_client()
    sym = body.symbol.strip().upper()

    # Validate symbol
    sym_check = sb.table("stock_universe").select("symbol, company_name") \
        .eq("symbol", sym).maybe_single().execute()
    if not sym_check.data:
        raise HTTPException(status_code=404, detail=f"Symbol {sym} not found")

    company_name = sym_check.data.get("company_name", sym)

    # Try real broker if connected
    broker_order_id: str | None = None
    broker_used = "simulated"

    user_res = sb.table("users").select(
        "broker_type, broker_api_key, broker_access_token"
    ).eq("id", user_id).maybe_single().execute()

    if user_res.data:
        u = user_res.data
        if u.get("broker_type") == "zerodha" and u.get("broker_api_key") and u.get("broker_access_token"):
            kite = _get_kite(u["broker_api_key"], u["broker_access_token"])
            if kite:
                broker_order_id = _place_zerodha_order(kite, sym, body.side, body.quantity, body.order_type)
                if broker_order_id:
                    broker_used = "zerodha"

    trade_type = "long" if body.side == "buy" else "short"

    risk_reward: Optional[float] = None
    if body.stop_loss and body.target_price and body.stop_loss != body.price:
        risk   = abs(body.price - body.stop_loss)
        reward = abs(body.target_price - body.price)
        risk_reward = round(reward / risk, 2) if risk > 0 else None

    entry = {
        "user_id":        user_id,
        "symbol":         sym,
        "company_name":   company_name,
        "trade_type":     trade_type,
        "entry_date":     str(date.today()),
        "entry_price":    body.price,
        "quantity":       body.quantity,
        "stop_loss":      body.stop_loss,
        "target_price":   body.target_price,
        "setup_type":     body.setup_type,
        "entry_reason":   body.notes or f"{body.side.upper()} via chart — {body.order_type} order",
        "risk_reward":    risk_reward,
        "status":         "open",
    }
    if broker_order_id:
        entry["entry_reason"] = (entry["entry_reason"] or "") + f" [Zerodha #{broker_order_id}]"

    result = sb.table("trade_journal").insert(entry).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create journal entry")

    journal_entry = result.data[0]

    return {
        "status":      "filled",
        "order_type":  body.order_type,
        "broker":      broker_used,
        "broker_order_id": broker_order_id,
        "symbol":      sym,
        "side":        body.side,
        "quantity":    body.quantity,
        "price":       body.price,
        "message":     f"{body.side.upper()} {body.quantity} × {sym} @ ₹{body.price:,.2f} — recorded in Journal",
        "journal_id":  journal_entry["id"],
    }


@router.post("/orders/close")
async def close_position(
    body: ClosePositionRequest,
    user_id: str = Depends(get_current_user_id),
):
    """Close an open trade, compute P&L, trigger AI analysis."""
    sb = get_admin_client()

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

    pnl = (exit_price - entry_price) * qty if trade_type == "long" else (entry_price - exit_price) * qty
    pnl_pct = round(pnl / (entry_price * qty) * 100, 4)

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

    try:
        _trigger_ai_analysis(sb, {**entry, **update})
    except Exception:
        pass

    return {
        "status":  "closed",
        "pnl":     round(pnl, 2),
        "pnl_pct": pnl_pct,
        "message": f"Trade closed: {'profit' if pnl >= 0 else 'loss'} ₹{abs(pnl):,.2f} ({pnl_pct:+.2f}%)",
    }


@router.get("/orders")
async def list_open_positions(user_id: str = Depends(get_current_user_id)):
    """Returns open trades from the journal."""
    sb = get_admin_client()
    r = sb.table("trade_journal").select("*") \
        .eq("user_id", user_id).eq("status", "open") \
        .order("entry_date", desc=True).limit(50).execute()
    return r.data or []


# ── Zerodha OAuth flow ────────────────────────────────────────────────────────

@router.get("/broker/zerodha/login")
async def zerodha_login(user_id: str = Depends(get_current_user_id)):
    """
    Returns the Zerodha Kite login URL for the user's API key.
    Frontend opens this URL in a new tab; user logs in and is redirected
    to /broker/zerodha/callback with request_token.
    """
    sb = get_admin_client()
    u = sb.table("users").select("broker_api_key").eq("id", user_id).maybe_single().execute()
    if not u.data or not u.data.get("broker_api_key"):
        raise HTTPException(status_code=400, detail="Broker API key not configured")

    api_key = u.data["broker_api_key"]
    login_url = f"https://kite.zerodha.com/connect/login?api_key={api_key}&v=3"
    return {"login_url": login_url}


@router.get("/broker/zerodha/callback")
async def zerodha_callback(
    request_token: str = Query(...),
    user_id: str = Depends(get_current_user_id),
):
    """
    Exchange Zerodha request_token for a session access_token.
    Called after user authorises the Kite login.
    """
    sb = get_admin_client()
    u = sb.table("users").select("broker_api_key, broker_api_secret").eq("id", user_id).maybe_single().execute()
    if not u.data or not u.data.get("broker_api_key"):
        raise HTTPException(status_code=400, detail="Broker credentials not configured")

    api_key    = u.data["broker_api_key"]
    api_secret = u.data["broker_api_secret"]

    try:
        from kiteconnect import KiteConnect  # type: ignore
        kite = KiteConnect(api_key=api_key)
        session_data = kite.generate_session(request_token, api_secret=api_secret)
        access_token = session_data["access_token"]
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Zerodha session failed: {e}")

    import datetime
    sb.table("users").update({
        "broker_access_token": access_token,
        "broker_connected_at": datetime.datetime.utcnow().isoformat(),
    }).eq("id", user_id).execute()

    return {"status": "connected", "message": "Zerodha connected successfully"}


# ── AI analysis helper ────────────────────────────────────────────────────────

def _trigger_ai_analysis(sb, entry: dict) -> None:
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
        sb.table("trade_journal").update({"lessons": analysis}).eq("id", entry["id"]).execute()
    except Exception:
        pass
