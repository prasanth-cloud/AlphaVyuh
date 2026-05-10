"""Signed OAuth state tokens for broker connect flows.

The state value binds a broker OAuth response to the currently authenticated
AlphaVyuh user without exposing the user's raw id in the redirect URL.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from app.services.supabase import settings


class BrokerOAuthStateError(ValueError):
    """Raised when a broker OAuth state token is missing, invalid, or expired."""


def _key() -> bytes:
    material = settings.supabase_jwt_secret or settings.supabase_service_role_key
    if not material:
        raise BrokerOAuthStateError("Broker OAuth state signing key is unavailable")
    return material.encode()


def _b64_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _b64_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode((value + padding).encode())


def _user_binding(user_id: str) -> str:
    return hmac.new(_key(), f"user:{user_id}".encode(), hashlib.sha256).hexdigest()


def _sign(payload_b64: str) -> str:
    return _b64_encode(hmac.new(_key(), payload_b64.encode(), hashlib.sha256).digest())


def create_broker_oauth_state(user_id: str, broker: str, ttl_minutes: int = 15) -> str:
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=ttl_minutes)
    payload = {
        "broker": broker,
        "user": _user_binding(user_id),
        "nonce": secrets.token_urlsafe(12),
        "exp": int(expires_at.timestamp()),
    }
    payload_b64 = _b64_encode(json.dumps(payload, separators=(",", ":")).encode())
    return f"{payload_b64}.{_sign(payload_b64)}"


def verify_broker_oauth_state(state: str | None, *, user_id: str, broker: str) -> dict[str, Any]:
    if not state:
        raise BrokerOAuthStateError("Missing broker OAuth state")

    try:
        payload_b64, signature = state.split(".", 1)
    except ValueError as exc:
        raise BrokerOAuthStateError("Malformed broker OAuth state") from exc

    expected = _sign(payload_b64)
    if not hmac.compare_digest(signature, expected):
        raise BrokerOAuthStateError("Invalid broker OAuth state signature")

    try:
        payload = json.loads(_b64_decode(payload_b64).decode())
    except Exception as exc:
        raise BrokerOAuthStateError("Invalid broker OAuth state payload") from exc

    if payload.get("broker") != broker:
        raise BrokerOAuthStateError("Broker OAuth state broker mismatch")
    if payload.get("user") != _user_binding(user_id):
        raise BrokerOAuthStateError("Broker OAuth state user mismatch")
    if int(payload.get("exp") or 0) < int(datetime.now(timezone.utc).timestamp()):
        raise BrokerOAuthStateError("Broker OAuth state expired")

    return payload
