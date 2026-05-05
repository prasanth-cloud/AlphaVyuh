"""
Broker Integration — Order placement with auto-journal entry creation.

Simulated broker:  instant fill at submitted price, journal entry created.
Zerodha Kite v3:   routes through Kite Connect when API key + access token exist.
                   Access token is fetched via the /broker/zerodha/connect flow.

Workflow:
  Chart → Place Order → Journal entry (status=open)
  Journal → Close Trade → P&L computed → local trade lesson stored
"""
from __future__ import annotations

import logging
from datetime import date
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field

from app.middleware.auth import get_current_user_id
from app.brokers.credentials import CredentialNotFoundError, get_broker_credential, upsert_broker_credential
from app.brokers.kite import api as kite_api
from app.brokers.kite.api import KiteApiError
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
    source_page:    Optional[Literal["chart", "watchlist", "scanner", "manual"]] = None
    source_context: Optional[str]   = None
    live_confirmed: bool = False


class ClosePositionRequest(BaseModel):
    journal_id:  str
    exit_price:  float = Field(gt=0)
    exit_reason: Optional[str] = None


# ── Broker helpers ────────────────────────────────────────────────────────────


def _place_upstox_order(
    api_key: str, access_token: str,
    symbol: str, side: str, quantity: int, price: float, order_type: str
) -> str | None:
    """Place order via Upstox v2 API. Returns order ID or None on failure."""
    try:
        import httpx
        txn   = "BUY" if side == "buy" else "SELL"
        otype = "MARKET" if order_type == "market" else "LIMIT"
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type":  "application/json",
            "Accept":        "application/json",
            "Api-Version":   "2.0",
        }
        payload = {
            "quantity":          quantity,
            "product":           "D",       # Delivery (CNC)
            "validity":          "DAY",
            "price":             price if otype == "LIMIT" else 0,
            "tag":               "alphavyuh",
            "instrument_token":  f"NSE_EQ|{symbol}",
            "order_type":        otype,
            "transaction_type":  txn,
            "disclosed_quantity": 0,
            "trigger_price":     0,
            "is_amo":            False,
        }
        r = httpx.post(
            "https://api.upstox.com/v2/order/place",
            json=payload, headers=headers, timeout=10
        )
        if r.status_code == 200:
            return r.json().get("data", {}).get("order_id")
        logger.error(f"Upstox order failed {r.status_code}: {r.text[:200]}")
    except Exception as e:
        logger.error(f"Upstox order error: {e}")
    return None


def _place_zerodha_order(
    api_key: str,
    access_token: str,
    symbol: str,
    side: str,
    quantity: int,
    price: float,
    order_type: str,
) -> str | None:
    """Place order via Zerodha. Returns broker order ID or None on failure."""
    try:
        data = kite_api.place_order(
            access_token=access_token,
            variety="regular",
            api_key=api_key,
            params={
                "exchange": "NSE",
                "tradingsymbol": symbol,
                "transaction_type": "BUY" if side == "buy" else "SELL",
                "quantity": quantity,
                "product": "CNC",
                "order_type": "MARKET" if order_type == "market" else "LIMIT",
                **({"price": price} if order_type == "limit" else {}),
            },
        )
        return str(data.get("order_id") or "")
    except KiteApiError as e:
        logger.error("Zerodha order failed: %s", e)
    except Exception as e:
        logger.error("Zerodha order error: %s", e)
        return None


def _zerodha_token_expiry() -> str:
    """Zerodha access tokens expire at 06:00 IST the next calendar day."""
    import datetime, zoneinfo
    ist = zoneinfo.ZoneInfo("Asia/Kolkata")
    now = datetime.datetime.now(ist)
    expiry = (now + datetime.timedelta(days=1)).replace(hour=6, minute=0, second=0, microsecond=0)
    return expiry.isoformat()


def _get_stored_credential(user_id: str, broker: str, key_name: str) -> str | None:
    try:
        return get_broker_credential(user_id, broker, key_name)
    except CredentialNotFoundError:
        return None
    except Exception:
        logger.exception("Failed to read %s credential for %s", key_name, broker)
        return None


def _get_user_broker_credentials(user_id: str, broker: str) -> dict[str, str | None]:
    sb = get_admin_client()
    user = (
        sb.table("users")
        .select("broker_type, broker_api_key, broker_api_secret, broker_access_token, broker_token_expires_at, broker_connected_at")
        .eq("id", user_id)
        .maybe_single()
        .execute()
    )
    row = user.data or {}
    if row.get("broker_type") and row.get("broker_type") != broker:
        return {"broker_type": row.get("broker_type")}
    return {
        "broker_type": row.get("broker_type"),
        "api_key": _get_stored_credential(user_id, broker, "api_key") or row.get("broker_api_key"),
        "api_secret": _get_stored_credential(user_id, broker, "api_secret") or row.get("broker_api_secret"),
        "access_token": _get_stored_credential(user_id, broker, "access_token") or row.get("broker_access_token"),
        "expires_at": _get_stored_credential(user_id, broker, "expires_at") or row.get("broker_token_expires_at"),
        "connected_at": row.get("broker_connected_at"),
    }


def _token_is_expired(expires_at: str | None) -> bool:
    if not expires_at:
        return False
    try:
        from datetime import datetime, timezone
        expiry = datetime.fromisoformat(str(expires_at).replace("Z", "+00:00"))
        if expiry.tzinfo is None:
            expiry = expiry.replace(tzinfo=timezone.utc)
        return expiry <= datetime.now(timezone.utc)
    except Exception:
        return True


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

    creds = _get_user_broker_credentials(user_id, "zerodha")
    bt = creds.get("broker_type")
    if bt and bt != "zerodha":
        creds = _get_user_broker_credentials(user_id, str(bt))
        bt = creds.get("broker_type")

    if bt:
        live_ready = bool(creds.get("api_key") and creds.get("access_token") and not _token_is_expired(creds.get("expires_at")))
        if live_ready and not body.live_confirmed:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Live {bt} order requires explicit confirmation. Re-submit after confirming symbol, side, quantity, price, and risk.",
            )
        if bt == "zerodha" and live_ready:
            broker_order_id = _place_zerodha_order(
                str(creds["api_key"]), str(creds["access_token"]), sym, body.side, body.quantity, body.price, body.order_type
            )
            if broker_order_id:
                broker_used = "zerodha"
        elif bt == "upstox" and live_ready:
            broker_order_id = _place_upstox_order(
                str(creds["api_key"]),
                str(creds["access_token"]),
                sym,
                body.side,
                body.quantity,
                body.price,
                body.order_type,
            )
            if broker_order_id:
                broker_used = "upstox"

    trade_type = "long" if body.side == "buy" else "short"

    risk_reward: Optional[float] = None
    if body.stop_loss and body.target_price and body.stop_loss != body.price:
        risk   = abs(body.price - body.stop_loss)
        reward = abs(body.target_price - body.price)
        risk_reward = round(reward / risk, 2) if risk > 0 else None

    broker_context = {
        "simulated": "Simulated",
        "zerodha": "Zerodha",
        "upstox": "Upstox",
    }.get(broker_used, broker_used.capitalize())

    source_context = (body.source_context or "").strip()
    source_label = {
        "chart": "Chart",
        "watchlist": "Watchlist",
        "scanner": "Scanner",
        "manual": "Manual",
    }.get(body.source_page or "chart", "Chart")

    base_reason = body.notes.strip() if body.notes else f"{body.side.upper()} via {source_label.lower()} — {body.order_type} order"
    context_bits = [broker_context, source_label]
    if source_context:
        context_bits.append(source_context[:80])
    if body.setup_type:
        context_bits.append(f"Setup {body.setup_type}")

    entry_reason = f"{base_reason} [{' · '.join(context_bits)}]"
    if broker_order_id:
        entry_reason = f"{entry_reason} [Order #{broker_order_id}]"

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
        "entry_reason":   entry_reason,
        "risk_reward":    risk_reward,
        "status":         "open",
    }

    result = sb.table("trade_journal").insert(entry).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create journal entry")

    journal_entry = result.data[0]
    next_actions = [
        "Journal draft created with setup, stop, target, and source context.",
        "When the trade is closed, AlphaVyuh will compute P&L and generate a trade lesson.",
        "Use the Journal AI tab after a few closed trades to surface repeat mistakes and process tips.",
    ]
    if broker_used == "simulated":
        next_actions.insert(0, "Simulated execution used because no live broker session was available.")
    else:
        next_actions.insert(0, f"Order routed to {broker_context}; verify final status in the broker terminal.")

    return {
        "status":      "filled",
        "order_type":  body.order_type,
        "broker":      broker_used,
        "execution_mode": broker_used if broker_used != "simulated" else "simulated",
        "broker_order_id": broker_order_id,
        "symbol":      sym,
        "side":        body.side,
        "quantity":    body.quantity,
        "price":       body.price,
        "risk_reward": risk_reward,
        "message":     f"{body.side.upper()} {body.quantity} × {sym} @ ₹{body.price:,.2f} — recorded in Journal",
        "journal_id":  journal_entry["id"],
        "journal_status": "open",
        "next_actions": next_actions,
    }


@router.post("/orders/close")
async def close_position(
    body: ClosePositionRequest,
    user_id: str = Depends(get_current_user_id),
):
    """Close an open trade, compute P&L, and generate a local trade lesson."""
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

    lesson_generated = False
    try:
        _trigger_ai_analysis(sb, {**entry, **update})
        lesson_generated = True
    except Exception:
        pass

    return {
        "status":  "closed",
        "pnl":     round(pnl, 2),
        "pnl_pct": pnl_pct,
        "lesson_generated": lesson_generated,
        "review_tip": "Open the journal review after close to inspect the generated lesson and tag execution mistakes.",
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

@router.get("/broker/status")
async def broker_status(user_id: str = Depends(get_current_user_id)):
    """Returns broker connection status for the current user."""
    sb = get_admin_client()
    u = sb.table("users").select(
        "broker_type, broker_api_key, broker_connected_at, broker_token_expires_at"
    ).eq("id", user_id).maybe_single().execute()

    if not u.data:
        return {"connected": False, "broker": None, "mode": "simulated", "token_expired": False}

    bt  = u.data.get("broker_type") or "zerodha"
    key = _get_stored_credential(user_id, bt, "api_key") or u.data.get("broker_api_key")
    tok = _get_stored_credential(user_id, bt, "access_token")
    expires_at = _get_stored_credential(user_id, bt, "expires_at") or u.data.get("broker_token_expires_at")

    token_expired = False
    if expires_at:
        try:
            from datetime import datetime, timezone

            expiry = datetime.fromisoformat(str(expires_at).replace("Z", "+00:00"))
            if expiry.tzinfo is None:
                expiry = expiry.replace(tzinfo=timezone.utc)
            token_expired = expiry <= datetime.now(timezone.utc)
        except Exception:
            token_expired = False

    connected = bool(bt and key and tok and not token_expired)

    return {
        "connected":    connected,
        "broker":       bt,
        "mode":         bt if connected else "simulated",
        "has_api_key":  bool(key),
        "has_token":    bool(tok),
        "token_expired": token_expired,
        "connected_at": u.data.get("broker_connected_at"),
        "token_expires_at": expires_at,
    }


@router.get("/broker/zerodha/login")
async def zerodha_login(user_id: str = Depends(get_current_user_id)):
    """
    Returns the Zerodha Kite login URL for the user's API key.
    Frontend opens this URL in a new tab; user logs in and is redirected
    to /broker/zerodha/callback with request_token.
    """
    sb = get_admin_client()
    creds = _get_user_broker_credentials(user_id, "zerodha")
    api_key = creds.get("api_key")
    if not api_key:
        raise HTTPException(status_code=400, detail="Broker API key not configured")

    login_url = f"https://kite.zerodha.com/connect/login?api_key={api_key}&v=3"
    return {"login_url": login_url}


@router.post("/broker/zerodha/import")
async def import_zerodha_trades(user_id: str = Depends(get_current_user_id)):
    """
    Import today's filled orders from Zerodha into the trade journal.
    Skips orders already recorded (matched by order ID in entry_reason).
    Requires a valid daily access token set via /broker/zerodha/callback.
    """
    sb = get_admin_client()
    creds = _get_user_broker_credentials(user_id, "zerodha")
    if not creds.get("api_key") or not creds.get("access_token"):
        raise HTTPException(status_code=400, detail="Zerodha not connected. Complete the OAuth login first.")

    try:
        orders = kite_api.list_orders(
            access_token=str(creds["access_token"]),
            api_key=str(creds["api_key"]),
        )
    except KiteApiError as e:
        raise HTTPException(status_code=400, detail=f"Zerodha API error: {e.message}")
    except Exception:
        logger.exception("Zerodha import failed for user %s", user_id)
        raise HTTPException(status_code=400, detail="Could not connect to Zerodha — check your credentials")

    filled = [o for o in orders if o.get("status") == "COMPLETE"]
    imported = 0
    skipped = 0

    for order in filled:
        sym      = (order.get("tradingsymbol") or "").strip().upper()
        qty      = int(order.get("filled_quantity") or 0)
        avg_px   = float(order.get("average_price") or 0)
        txn      = (order.get("transaction_type") or "BUY").upper()
        order_id = str(order.get("order_id") or "")

        if not sym or not qty or not avg_px or not order_id:
            continue

        # Skip if already imported
        existing = (
            sb.table("trade_journal")
            .select("id")
            .eq("user_id", user_id)
            .ilike("entry_reason", f"%{order_id}%")
            .execute()
        )
        if existing.data:
            skipped += 1
            continue

        # Try to get company name
        stock = sb.table("stock_universe").select("company_name") \
            .eq("symbol", sym).maybe_single().execute()
        company_name = stock.data["company_name"] if stock.data else sym

        trade_type = "long" if txn == "BUY" else "short"
        entry = {
            "user_id":      user_id,
            "symbol":       sym,
            "company_name": company_name,
            "trade_type":   trade_type,
            "entry_date":   str(date.today()),
            "entry_price":  avg_px,
            "quantity":     qty,
            "entry_reason": f"Zerodha import — order #{order_id} [Zerodha]",
            "status":       "open",
        }
        sb.table("trade_journal").insert(entry).execute()
        imported += 1

    return {
        "imported": imported,
        "skipped":  skipped,
        "total_filled_orders": len(filled),
        "message": f"Imported {imported} new trade(s) from Zerodha.",
    }


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
    creds = _get_user_broker_credentials(user_id, "zerodha")
    if not creds.get("api_key"):
        raise HTTPException(status_code=400, detail="Broker credentials not configured")

    api_key    = str(creds["api_key"])
    api_secret = str(creds.get("api_secret") or "")
    if not api_secret:
        raise HTTPException(status_code=400, detail="Broker API secret not configured")

    try:
        session_data = kite_api.exchange_code(
            request_token=request_token,
            api_key=api_key,
            api_secret=api_secret,
        )
        access_token = session_data["access_token"]
    except KiteApiError as e:
        # Never include `e` in the response — it may contain api_secret or request_token.
        logger.error("Zerodha session generation failed for user %s: %s", user_id, e.message)
        raise HTTPException(status_code=400, detail="Zerodha session failed — check your API key and secret")
    except Exception:
        logger.exception("Zerodha session generation failed for user %s", user_id)
        raise HTTPException(status_code=400, detail="Zerodha session failed — check your API key and secret")

    import datetime
    now_iso = datetime.datetime.now(datetime.UTC).isoformat()

    expiry = _zerodha_token_expiry()
    upsert_broker_credential(user_id, "zerodha", "access_token", access_token)
    upsert_broker_credential(user_id, "zerodha", "expires_at", expiry)

    sb.table("users").update({
        "broker_type":            "zerodha",
        "broker_access_token":    None,
        "broker_token_expires_at": expiry,
        "broker_connected_at":    now_iso,
    }).eq("id", user_id).execute()

    return {"status": "connected", "message": "Zerodha connected successfully"}


# ── Trade analysis helper ─────────────────────────────────────────────────────

def _trigger_ai_analysis(sb, entry: dict) -> None:
    try:
        from app.routers.ai import generate_trade_lesson

        analysis = generate_trade_lesson(entry)
        sb.table("trade_journal").update({"lessons": analysis}).eq("id", entry["id"]).execute()
    except Exception:
        logger.exception("Trade lesson generation failed for journal entry %s", entry.get("id"))
