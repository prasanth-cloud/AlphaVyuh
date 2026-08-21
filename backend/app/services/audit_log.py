"""Secret-free, bounded audit-event recording for safety-sensitive actions."""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)


class AuditLogUnavailable(RuntimeError):
    """Raised when a required audit event cannot be durably recorded."""


_SENSITIVE_KEY_PARTS = (
    "access_token",
    "api_key",
    "authorization",
    "cookie",
    "credential",
    "password",
    "raw_response",
    "refresh_token",
    "request_token",
    "secret",
    "token",
)
_MAX_TEXT_LENGTH = 240
_MAX_METADATA_KEYS = 32
_MAX_METADATA_LIST_ITEMS = 16


def _is_sensitive_key(key: str) -> bool:
    normalized = key.strip().lower().replace("-", "_")
    return any(part in normalized for part in _SENSITIVE_KEY_PARTS)


def _sanitize(value: Any, *, key: str | None = None) -> Any:
    if key and _is_sensitive_key(key):
        return "[REDACTED]"
    if isinstance(value, dict):
        return {
            str(item_key)[:80]: _sanitize(item_value, key=str(item_key))
            for item_key, item_value in list(value.items())[:_MAX_METADATA_KEYS]
        }
    if isinstance(value, (list, tuple)):
        return [_sanitize(item) for item in list(value)[:_MAX_METADATA_LIST_ITEMS]]
    if isinstance(value, (str, int, float, bool)) or value is None:
        if isinstance(value, str):
            return value[:_MAX_TEXT_LENGTH]
        return value
    return str(value)[:_MAX_TEXT_LENGTH]


def sanitize_audit_metadata(metadata: Any) -> dict[str, Any]:
    """Return bounded metadata that is safe to persist or expose to a user."""
    sanitized = _sanitize(metadata or {})
    return sanitized if isinstance(sanitized, dict) else {}


def record_audit_event(
    sb: Any,
    *,
    user_id: str,
    event_type: str,
    outcome: str,
    actor_type: str = "user",
    broker: str | None = None,
    broker_order_id: str | None = None,
    idempotency_key: str | None = None,
    setup_id: str | None = None,
    journal_id: str | None = None,
    metadata: dict[str, Any] | None = None,
    required: bool = False,
) -> dict[str, Any] | None:
    """Insert one redacted event; required writes fail closed for live actions."""
    payload = {
        "user_id": user_id,
        "event_type": event_type[:120],
        "outcome": outcome[:32],
        "actor_type": actor_type[:32],
        "broker": broker[:32] if broker else None,
        "broker_order_id": broker_order_id[:128] if broker_order_id else None,
        "idempotency_key": idempotency_key[:128] if idempotency_key else None,
        "setup_id": setup_id,
        "journal_id": journal_id,
        "metadata": sanitize_audit_metadata(metadata),
    }
    try:
        result = sb.table("audit_logs").insert(payload).execute()
        rows = result.data or []
        if not rows:
            raise RuntimeError("audit event insert returned no row")
        return rows[0] if isinstance(rows, list) else rows
    except Exception as exc:
        logger.warning(
            "Audit event write failed event_type=%s outcome=%s user_id=%s",
            payload["event_type"],
            payload["outcome"],
            user_id,
            exc_info=True,
        )
        if required:
            raise AuditLogUnavailable("Required audit event could not be recorded") from exc
        return None
