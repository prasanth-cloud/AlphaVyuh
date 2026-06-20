"""
Background Kite token renewal at 06:30 IST.

Kite access tokens expire daily (~06:00 IST). This job runs at 06:30 and for
each active Zerodha connection:

1. Retrieves the stored request_token (cached from the user's last OAuth login)
2. Attempts Kite login flow: exchange_code(request_token) → new access_token
3. Stores the new access_token encrypted in broker_credentials
4. Updates broker_connections with the new expiry

If the request_token is missing or exchange fails (token already used / expired),
falls back to validating the existing access_token via get_profile(). On failure,
marks the connection as needs_reconnect and logs an error for Sentry capture.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from app.brokers.credentials import get_broker_credential, upsert_broker_credential
from app.services.supabase import get_admin_client

logger = logging.getLogger(__name__)


async def refresh_kite_tokens() -> dict:
    """Attempt Kite login flow for all active Zerodha connections."""
    sb = get_admin_client()
    result = sb.table("broker_connections").select(
        "user_id,broker,token_expires_at,is_active"
    ).eq("broker", "zerodha").eq("is_active", True).execute()

    connections = result.data or []
    checked = 0
    renewed = 0
    valid = 0
    expired = 0

    for conn in connections:
        user_id = conn["user_id"]
        checked += 1

        # Step 1: Attempt token renewal via stored request_token
        if _attempt_token_renewal(sb, user_id):
            renewed += 1
            continue

        # Step 2: Fallback — validate existing access_token
        try:
            access_token = get_broker_credential(user_id, "zerodha", "access_token")
            if not access_token:
                raise ValueError("No access token")
        except Exception:
            logger.error("Kite token missing for user %s — no request_token available for renewal", user_id)
            _mark_needs_reconnect(sb, user_id)
            expired += 1
            continue

        try:
            from app.brokers.kite.api import get_profile
            get_profile(access_token)
            valid += 1
        except Exception as exc:
            logger.error(
                "Kite token invalid for user %s and renewal failed: %s",
                user_id,
                exc,
                exc_info=True,
            )
            _mark_needs_reconnect(sb, user_id)
            expired += 1

    summary = {"checked": checked, "renewed": renewed, "valid": valid, "expired": expired}
    if expired > 0:
        logger.error(
            "Kite token refresh: %d/%d tokens expired/invalid, %d renewed, %d still valid",
            expired, checked, renewed, valid,
        )
    else:
        logger.info("Kite token refresh: %d renewed, %d valid out of %d", renewed, valid, checked)

    return summary


def _attempt_token_renewal(sb, user_id: str) -> bool:
    """Try to exchange a stored request_token for a fresh access_token.

    Returns True if renewal succeeded and new credentials were stored.
    """
    try:
        request_token = get_broker_credential(user_id, "zerodha", "request_token")
        if not request_token:
            return False
    except Exception:
        return False

    try:
        from app.brokers.kite.api import exchange_code, get_profile

        session_data = exchange_code(request_token)
        new_access_token = session_data["access_token"]

        get_profile(new_access_token)

        upsert_broker_credential(user_id, "zerodha", "access_token", new_access_token)

        expires_at = datetime.now(timezone.utc).replace(
            hour=0, minute=30, second=0, microsecond=0
        )
        from datetime import timedelta
        expires_at += timedelta(days=1)
        upsert_broker_credential(user_id, "zerodha", "expires_at", expires_at.isoformat())

        try:
            sb.table("broker_connections").update({
                "token_expires_at": expires_at.isoformat(),
                "connection_status": "connected_read_only",
                "last_synced_at": datetime.now(timezone.utc).isoformat(),
            }).eq("user_id", user_id).eq("broker", "zerodha").execute()
        except Exception:
            logger.debug("Could not update broker_connections after renewal for %s", user_id)

        try:
            sb.table("users").update({
                "broker_token_expires_at": expires_at.isoformat(),
            }).eq("id", user_id).execute()
        except Exception:
            pass

        logger.info("Kite token renewed for user %s", user_id)
        return True

    except Exception as exc:
        logger.warning(
            "Kite token renewal via request_token failed for user %s: %s",
            user_id,
            exc,
        )
        return False


def _mark_needs_reconnect(sb, user_id: str) -> None:
    try:
        sb.table("broker_connections").update(
            {"connection_status": "needs_reconnect"}
        ).eq("user_id", user_id).eq("broker", "zerodha").execute()
    except Exception:
        logger.debug("Could not update connection status for user %s", user_id, exc_info=True)
