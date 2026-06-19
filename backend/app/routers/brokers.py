"""
Adapter-backed broker routes. All credential I/O goes through
backend/app/brokers/credentials.py — broker secrets never leave the backend.

Routes:
  POST   /api/brokers/{broker}/connect/start      → { auth_url }
  GET    /api/brokers/{broker}/connect/callback   → exchanges code, stores creds, redirects
  GET    /api/brokers/{broker}/profile            → BrokerProfile JSON
  GET    /api/brokers/{broker}/holdings           → Holding[] JSON
  DELETE /api/brokers/{broker}/disconnect         → clears credentials

See docs/broker-adapter.md for the frontend→backend flow.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import RedirectResponse

from app.brokers.adapter import BrokerCredentials, BrokerError, BrokerId
from app.brokers.credentials import (
    delete_broker_credentials,
    get_broker_credential,
    upsert_broker_credential,
)
from app.brokers.factory import get_adapter
from app.brokers.oauth_state import (
    BrokerOAuthStateError,
    create_broker_oauth_state,
    verify_broker_oauth_state,
)
from app.middleware.auth import get_current_user_id, get_current_user_token
from app.services.supabase import get_admin_client, get_user_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/brokers", tags=["brokers"])

_FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")
_VALID_BROKERS: set[str] = {"zerodha", "upstox"}


def _validate_broker(broker: str) -> BrokerId:
    if broker not in _VALID_BROKERS:
        raise HTTPException(status_code=404, detail=f"Unknown broker: {broker!r}")
    return broker  # type: ignore[return-value]


def _load_creds(user_id: str, broker: BrokerId) -> BrokerCredentials:
    try:
        token = get_broker_credential(user_id, broker, "access_token")
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Broker {broker!r} not connected — complete the OAuth flow first.",
        )
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Broker {broker!r} not connected — complete the OAuth flow first.",
        )
    from datetime import datetime, timezone

    expires_raw = get_broker_credential(user_id, broker, "expires_at")
    expires_at = datetime.fromisoformat(expires_raw) if expires_raw else datetime.now(timezone.utc)

    refresh_token = None
    try:
        refresh_token = get_broker_credential(user_id, broker, "refresh_token")
    except Exception:
        refresh_token = None

    return BrokerCredentials(
        broker_id=broker,
        access_token=token,
        expires_at=expires_at,
        refresh_token=refresh_token,
    )


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


def _require_broker_plan(user_id: str) -> None:
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


def _upsert_broker_connection(
    *,
    user_id: str,
    broker: BrokerId,
    broker_user_id: str | None,
    broker_user_name: str | None,
    token_expires_at: str | None,
    last_synced_at: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    try:
        payload = {
            "user_id": user_id,
            "broker": broker,
            "broker_user_id": broker_user_id,
            "broker_user_name": broker_user_name,
            "token_expires_at": token_expires_at,
            "is_active": True,
            "connection_status": "connected_read_only",
            "scopes": ["profile", "holdings", "positions", "orders", "trades"],
        }
        if last_synced_at:
            payload["last_synced_at"] = last_synced_at
        if metadata is not None:
            payload["metadata"] = metadata
        get_admin_client().table("broker_connections").upsert(payload, on_conflict="user_id,broker").execute()
    except Exception:
        logger.debug("Broker connection metadata unavailable; migration may not be applied yet.", exc_info=True)


def _mark_broker_disconnected(user_id: str, broker: BrokerId) -> None:
    try:
        get_admin_client().table("broker_connections").update(
            {"is_active": False, "connection_status": "disconnected"}
        ).eq("user_id", user_id).eq("broker", broker).execute()
    except Exception:
        logger.debug("Broker connection metadata unavailable during disconnect.", exc_info=True)


# ─── Routes ───────────────────────────────────────────────────────────────────


@router.post("/{broker}/connect/start")
async def connect_start(
    broker: str,
    user_id: str = Depends(get_current_user_id),
    token: str = Depends(get_current_user_token),
):
    """Return the OAuth redirect URL for the user to open in their browser."""
    _require_broker_plan(user_id)
    broker_id = _validate_broker(broker)
    adapter = get_adapter(broker_id)
    state = create_broker_oauth_state(user_id, broker_id)
    try:
        auth_url = adapter.get_auth_url(state)
    except KeyError as exc:
        missing = str(exc).strip("'")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"{broker_id} connect is not configured: missing {missing}",
        ) from exc
    return {"auth_url": auth_url, "state": state}


@router.get("/{broker}/connect/callback")
async def connect_callback(
    broker: str,
    request_token: str | None = Query(default=None),
    code: str | None = Query(default=None),
    state: str = Query(default=""),
    user_id: str = Depends(get_current_user_id),
    token: str = Depends(get_current_user_token),
):
    """Exchange the OAuth request_token, store encrypted credentials, redirect to UI."""
    _require_broker_plan(user_id)
    broker_id = _validate_broker(broker)
    try:
        verify_broker_oauth_state(state, user_id=user_id, broker=broker_id)
    except BrokerOAuthStateError as exc:
        raise HTTPException(
            status_code=400,
            detail="Broker authorization state expired or invalid. Start broker connect again.",
        ) from exc
    adapter = get_adapter(broker_id)
    auth_code = request_token or code
    if not auth_code:
        raise HTTPException(status_code=400, detail="Missing broker authorization code")

    try:
        creds = await adapter.exchange_code(auth_code)
    except BrokerError as exc:
        logger.warning("Broker %s code exchange failed: %s", broker_id, exc)
        raise HTTPException(status_code=400, detail=str(exc))

    upsert_broker_credential(user_id, broker_id, "access_token", creds.access_token)
    upsert_broker_credential(
        user_id, broker_id, "expires_at", creds.expires_at.isoformat()
    )
    if creds.refresh_token:
        upsert_broker_credential(user_id, broker_id, "refresh_token", creds.refresh_token)
    try:
        get_admin_client().table("users").update(
            {
                "broker_type": broker_id,
                "broker_access_token": None,
                "broker_token_expires_at": creds.expires_at.isoformat(),
                "broker_connected_at": datetime.now(timezone.utc).isoformat(),
            }
        ).eq("id", user_id).execute()
    except Exception:
        logger.debug("Unable to update legacy broker status columns.", exc_info=True)
    try:
        profile = await adapter.get_profile(creds)
        _upsert_broker_connection(
            user_id=user_id,
            broker=broker_id,
            broker_user_id=profile.user_id,
            broker_user_name=profile.display_name,
            token_expires_at=creds.expires_at.isoformat(),
        )
    except Exception:
        logger.debug("Connected %s but could not fetch profile metadata.", broker_id, exc_info=True)

    redirect_to = f"{_FRONTEND_URL}/settings/broker?connected={broker_id}"
    return RedirectResponse(url=redirect_to, status_code=302)


@router.get("/{broker}/profile")
async def get_broker_profile(
    broker: str,
    user_id: str = Depends(get_current_user_id),
    token: str = Depends(get_current_user_token),
):
    _require_broker_plan(user_id)
    broker_id = _validate_broker(broker)
    creds = _load_creds(user_id, broker_id)
    adapter = get_adapter(broker_id)

    try:
        profile = await adapter.get_profile(creds)
    except BrokerError as exc:
        _raise_for_broker_error(exc)

    return profile.model_dump()


@router.get("/{broker}/holdings")
async def get_broker_holdings(
    broker: str,
    user_id: str = Depends(get_current_user_id),
    token: str = Depends(get_current_user_token),
):
    _require_broker_plan(user_id)
    broker_id = _validate_broker(broker)
    creds = _load_creds(user_id, broker_id)
    adapter = get_adapter(broker_id)

    try:
        holdings = await adapter.get_holdings(creds)
    except BrokerError as exc:
        _raise_for_broker_error(exc)

    return [h.model_dump() for h in holdings]


def _smoke_metadata(*, broker: BrokerId, passed: bool, checked_at: str, checks: dict[str, dict[str, Any]]) -> dict[str, Any]:
    return {
        "read_only_smoke": {
            "broker": broker,
            "passed": passed,
            "checked_at": checked_at,
            "checks": checks,
        }
    }


def _smoke_error(exc: Exception) -> str:
    if isinstance(exc, BrokerError):
        return exc.kind
    if isinstance(exc, HTTPException):
        return str(exc.detail)
    return exc.__class__.__name__


@router.get("/{broker}/read-only-smoke")
async def broker_read_only_smoke(
    broker: str,
    user_id: str = Depends(get_current_user_id),
    token: str = Depends(get_current_user_token),
):
    """
    Run adapter-backed read-only account checks and return sanitized counts only.
    This endpoint never places, modifies, or cancels broker orders.
    """
    _require_broker_plan(user_id)
    broker_id = _validate_broker(broker)
    adapter = get_adapter(broker_id)
    checks: dict[str, dict[str, Any]] = {
        "login_url": {"ok": False},
        "profile": {"ok": False},
        "positions": {"ok": False, "count": 0},
        "holdings": {"ok": False, "count": 0},
        "orderbook": {"ok": False, "count": 0},
        "tradebook": {"ok": False, "count": 0},
    }

    try:
        adapter.get_auth_url(create_broker_oauth_state(user_id, broker_id))
        checks["login_url"] = {"ok": True}
    except Exception as exc:
        checks["login_url"] = {"ok": False, "error": _smoke_error(exc)}

    try:
        creds = _load_creds(user_id, broker_id)
    except HTTPException as exc:
        checked_at = datetime.now(timezone.utc).isoformat()
        _upsert_broker_connection(
            user_id=user_id,
            broker=broker_id,
            broker_user_id=None,
            broker_user_name=None,
            token_expires_at=None,
            last_synced_at=checked_at,
            metadata=_smoke_metadata(broker=broker_id, passed=False, checked_at=checked_at, checks=checks),
        )
        return {
            "broker": broker_id,
            "connected_read_only": False,
            "token_expired": exc.status_code == status.HTTP_401_UNAUTHORIZED,
            "checks": checks,
        }

    broker_user_id: str | None = None
    broker_user_name: str | None = None
    try:
        profile = await adapter.get_profile(creds)
        broker_user_id = profile.user_id
        broker_user_name = profile.display_name
        checks["profile"] = {"ok": True, "user_id_present": bool(profile.user_id)}
    except BrokerError as exc:
        checks["profile"] = {"ok": False, "error": _smoke_error(exc)}

    try:
        positions = await adapter.get_positions(creds)
        checks["positions"] = {"ok": True, "count": len(positions)}
    except BrokerError as exc:
        checks["positions"] = {"ok": False, "count": 0, "error": _smoke_error(exc)}

    try:
        holdings = await adapter.get_holdings(creds)
        checks["holdings"] = {"ok": True, "count": len(holdings)}
    except BrokerError as exc:
        checks["holdings"] = {"ok": False, "count": 0, "error": _smoke_error(exc)}

    orders = []
    try:
        orders = await adapter.list_orders(creds)
        checks["orderbook"] = {"ok": True, "count": len(orders)}
    except BrokerError as exc:
        checks["orderbook"] = {"ok": False, "count": 0, "error": _smoke_error(exc)}

    completed = next((order for order in orders if order.status == "COMPLETE"), None)
    if completed is None:
        checks["tradebook"] = {"ok": True, "count": 0, "note": "No completed order available for tradebook probe."}
    else:
        try:
            order = await adapter.get_order(creds, completed.broker_order_id)
            checks["tradebook"] = {"ok": True, "count": len(order.fills)}
        except BrokerError as exc:
            checks["tradebook"] = {"ok": False, "count": 0, "error": _smoke_error(exc)}

    passed = all(bool(check.get("ok")) for check in checks.values())
    checked_at = datetime.now(timezone.utc).isoformat()
    _upsert_broker_connection(
        user_id=user_id,
        broker=broker_id,
        broker_user_id=broker_user_id,
        broker_user_name=broker_user_name,
        token_expires_at=creds.expires_at.isoformat(),
        last_synced_at=checked_at,
        metadata=_smoke_metadata(broker=broker_id, passed=passed, checked_at=checked_at, checks=checks),
    )
    return {
        "broker": broker_id,
        "connected_read_only": passed,
        "token_expired": False,
        "checks": checks,
    }


@router.delete("/{broker}/disconnect")
async def disconnect_broker(
    broker: str,
    user_id: str = Depends(get_current_user_id),
    token: str = Depends(get_current_user_token),
):
    _require_broker_plan(user_id)
    broker_id = _validate_broker(broker)
    delete_broker_credentials(user_id, broker_id)
    _mark_broker_disconnected(user_id, broker_id)
    return {"disconnected": broker_id}


# ─── Error helper ─────────────────────────────────────────────────────────────


def _raise_for_broker_error(exc: BrokerError) -> None:
    if exc.kind == "AUTH_EXPIRED":
        raise HTTPException(status_code=401, detail="Broker session expired — reconnect required.")
    if exc.kind == "RATE_LIMITED":
        raise HTTPException(status_code=429, detail="Broker rate limit — try again shortly.")
    raise HTTPException(status_code=502, detail=f"Broker error: {exc}")
