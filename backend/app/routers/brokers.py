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
import secrets

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import RedirectResponse

from app.brokers.adapter import BrokerCredentials, BrokerError, BrokerId
from app.brokers.credentials import (
    delete_broker_credentials,
    get_broker_credential,
    upsert_broker_credential,
)
from app.brokers.factory import get_adapter
from app.middleware.auth import get_current_user_id

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


# ─── Routes ───────────────────────────────────────────────────────────────────


@router.post("/{broker}/connect/start")
async def connect_start(
    broker: str,
    user_id: str = Depends(get_current_user_id),
):
    """Return the OAuth redirect URL for the user to open in their browser."""
    broker_id = _validate_broker(broker)
    adapter = get_adapter(broker_id)
    state = secrets.token_urlsafe(16)
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
):
    """Exchange the OAuth request_token, store encrypted credentials, redirect to UI."""
    broker_id = _validate_broker(broker)
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

    redirect_to = f"{_FRONTEND_URL}/settings/broker?connected={broker_id}"
    return RedirectResponse(url=redirect_to, status_code=302)


@router.get("/{broker}/profile")
async def get_broker_profile(
    broker: str,
    user_id: str = Depends(get_current_user_id),
):
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
):
    broker_id = _validate_broker(broker)
    creds = _load_creds(user_id, broker_id)
    adapter = get_adapter(broker_id)

    try:
        holdings = await adapter.get_holdings(creds)
    except BrokerError as exc:
        _raise_for_broker_error(exc)

    return [h.model_dump() for h in holdings]


@router.delete("/{broker}/disconnect")
async def disconnect_broker(
    broker: str,
    user_id: str = Depends(get_current_user_id),
):
    broker_id = _validate_broker(broker)
    delete_broker_credentials(user_id, broker_id)
    return {"disconnected": broker_id}


# ─── Error helper ─────────────────────────────────────────────────────────────


def _raise_for_broker_error(exc: BrokerError) -> None:
    if exc.kind == "AUTH_EXPIRED":
        raise HTTPException(status_code=401, detail="Broker session expired — reconnect required.")
    if exc.kind == "RATE_LIMITED":
        raise HTTPException(status_code=429, detail="Broker rate limit — try again shortly.")
    raise HTTPException(status_code=502, detail=f"Broker error: {exc}")
