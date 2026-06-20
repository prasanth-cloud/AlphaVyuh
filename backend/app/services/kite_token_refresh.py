"""
Background Kite token renewal at 06:30 IST.

Kite access tokens expire daily. This job iterates all active Zerodha connections
and attempts to validate + refresh each token. On failure it logs an error for
Sentry capture and marks the connection as needing reconnect.

Note: Kite Connect does not support silent token refresh — a new request_token
requires user interaction via the OAuth login page. This job validates existing
tokens and marks stale ones so the UI can prompt the user to reconnect.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from app.services.supabase import get_admin_client
from app.brokers.credentials import get_broker_credential

logger = logging.getLogger(__name__)


async def refresh_kite_tokens() -> dict:
    """Check all active Zerodha connections and mark expired ones."""
    sb = get_admin_client()
    result = sb.table("broker_connections").select(
        "user_id,broker,token_expires_at,is_active"
    ).eq("broker", "zerodha").eq("is_active", True).execute()

    connections = result.data or []
    checked = 0
    valid = 0
    expired = 0

    for conn in connections:
        user_id = conn["user_id"]
        checked += 1

        try:
            access_token = get_broker_credential(user_id, "zerodha", "access_token")
            if not access_token:
                raise ValueError("No access token found")
        except Exception:
            logger.warning("Kite token missing for user %s", user_id)
            _mark_needs_reconnect(sb, user_id)
            expired += 1
            continue

        now = datetime.now(timezone.utc)
        expires_raw = conn.get("token_expires_at")
        if expires_raw:
            try:
                expires_at = datetime.fromisoformat(str(expires_raw).replace("Z", "+00:00"))
                if expires_at.tzinfo is None:
                    expires_at = expires_at.replace(tzinfo=timezone.utc)
                if expires_at <= now:
                    logger.warning("Kite token expired for user %s (expired %s)", user_id, expires_at)
                    _mark_needs_reconnect(sb, user_id)
                    expired += 1
                    continue
            except Exception:
                pass

        try:
            from app.brokers.kite.api import get_profile
            get_profile(access_token)
            valid += 1
        except Exception as exc:
            logger.error(
                "Kite token validation failed for user %s: %s",
                user_id,
                exc,
                exc_info=True,
            )
            _mark_needs_reconnect(sb, user_id)
            expired += 1

    summary = {"checked": checked, "valid": valid, "expired": expired}
    if expired > 0:
        logger.error(
            "Kite token refresh: %d/%d tokens expired or invalid — users need to reconnect",
            expired,
            checked,
        )
    else:
        logger.info("Kite token refresh: all %d tokens valid", checked)

    return summary


def _mark_needs_reconnect(sb, user_id: str) -> None:
    try:
        sb.table("broker_connections").update(
            {"connection_status": "needs_reconnect"}
        ).eq("user_id", user_id).eq("broker", "zerodha").execute()
    except Exception:
        logger.debug("Could not update connection status for user %s", user_id, exc_info=True)
