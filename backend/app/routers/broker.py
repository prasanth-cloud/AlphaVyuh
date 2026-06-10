"""
Broker Integration — Order placement with auto-journal entry creation.

Simulated broker:  instant fill at submitted price, journal entry created.
Zerodha Kite v3:   routes through Kite Connect when platform app config + user access token exist.
                   Access token is fetched via the /broker/zerodha/connect flow.

Workflow:
  Chart → Place Order → Journal entry (status=open)
  Journal → Close Trade → P&L computed → local trade lesson stored
"""
from __future__ import annotations

import logging
import os
from datetime import date, datetime, timezone
from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field

from app.middleware.auth import get_current_user_id
from app.brokers.adapter import (
    BrokerCredentials,
    BrokerError,
    IdempotencyKey,
    OrderExtensions,
    OrderRequest as BrokerOrderRequest,
    UpstoxExtensions,
    ZerodhaExtensions,
)
from app.brokers.credentials import CredentialNotFoundError, get_broker_credential, upsert_broker_credential
from app.brokers.factory import get_adapter
from app.brokers.oauth_state import (
    BrokerOAuthStateError,
    create_broker_oauth_state,
    verify_broker_oauth_state,
)
from app.brokers.kite import api as kite_api
from app.brokers.kite.api import KiteApiError
from app.brokers.upstox.adapter import UpstoxAdapter
from app.services.supabase import get_admin_client, settings
from app.services.workflow_state import sync_workflow_state

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["orders"])

BROKER_IMPORT_MARKER = "alphavyuh-broker-import"
BROKER_READ_ONLY_SMOKE_MAX_AGE_HOURS = 24


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
    thesis:         Optional[str]   = None
    invalidation_rule: Optional[str] = None
    scanner_context: Optional[dict[str, Any]] = None
    source_page:    Optional[Literal["chart", "watchlist", "scanner", "manual"]] = None
    source_context: Optional[str]   = None
    chart_snapshot: Optional[dict[str, Any]] = None
    live_confirmed: bool = False
    idempotency_key: Optional[str] = None


class BrokerCallbackRequest(BaseModel):
    code_or_token: str
    state: str


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


def _broker_env_prefix(broker: str) -> str:
    return "KITE" if broker == "zerodha" else broker.upper()


def _broker_env_value(broker: str, key_name: str) -> str | None:
    prefix = _broker_env_prefix(broker)
    candidates = {
        "api_key": [f"{prefix}_API_KEY", "ZERODHA_API_KEY" if broker == "zerodha" else ""],
        "api_secret": [f"{prefix}_API_SECRET", "ZERODHA_API_SECRET" if broker == "zerodha" else ""],
    }.get(key_name, [])
    for name in candidates:
        if not name:
            continue
        value = os.getenv(name, "").strip()
        if value:
            return value
    return None


def _get_user_plan(user_id: str) -> tuple[str, str | None]:
    try:
        row = (
            get_admin_client()
            .table("users")
            .select("plan, plan_expires_at")
            .eq("id", user_id)
            .maybe_single()
            .execute()
        ).data or {}
    except Exception:
        logger.exception("Failed to read plan for user %s", user_id)
        return "free", None
    return str(row.get("plan") or "free"), row.get("plan_expires_at")


def _plan_allows_broker(plan: str, expires_at: str | None = None) -> bool:
    if plan not in {"pro", "elite"}:
        return False
    if not expires_at:
        return True
    try:
        expiry = datetime.fromisoformat(str(expires_at).replace("Z", "+00:00"))
        if expiry.tzinfo is None:
            expiry = expiry.replace(tzinfo=timezone.utc)
        return expiry > datetime.now(timezone.utc)
    except Exception:
        return False


def _require_broker_plan(user_id: str) -> tuple[str, str | None]:
    plan, expires_at = _get_user_plan(user_id)
    if not _plan_allows_broker(plan, expires_at):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "plan_required",
                "message": "Broker integration requires Pro or Elite.",
                "upgrade_url": "/settings/billing",
            },
        )
    return plan, expires_at


def _require_valid_broker_state(state_value: str | None, *, user_id: str, broker: str) -> None:
    try:
        verify_broker_oauth_state(state_value, user_id=user_id, broker=broker)
    except BrokerOAuthStateError as exc:
        raise HTTPException(
            status_code=400,
            detail="Broker authorization state expired or invalid. Start broker connect again.",
        ) from exc


def _upsert_broker_connection(
    sb,
    *,
    user_id: str,
    broker: str,
    broker_user_id: str | None = None,
    broker_user_name: str | None = None,
    token_expires_at: str | None = None,
    last_synced_at: str | None = None,
    connection_status: str = "connected_read_only",
    scopes: list[str] | None = None,
    metadata: dict | None = None,
) -> None:
    try:
        safe_metadata = metadata
        if safe_metadata is None:
            try:
                existing = (
                    sb.table("broker_connections")
                    .select("metadata")
                    .eq("user_id", user_id)
                    .eq("broker", broker)
                    .maybe_single()
                    .execute()
                ).data or {}
                safe_metadata = existing.get("metadata") if isinstance(existing.get("metadata"), dict) else {}
            except Exception:
                safe_metadata = {}
        payload = {
            "user_id": user_id,
            "broker": broker,
            "broker_user_id": broker_user_id,
            "broker_user_name": broker_user_name,
            "token_expires_at": token_expires_at,
            "is_active": True,
            "connection_status": connection_status,
            "scopes": scopes or ["profile", "holdings", "positions", "orders", "trades"],
            "metadata": safe_metadata,
        }
        if last_synced_at:
            payload["last_synced_at"] = last_synced_at
        sb.table("broker_connections").upsert(payload, on_conflict="user_id,broker").execute()
    except Exception:
        logger.debug("Broker connection metadata unavailable; migration may not be applied yet.", exc_info=True)


def _mark_broker_disconnected(sb, user_id: str, broker: str) -> None:
    try:
        sb.table("broker_connections").update(
            {"is_active": False, "connection_status": "disconnected"}
        ).eq("user_id", user_id).eq("broker", broker).execute()
    except Exception:
        logger.debug("Broker connection metadata unavailable during disconnect.", exc_info=True)


def _record_broker_order(
    sb,
    *,
    user_id: str,
    broker: str,
    broker_order_id: str | None,
    journal_id: str | None,
    symbol: str,
    side: str,
    quantity: int,
    order_type: str,
    price: float | None,
    trigger_price: float | None,
    status_value: str,
    idempotency_key: str | None,
    raw_response: dict,
) -> None:
    try:
        sb.table("broker_orders").insert(
            {
                "user_id": user_id,
                "broker": broker,
                "broker_order_id": broker_order_id,
                "journal_id": journal_id,
                "symbol": symbol,
                "exchange": "NSE",
                "side": "BUY" if side == "buy" else "SELL",
                "quantity": quantity,
                "order_type": "MARKET" if order_type == "market" else "LIMIT",
                "price": price,
                "trigger_price": trigger_price,
                "status": status_value,
                "idempotency_key": idempotency_key,
                "raw_response": raw_response,
            }
        ).execute()
    except Exception:
        logger.debug("Broker order log unavailable; migration may not be applied yet.", exc_info=True)


def _smoke_checked_at_is_fresh(checked_at: Any) -> bool:
    if not isinstance(checked_at, str) or not checked_at.strip():
        return False
    try:
        parsed = datetime.fromisoformat(checked_at.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
    except Exception:
        return False
    age_seconds = (datetime.now(timezone.utc) - parsed).total_seconds()
    return 0 <= age_seconds <= BROKER_READ_ONLY_SMOKE_MAX_AGE_HOURS * 60 * 60


def _smoke_metadata_passed(metadata: dict | None, broker: str) -> bool:
    if not isinstance(metadata, dict):
        return False
    smoke = metadata.get("read_only_smoke")
    if not isinstance(smoke, dict):
        return False
    return (
        smoke.get("broker") == broker
        and smoke.get("passed") is True
        and _smoke_checked_at_is_fresh(smoke.get("checked_at"))
    )


def _smoke_metadata_status(metadata: dict | None, broker: str) -> dict[str, Any]:
    if not isinstance(metadata, dict):
        return {"passed": False, "checked_at": None, "checks": {}}
    smoke = metadata.get("read_only_smoke")
    if not isinstance(smoke, dict) or smoke.get("broker") != broker:
        return {"passed": False, "checked_at": None, "checks": {}, "fresh": False}
    checks = smoke.get("checks") if isinstance(smoke.get("checks"), dict) else {}
    fresh = _smoke_checked_at_is_fresh(smoke.get("checked_at"))
    return {
        "passed": smoke.get("passed") is True and fresh,
        "checked_at": smoke.get("checked_at") if isinstance(smoke.get("checked_at"), str) else None,
        "checks": checks,
        "fresh": fresh,
    }


def _broker_read_only_smoke_passed(sb, user_id: str, broker: str) -> bool:
    try:
        row = (
            sb.table("broker_connections")
            .select("metadata")
            .eq("user_id", user_id)
            .eq("broker", broker)
            .maybe_single()
            .execute()
        ).data or {}
        return _smoke_metadata_passed(row.get("metadata"), broker)
    except Exception:
        logger.debug("Unable to read %s read-only smoke gate metadata", broker, exc_info=True)
        return False


def _require_read_only_smoke_gate(sb, user_id: str, broker: str) -> None:
    if _broker_read_only_smoke_passed(sb, user_id, broker):
        return
    raise HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail=(
            f"Live {broker} order placement is blocked until the owner-run read-only "
            "broker smoke passes. Save this as a journal draft and place any real trade "
            "directly in the broker terminal."
        ),
    )


def _smoke_metadata(*, broker: str, passed: bool, checked_at: str, checks: dict[str, dict]) -> dict:
    return {
        "read_only_smoke": {
            "broker": broker,
            "passed": passed,
            "checked_at": checked_at,
            "checks": {
                name: {
                    key: value
                    for key, value in check.items()
                    if key in {"ok", "count", "error", "note", "user_id_present"}
                }
                for name, check in checks.items()
            },
        }
    }


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
        .select("broker_type, broker_access_token, broker_token_expires_at, broker_connected_at")
        .eq("id", user_id)
        .maybe_single()
        .execute()
    )
    row = user.data or {}
    if row.get("broker_type") and row.get("broker_type") != broker:
        return {"broker_type": row.get("broker_type")}
    return {
        "broker_type": row.get("broker_type"),
        "api_key": _broker_env_value(broker, "api_key"),
        "api_secret": _broker_env_value(broker, "api_secret"),
        "access_token": _get_stored_credential(user_id, broker, "access_token") or row.get("broker_access_token"),
        "expires_at": _get_stored_credential(user_id, broker, "expires_at") or row.get("broker_token_expires_at"),
        "connected_at": row.get("broker_connected_at"),
    }


def _token_is_expired(expires_at: str | None) -> bool:
    if not expires_at:
        return False
    try:
        expiry = datetime.fromisoformat(str(expires_at).replace("Z", "+00:00"))
        if expiry.tzinfo is None:
            expiry = expiry.replace(tzinfo=timezone.utc)
        return expiry <= datetime.now(timezone.utc)
    except Exception:
        return True


def _workflow_context_for_import(sb, user_id: str, symbol: str) -> dict:
    try:
        return (
            sb.table("workflow_states")
            .select("setup_type,scanner_context")
            .eq("user_id", user_id)
            .eq("symbol", symbol)
            .maybe_single()
            .execute()
            .data or {}
        )
    except Exception:
        return {}


def _journal_enrichment_from_workflow(workflow: dict) -> dict:
    scanner_context = workflow.get("scanner_context")
    setup_type = workflow.get("setup_type")
    enrichment: dict[str, Any] = {}
    if setup_type:
        enrichment["setup_type"] = setup_type
    if isinstance(scanner_context, dict):
        enrichment["scanner_context"] = scanner_context
    enrichment["source_page"] = "broker-import"
    return enrichment


def _fifo_close_open_long(
    sb,
    user_id: str,
    symbol: str,
    exit_price: float,
    exit_reason: str,
) -> bool:
    open_res = (
        sb.table("trade_journal")
        .select("*")
        .eq("user_id", user_id)
        .eq("symbol", symbol)
        .eq("trade_type", "long")
        .eq("status", "open")
        .order("entry_date", desc=False)
        .order("created_at", desc=False)
        .limit(1)
        .execute()
    )
    if not open_res.data:
        return False

    entry = open_res.data[0]
    entry_price = float(entry["entry_price"])
    qty = int(entry["quantity"])
    pnl = (exit_price - entry_price) * qty
    pnl_pct = round(pnl / (entry_price * qty) * 100, 4) if entry_price and qty else 0

    try:
        from datetime import date as date_
        ed = date_.fromisoformat(entry["entry_date"])
        holding_days = (date_.today() - ed).days
    except Exception:
        holding_days = None

    sb.table("trade_journal").update({
        "exit_date": str(date.today()),
        "exit_price": exit_price,
        "exit_reason": exit_reason,
        "pnl": round(pnl, 2),
        "pnl_pct": pnl_pct,
        "holding_days": holding_days,
        "status": "closed",
    }).eq("id", entry["id"]).execute()
    sync_workflow_state(sb, user_id, symbol, {
        "source": "broker-import",
        "lifecycle": "closed",
        "journal_id": entry["id"],
    })
    return True


def _import_already_recorded(sb, user_id: str, marker: str) -> bool:
    for column in ("entry_reason", "exit_reason"):
        existing = (
            sb.table("trade_journal")
            .select("id")
            .eq("user_id", user_id)
            .ilike(column, f"%{marker}%")
            .execute()
        )
        if existing.data:
            return True
    return False


def _broker_import_marker(broker: str, order_id: str) -> str:
    return f"{BROKER_IMPORT_MARKER}:{broker}:order:{order_id}"


def _latest_broker_import_at(sb, user_id: str, broker: str) -> str | None:
    try:
        result = (
            sb.table("trade_journal")
            .select("created_at")
            .eq("user_id", user_id)
            .ilike("entry_reason", f"%{BROKER_IMPORT_MARKER}:{broker}:%")
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        row = (result.data or [None])[0]
        return row.get("created_at") if row else None
    except Exception:
        logger.debug("Unable to read latest %s import timestamp", broker, exc_info=True)
        return None


def _status_payload(
    *,
    broker: str | None,
    key: str | None,
    token: str | None,
    token_expired: bool,
    connected_at: str | None,
    expires_at: str | None,
    last_synced_at: str | None,
    plan: str = "free",
    plan_allows_broker: bool = False,
    broker_user_name: str | None = None,
    read_only_smoke_passed: bool = False,
    read_only_smoke_fresh: bool = False,
    read_only_smoke_checked_at: str | None = None,
    read_only_smoke_checks: dict[str, Any] | None = None,
) -> dict:
    connected = bool(plan_allows_broker and broker and key and token and not token_expired)
    if connected:
        status_code = "connected_read_only"
        status_label = f"{broker.capitalize()} connected read-only"
    elif not plan_allows_broker:
        status_code = "plan_required"
        status_label = "Upgrade to Pro or Elite to connect a broker"
    elif token_expired:
        status_code = "token_expired"
        status_label = "Broker token expired"
    elif key:
        status_code = "not_connected"
        status_label = "Broker login required"
    else:
        status_code = "credentials_missing"
        status_label = "Broker connect is temporarily unavailable"

    return {
        "connected": connected,
        "broker": broker if broker else None,
        "mode": broker if connected else "simulated",
        "status": status_code,
        "status_label": status_label,
        "plan": plan,
        "plan_allows_broker": plan_allows_broker,
        "has_api_key": bool(key),
        "has_token": bool(token),
        "token_expired": token_expired,
        "connected_at": connected_at,
        "token_expires_at": expires_at,
        "broker_user_name": broker_user_name,
        "read_only": connected,
        "can_import": connected and broker in {"zerodha", "upstox"},
        "sync_status": "idle",
        "last_synced_at": last_synced_at,
        "read_only_smoke_required": True,
        "read_only_smoke_passed": read_only_smoke_passed,
        "read_only_smoke_fresh": read_only_smoke_fresh,
        "read_only_smoke_checked_at": read_only_smoke_checked_at,
        "read_only_smoke_checks": read_only_smoke_checks or {},
        "live_order_requires_confirmation": True,
        "live_order_enabled": bool(
            settings.broker_live_orders_enabled and connected and read_only_smoke_passed
        ),
    }


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
    plan, plan_expires_at = _get_user_plan(user_id)
    plan_allows_broker = _plan_allows_broker(plan, plan_expires_at)

    if body.live_confirmed and not settings.broker_live_orders_enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Live broker order placement is not enabled. Use simulated journal capture or broker trade import.",
        )
    if body.live_confirmed and not plan_allows_broker:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "plan_required",
                "message": "Live broker order placement requires Pro or Elite.",
                "upgrade_url": "/settings/billing",
            },
        )

    # Validate symbol
    sym_check = sb.table("stock_universe").select("symbol, company_name, isin") \
        .eq("symbol", sym).maybe_single().execute()
    if not sym_check.data:
        raise HTTPException(status_code=404, detail=f"Symbol {sym} not found")

    company_name = sym_check.data.get("company_name", sym)
    isin = sym_check.data.get("isin")

    # Try real broker if connected and explicitly enabled for a future release.
    broker_order_id: str | None = None
    broker_used = "simulated"

    creds = _get_user_broker_credentials(user_id, "zerodha") if settings.broker_live_orders_enabled else {}
    bt = creds.get("broker_type") if settings.broker_live_orders_enabled else None
    if settings.broker_live_orders_enabled and bt and bt != "zerodha":
        creds = _get_user_broker_credentials(user_id, str(bt))
        bt = creds.get("broker_type")

    if bt:
        live_ready = bool(creds.get("api_key") and creds.get("access_token") and not _token_is_expired(creds.get("expires_at")))
        if live_ready and not body.live_confirmed:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Live {bt} order requires explicit confirmation. Re-submit after confirming symbol, side, quantity, price, and risk.",
            )
        if live_ready and body.live_confirmed and bt in {"zerodha", "upstox"}:
            _require_read_only_smoke_gate(sb, user_id, str(bt))
        if bt == "zerodha" and live_ready:
            import uuid

            try:
                adapter_result = await get_adapter("zerodha").place_order(
                    user_id,
                    BrokerCredentials(
                        broker_id="zerodha",
                        access_token=str(creds["access_token"]),
                        expires_at=datetime.fromisoformat(str(creds["expires_at"]).replace("Z", "+00:00")),
                    ),
                    BrokerOrderRequest(
                        idempotency_key=IdempotencyKey(body.idempotency_key or str(uuid.uuid4())),
                        symbol=sym,
                        exchange="NSE",
                        side="BUY" if body.side == "buy" else "SELL",
                        quantity=body.quantity,
                        order_type="MARKET" if body.order_type == "market" else "LIMIT",
                        limit_price=body.price if body.order_type == "limit" else None,
                        product="CNC",
                        validity="DAY",
                        extensions=OrderExtensions(zerodha=ZerodhaExtensions(variety="regular")),
                    ),
                )
            except BrokerError as exc:
                logger.error("Zerodha adapter order failed for user %s: %s", user_id, exc)
                if exc.kind == "INVALID_REQUEST":
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"Live {bt} order failed before journal creation. No simulated order was created.",
                ) from exc
            broker_order_id = str(adapter_result.order.broker_order_id)
            if broker_order_id:
                broker_used = "zerodha"
        elif bt == "upstox" and live_ready:
            import uuid

            try:
                adapter_result = await UpstoxAdapter().place_order(
                    user_id,
                    BrokerCredentials(
                        broker_id="upstox",
                        access_token=str(creds["access_token"]),
                        expires_at=datetime.fromisoformat(str(creds["expires_at"]).replace("Z", "+00:00")),
                    ),
                    BrokerOrderRequest(
                        idempotency_key=IdempotencyKey(body.idempotency_key or str(uuid.uuid4())),
                        symbol=sym,
                        exchange="NSE",
                        side="BUY" if body.side == "buy" else "SELL",
                        quantity=body.quantity,
                        order_type="MARKET" if body.order_type == "market" else "LIMIT",
                        limit_price=body.price if body.order_type == "limit" else None,
                        product="CNC",
                        validity="DAY",
                        extensions=OrderExtensions(
                            upstox=UpstoxExtensions(instrument_token=f"NSE_EQ|{isin}") if isin else None
                        ),
                    ),
                )
            except BrokerError as exc:
                logger.error("Upstox adapter order failed for user %s: %s", user_id, exc)
                if exc.kind == "INVALID_REQUEST":
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"Live {bt} order failed before journal creation. No simulated order was created.",
                ) from exc
            broker_order_id = str(adapter_result.order.broker_order_id)
            if broker_order_id:
                broker_used = "upstox"
        if live_ready and body.live_confirmed and bt in {"zerodha", "upstox"} and not broker_order_id:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Live {bt} order failed before journal creation. No simulated order was created.",
            )

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

    workflow_context = {}
    try:
        workflow_context = (
            sb.table("workflow_states")
            .select("source,setup_type,thesis,invalidation_rule,scanner_context,notes")
            .eq("user_id", user_id)
            .eq("symbol", sym)
            .maybe_single()
            .execute()
            .data or {}
        )
    except Exception:
        workflow_context = {}

    source_context = (body.source_context or "").strip()
    scanner_context = body.scanner_context or workflow_context.get("scanner_context")
    if body.chart_snapshot:
        base_context = scanner_context if isinstance(scanner_context, dict) else {}
        scanner_context = {**base_context, "chart_snapshot": body.chart_snapshot}
    thesis = body.thesis or workflow_context.get("thesis")
    invalidation_rule = body.invalidation_rule or workflow_context.get("invalidation_rule")
    setup_type = body.setup_type or workflow_context.get("setup_type")
    source_page = body.source_page or workflow_context.get("source") or "chart"
    if source_page not in {"chart", "watchlist", "scanner", "manual"}:
        source_page = "chart"
    source_label = {
        "chart": "Chart",
        "watchlist": "Watchlist",
        "scanner": "Scanner",
        "manual": "Manual",
    }.get(source_page, "Chart")

    reason_parts = []
    if isinstance(scanner_context, dict):
        if scanner_context.get("preset_name"):
            reason_parts.append(f"Scanner: {str(scanner_context['preset_name'])[:80]}")
        score_bits = [scanner_context.get("setup_grade"), scanner_context.get("setup_score")]
        score_text = " ".join(str(bit) for bit in score_bits if bit not in (None, ""))
        if score_text:
            reason_parts.append(f"Score: {score_text[:40]}")
        match_reasons = scanner_context.get("match_reasons")
        if isinstance(match_reasons, list) and match_reasons:
            reason_parts.append(f"Matched: {str(match_reasons[0])[:120]}")
        if scanner_context.get("data_as_of"):
            reason_parts.append(f"As of: {str(scanner_context['data_as_of'])[:32]}")
    if body.notes and body.notes.strip():
        reason_parts.append(body.notes.strip())
    if thesis and str(thesis).strip():
        reason_parts.append(f"Thesis: {str(thesis).strip()}")
    if invalidation_rule and str(invalidation_rule).strip():
        reason_parts.append(f"Invalidation: {str(invalidation_rule).strip()}")
    base_reason = " | ".join(reason_parts) if reason_parts else f"{body.side.upper()} via {source_label.lower()} — {body.order_type} order"
    context_bits = [broker_context, source_label]
    if source_context:
        context_bits.append(source_context[:80])
    if setup_type:
        context_bits.append(f"Setup {setup_type}")

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
        "setup_type":     setup_type,
        "entry_reason":   entry_reason,
        "risk_reward":    risk_reward,
        "source_page":    source_page,
        "source_context": source_context or None,
        "scanner_context": scanner_context if isinstance(scanner_context, dict) else None,
        "thesis":         thesis,
        "invalidation_rule": invalidation_rule,
        "status":         "open",
    }

    result = sb.table("trade_journal").insert(entry).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create journal entry")

    journal_entry = result.data[0]
    _record_broker_order(
        sb,
        user_id=user_id,
        broker=broker_used,
        broker_order_id=broker_order_id,
        journal_id=journal_entry.get("id"),
        symbol=sym,
        side=body.side,
        quantity=body.quantity,
        order_type=body.order_type,
        price=body.price,
        trigger_price=None,
        status_value="PLACED" if broker_order_id else "SIMULATED",
        idempotency_key=body.idempotency_key,
        raw_response={
            "broker": broker_used,
            "broker_order_id": broker_order_id,
            "journal_id": journal_entry.get("id"),
            "live_confirmed": body.live_confirmed,
        },
    )
    sync_workflow_state(sb, user_id, sym, {
        "source": source_page,
        "lifecycle": "open",
        "entry": body.price,
        "stop": body.stop_loss,
        "target": body.target_price,
        "position_size": body.quantity,
        "setup_type": setup_type,
        "notes": body.notes,
        "thesis": thesis,
        "invalidation_rule": invalidation_rule,
        "scanner_context": scanner_context,
        "broker_order_id": broker_order_id,
        "journal_id": journal_entry["id"],
    })
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
    sync_workflow_state(sb, user_id, str(entry["symbol"]).upper(), {
        "source": "journal",
        "lifecycle": "closed",
        "journal_id": body.journal_id,
    })

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
    plan, plan_expires_at = _get_user_plan(user_id)
    plan_allows_broker = _plan_allows_broker(plan, plan_expires_at)
    u = sb.table("users").select(
        "broker_type, broker_connected_at, broker_token_expires_at"
    ).eq("id", user_id).maybe_single().execute()

    if not u.data:
        return _status_payload(
            broker=None,
            key=None,
            token=None,
            token_expired=False,
            connected_at=None,
            expires_at=None,
            last_synced_at=None,
            plan=plan,
            plan_allows_broker=plan_allows_broker,
            read_only_smoke_passed=False,
        )

    bt  = u.data.get("broker_type") or "zerodha"
    key = _broker_env_value(bt, "api_key")
    tok = _get_stored_credential(user_id, bt, "access_token")
    expires_at = _get_stored_credential(user_id, bt, "expires_at") or u.data.get("broker_token_expires_at")
    broker_user_name = None
    metadata_last_synced_at = None
    read_only_smoke = {"passed": False, "checked_at": None, "checks": {}}
    try:
        connection = (
            sb.table("broker_connections")
            .select("broker_user_name, last_synced_at, token_expires_at, is_active, metadata")
            .eq("user_id", user_id)
            .eq("broker", bt)
            .maybe_single()
            .execute()
        ).data or {}
        if connection.get("broker_user_name"):
            broker_user_name = connection["broker_user_name"]
        if connection.get("last_synced_at"):
            metadata_last_synced_at = connection["last_synced_at"]
        if connection.get("token_expires_at") and not expires_at:
            expires_at = connection["token_expires_at"]
        read_only_smoke = _smoke_metadata_status(connection.get("metadata"), bt)
    except Exception:
        logger.debug("Broker connection metadata unavailable for status.", exc_info=True)

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

    return _status_payload(
        broker=bt,
        key=key,
        token=tok,
        token_expired=token_expired,
        connected_at=u.data.get("broker_connected_at"),
        expires_at=expires_at,
        last_synced_at=metadata_last_synced_at or _latest_broker_import_at(sb, user_id, bt),
        plan=plan,
        plan_allows_broker=plan_allows_broker,
        broker_user_name=broker_user_name,
        read_only_smoke_passed=bool(read_only_smoke["passed"]),
        read_only_smoke_fresh=bool(read_only_smoke.get("fresh")),
        read_only_smoke_checked_at=read_only_smoke["checked_at"],
        read_only_smoke_checks=read_only_smoke["checks"],
    )


@router.get("/broker/zerodha/login")
async def zerodha_login(user_id: str = Depends(get_current_user_id)):
    """
    Returns the Zerodha Kite login URL for AlphaVyuh's platform Kite app.
    Frontend opens this URL in a new tab; user logs in and is redirected
    to /broker/zerodha/callback with request_token.
    """
    _require_broker_plan(user_id)
    sb = get_admin_client()
    creds = _get_user_broker_credentials(user_id, "zerodha")
    api_key = creds.get("api_key")
    if not api_key:
        raise HTTPException(status_code=503, detail="Zerodha connect is temporarily unavailable. AlphaVyuh broker app credentials are not configured.")

    state_value = create_broker_oauth_state(user_id, "zerodha")
    login_url = kite_api.get_auth_url(state_value, api_key=str(api_key))
    return {"login_url": login_url}


@router.get("/broker/zerodha/read-only-smoke")
async def zerodha_read_only_smoke(user_id: str = Depends(get_current_user_id)):
    """
    Run read-only Kite checks and return sanitized status/counts only.
    This endpoint never places, modifies, or cancels broker orders.
    """
    _require_broker_plan(user_id)
    creds = _get_user_broker_credentials(user_id, "zerodha")
    api_key = creds.get("api_key")
    access_token = creds.get("access_token")
    token_expired = _token_is_expired(creds.get("expires_at"))
    checks: dict[str, dict] = {
        "login_url": {"ok": bool(api_key)},
        "profile": {"ok": False},
        "positions": {"ok": False, "count": 0},
        "holdings": {"ok": False, "count": 0},
        "orderbook": {"ok": False, "count": 0},
        "tradebook": {"ok": False, "count": 0},
    }

    if not api_key:
        checks["login_url"]["error"] = "AlphaVyuh broker app credentials are not configured."
    if not api_key or not access_token or token_expired:
        checked_at = datetime.now(timezone.utc).isoformat()
        _upsert_broker_connection(
            get_admin_client(),
            user_id=user_id,
            broker="zerodha",
            token_expires_at=creds.get("expires_at"),
            last_synced_at=checked_at,
            connection_status="connected_read_only" if access_token and not token_expired else "not_connected",
            metadata=_smoke_metadata(
                broker="zerodha",
                passed=False,
                checked_at=checked_at,
                checks=checks,
            ),
        )
        return {
            "broker": "zerodha",
            "connected_read_only": False,
            "token_expired": token_expired,
            "checks": checks,
        }

    try:
        profile = kite_api.get_profile(str(access_token), api_key=str(api_key))
        checks["profile"] = {"ok": True, "user_id_present": bool(profile.get("user_id"))}
    except KiteApiError as exc:
        checks["profile"] = {"ok": False, "error": exc.error_type}

    try:
        positions = kite_api.get_positions(str(access_token), api_key=str(api_key))
        net_positions = positions.get("net", []) if isinstance(positions, dict) else []
        checks["positions"] = {"ok": True, "count": len(net_positions)}
    except KiteApiError as exc:
        checks["positions"] = {"ok": False, "count": 0, "error": exc.error_type}

    try:
        holdings = kite_api.get_holdings(str(access_token), api_key=str(api_key))
        checks["holdings"] = {"ok": True, "count": len(holdings)}
    except KiteApiError as exc:
        checks["holdings"] = {"ok": False, "count": 0, "error": exc.error_type}

    orders: list[dict] = []
    try:
        orders = kite_api.list_orders(str(access_token), api_key=str(api_key))
        checks["orderbook"] = {"ok": True, "count": len(orders)}
    except KiteApiError as exc:
        checks["orderbook"] = {"ok": False, "count": 0, "error": exc.error_type}

    completed_order_id = next((str(o.get("order_id")) for o in orders if o.get("status") == "COMPLETE" and o.get("order_id")), None)
    if completed_order_id:
        try:
            trades = kite_api.get_order_trades(str(access_token), completed_order_id, api_key=str(api_key))
            checks["tradebook"] = {"ok": True, "count": len(trades)}
        except KiteApiError as exc:
            checks["tradebook"] = {"ok": False, "count": 0, "error": exc.error_type}
    else:
        checks["tradebook"] = {"ok": True, "count": 0, "note": "No completed order available for tradebook probe."}

    passed = all(bool(check.get("ok")) for check in checks.values())
    checked_at = datetime.now(timezone.utc).isoformat()
    _upsert_broker_connection(
        get_admin_client(),
        user_id=user_id,
        broker="zerodha",
        token_expires_at=creds.get("expires_at"),
        last_synced_at=checked_at,
        connection_status="connected_read_only",
        metadata=_smoke_metadata(
            broker="zerodha",
            passed=passed,
            checked_at=checked_at,
            checks=checks,
        ),
    )
    return {
        "broker": "zerodha",
        "connected_read_only": passed,
        "token_expired": False,
        "checks": checks,
    }


@router.post("/broker/zerodha/import")
async def import_zerodha_trades(user_id: str = Depends(get_current_user_id)):
    """
    Import today's filled orders from Zerodha into the trade journal.
    Skips orders already recorded using a deterministic broker import marker.
    Requires a valid daily access token set via /broker/zerodha/callback.
    """
    _require_broker_plan(user_id)
    sb = get_admin_client()
    creds = _get_user_broker_credentials(user_id, "zerodha")
    if not creds.get("api_key") or not creds.get("access_token"):
        raise HTTPException(status_code=400, detail="Zerodha not connected. Complete the OAuth login first.")
    if _token_is_expired(creds.get("expires_at")):
        raise HTTPException(status_code=401, detail="Zerodha token expired. Reconnect Kite before importing trades.")

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
        marker = _broker_import_marker("zerodha", order_id)

        if not sym or not qty or not avg_px or not order_id:
            continue

        existing = _import_already_recorded(sb, user_id, marker)
        if existing:
            skipped += 1
            continue

        executed_at = str(order.get("exchange_timestamp") or order.get("order_timestamp") or date.today())
        entry_date = executed_at[:10] if len(executed_at) >= 10 else str(date.today())
        exit_reason = f"Zerodha import — order #{order_id} [{marker}] [Zerodha · auto]"

        if txn == "SELL":
            if _fifo_close_open_long(sb, user_id, sym, avg_px, exit_reason):
                imported += 1
            continue

        stock = sb.table("stock_universe").select("company_name") \
            .eq("symbol", sym).maybe_single().execute()
        company_name = stock.data["company_name"] if stock.data else sym
        workflow = _workflow_context_for_import(sb, user_id, sym)

        entry = {
            "user_id":      user_id,
            "symbol":       sym,
            "company_name": company_name,
            "trade_type":   "long",
            "entry_date":   entry_date,
            "entry_price":  avg_px,
            "quantity":     qty,
            "entry_reason": f"Zerodha import — order #{order_id} [{marker}] [Zerodha · auto]",
            "status":       "open",
            **_journal_enrichment_from_workflow(workflow),
        }
        inserted = sb.table("trade_journal").insert(entry).execute()
        journal_entry = (inserted.data or [{}])[0]
        if journal_entry.get("id"):
            sync_workflow_state(sb, user_id, sym, {
                "source": "broker-import",
                "lifecycle": "open",
                "entry": avg_px,
                "position_size": qty,
                "broker_order_id": order_id,
                "journal_id": journal_entry["id"],
                "notes": "Auto-created from Zerodha filled-order import.",
            })
        imported += 1

    synced_at = datetime.now(timezone.utc).isoformat()
    _upsert_broker_connection(
        sb,
        user_id=user_id,
        broker="zerodha",
        token_expires_at=creds.get("expires_at"),
        last_synced_at=synced_at,
        connection_status="connected_read_only",
    )

    return {
        "imported": imported,
        "skipped":  skipped,
        "total_filled_orders": len(filled),
        "last_synced_at": synced_at,
        "message": f"Imported {imported} new trade(s) from Zerodha.",
    }


@router.post("/broker/{broker_name}/import")
async def import_broker_trades(
    broker_name: Literal["zerodha", "upstox"],
    user_id: str = Depends(get_current_user_id),
):
    """Import filled broker orders into Journal. Zerodha keeps its legacy route for compatibility."""
    if broker_name == "zerodha":
        return await import_zerodha_trades(user_id=user_id)

    _require_broker_plan(user_id)
    sb = get_admin_client()
    creds_raw = _get_user_broker_credentials(user_id, broker_name)
    if not creds_raw.get("access_token"):
        raise HTTPException(status_code=400, detail=f"{broker_name.capitalize()} not connected. Complete OAuth first.")
    if _token_is_expired(creds_raw.get("expires_at")):
        raise HTTPException(status_code=401, detail=f"{broker_name.capitalize()} token expired. Reconnect before importing trades.")

    try:
        adapter = get_adapter(broker_name)
        expires_raw = creds_raw.get("expires_at") or datetime.now(timezone.utc).isoformat()
        creds = BrokerCredentials(
            broker_id=broker_name,
            access_token=str(creds_raw["access_token"]),
            expires_at=datetime.fromisoformat(str(expires_raw).replace("Z", "+00:00")),
        )
        orders = await adapter.list_orders(creds)
    except BrokerError as exc:
        raise HTTPException(status_code=400, detail=f"{broker_name.capitalize()} import failed: {exc}") from exc
    except Exception:
        logger.exception("%s import failed for user %s", broker_name, user_id)
        raise HTTPException(status_code=400, detail=f"Could not connect to {broker_name.capitalize()}.")

    filled = [o for o in orders if o.status == "COMPLETE" and o.filled_quantity > 0]
    imported = 0
    skipped = 0
    for order in filled:
        marker = _broker_import_marker(broker_name, str(order.broker_order_id))
        existing = _import_already_recorded(sb, user_id, marker)
        if existing:
            skipped += 1
            continue

        entry_price = order.average_price or order.limit_price or 0
        if not entry_price:
            continue

        exit_reason = f"{broker_name.capitalize()} import — order #{order.broker_order_id} [{marker}] [{broker_name.capitalize()} · auto]"
        if order.side == "SELL":
            if _fifo_close_open_long(sb, user_id, order.symbol, entry_price, exit_reason):
                imported += 1
            continue

        stock = sb.table("stock_universe").select("company_name") \
            .eq("symbol", order.symbol).maybe_single().execute()
        company_name = stock.data["company_name"] if stock.data else order.symbol
        workflow = _workflow_context_for_import(sb, user_id, order.symbol)
        entry = {
            "user_id": user_id,
            "symbol": order.symbol,
            "company_name": company_name,
            "trade_type": "long",
            "entry_date": order.updated_at.date().isoformat(),
            "entry_price": entry_price,
            "quantity": order.filled_quantity,
            "entry_reason": f"{broker_name.capitalize()} import — order #{order.broker_order_id} [{marker}] [{broker_name.capitalize()} · auto]",
            "status": "open",
            **_journal_enrichment_from_workflow(workflow),
        }
        inserted = sb.table("trade_journal").insert(entry).execute()
        journal_entry = (inserted.data or [{}])[0]
        if journal_entry.get("id"):
            sync_workflow_state(sb, user_id, order.symbol, {
                "source": "broker-import",
                "lifecycle": "open",
                "entry": entry_price,
                "position_size": order.filled_quantity,
                "broker_order_id": str(order.broker_order_id),
                "journal_id": journal_entry["id"],
                "notes": f"Auto-created from {broker_name.capitalize()} filled-order import.",
            })
        imported += 1

    synced_at = datetime.now(timezone.utc).isoformat()
    _upsert_broker_connection(
        sb,
        user_id=user_id,
        broker=broker_name,
        token_expires_at=creds_raw.get("expires_at"),
        last_synced_at=synced_at,
        connection_status="connected_read_only",
    )
    return {
        "imported": imported,
        "skipped": skipped,
        "total_filled_orders": len(filled),
        "last_synced_at": synced_at,
        "message": f"Imported {imported} new trade(s) from {broker_name.capitalize()}.",
    }


@router.get("/broker/zerodha/callback")
async def zerodha_callback(
    request_token: str = Query(...),
    state: str = Query(...),
    user_id: str = Depends(get_current_user_id),
):
    """
    Exchange Zerodha request_token for a session access_token.
    Called after user authorises the Kite login.
    """
    _require_broker_plan(user_id)
    _require_valid_broker_state(state, user_id=user_id, broker="zerodha")
    sb = get_admin_client()
    creds = _get_user_broker_credentials(user_id, "zerodha")
    if not creds.get("api_key"):
        raise HTTPException(status_code=503, detail="Zerodha connect is temporarily unavailable. AlphaVyuh broker app credentials are not configured.")

    api_key    = str(creds["api_key"])
    api_secret = str(creds.get("api_secret") or "")
    if not api_secret:
        raise HTTPException(status_code=503, detail="Zerodha connect is temporarily unavailable. AlphaVyuh broker app secret is not configured.")

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
        raise HTTPException(status_code=400, detail="Zerodha session failed. Start broker connect again.")
    except Exception:
        logger.exception("Zerodha session generation failed for user %s", user_id)
        raise HTTPException(status_code=400, detail="Zerodha session failed. Start broker connect again.")

    import datetime
    now_iso = datetime.datetime.now(datetime.UTC).isoformat()

    expiry = _zerodha_token_expiry()
    upsert_broker_credential(user_id, "zerodha", "access_token", access_token)
    upsert_broker_credential(user_id, "zerodha", "expires_at", expiry)
    broker_user_id = str(session_data.get("user_id") or "")
    broker_user_name = str(session_data.get("user_name") or session_data.get("user_shortname") or "")

    sb.table("users").update({
        "broker_type":            "zerodha",
        "broker_access_token":    None,
        "broker_token_expires_at": expiry,
        "broker_connected_at":    now_iso,
    }).eq("id", user_id).execute()
    _upsert_broker_connection(
        sb,
        user_id=user_id,
        broker="zerodha",
        broker_user_id=broker_user_id,
        broker_user_name=broker_user_name,
        token_expires_at=expiry,
        connection_status="connected_read_only",
    )

    return {"status": "connected", "message": "Zerodha connected successfully"}


@router.post("/broker/{broker_name}/callback")
async def broker_oauth_callback(
    broker_name: Literal["zerodha", "upstox"],
    body: BrokerCallbackRequest,
    user_id: str = Depends(get_current_user_id),
):
    """
    JSON callback endpoint for frontend-hosted OAuth returns.
    Stores tokens through the encrypted broker credential path.
    """
    _require_broker_plan(user_id)
    _require_valid_broker_state(body.state, user_id=user_id, broker=broker_name)
    sb = get_admin_client()
    adapter = get_adapter(broker_name)
    try:
        creds = await adapter.exchange_code(body.code_or_token)
        profile = await adapter.get_profile(creds)
    except BrokerError as exc:
        logger.warning("Broker %s OAuth callback failed for user %s: %s", broker_name, user_id, exc)
        raise HTTPException(status_code=400, detail="Broker connection failed. Reconnect from Settings.")

    upsert_broker_credential(user_id, broker_name, "access_token", creds.access_token)
    upsert_broker_credential(user_id, broker_name, "expires_at", creds.expires_at.isoformat())
    if creds.refresh_token:
        upsert_broker_credential(user_id, broker_name, "refresh_token", creds.refresh_token)

    now_iso = datetime.now(timezone.utc).isoformat()
    sb.table("users").update({
        "broker_type": broker_name,
        "broker_access_token": None,
        "broker_token_expires_at": creds.expires_at.isoformat(),
        "broker_connected_at": now_iso,
    }).eq("id", user_id).execute()
    _upsert_broker_connection(
        sb,
        user_id=user_id,
        broker=broker_name,
        broker_user_id=profile.user_id,
        broker_user_name=profile.display_name,
        token_expires_at=creds.expires_at.isoformat(),
        connection_status="connected_read_only",
    )
    return {
        "status": "connected",
        "broker": broker_name,
        "broker_user_name": profile.display_name,
        "token_expires_at": creds.expires_at.isoformat(),
    }


# ── Trade analysis helper ─────────────────────────────────────────────────────

def _trigger_ai_analysis(sb, entry: dict) -> None:
    try:
        if str(entry.get("lessons") or "").strip():
            return
        from app.routers.ai import generate_trade_lesson

        analysis = generate_trade_lesson(entry)
        sb.table("trade_journal").update({"lessons": analysis}).eq("id", entry["id"]).execute()
    except Exception:
        logger.exception("Trade lesson generation failed for journal entry %s", entry.get("id"))
