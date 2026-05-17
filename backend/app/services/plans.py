from __future__ import annotations

from datetime import datetime, timezone
from typing import Any


PAID_PLANS = {"pro", "elite"}


def effective_plan_from_record(row: dict[str, Any] | None) -> tuple[str, str | None, bool]:
    """Return the usable plan without mutating user rows.

    A paid plan with a past expiry is treated as free until an explicit
    maintenance/reconcile path writes the downgrade.
    """
    if not row:
        return "free", None, False

    plan = str(row.get("plan") or "free").lower()
    expires_at = row.get("plan_expires_at")
    if plan not in PAID_PLANS:
        return "free", expires_at, False
    if not expires_at:
        return plan, None, True

    try:
        expiry = datetime.fromisoformat(str(expires_at).replace("Z", "+00:00"))
        if expiry.tzinfo is None:
            expiry = expiry.replace(tzinfo=timezone.utc)
        if expiry > datetime.now(timezone.utc):
            return plan, str(expires_at), True
    except Exception:
        return "free", str(expires_at), False
    return "free", str(expires_at), False


def get_effective_user_plan(client, user_id: str) -> str:
    row = (
        client.table("users")
        .select("plan, plan_expires_at")
        .eq("id", user_id)
        .maybe_single()
        .execute()
    ).data or {}
    plan, _expires_at, _active = effective_plan_from_record(row)
    return plan
