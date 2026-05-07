from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)


def sync_workflow_state(sb: Any, user_id: str, symbol: str, payload: dict[str, Any]) -> None:
    """Best-effort workflow sync for broker and journal events."""
    row = {
        "user_id": user_id,
        "symbol": symbol.upper(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        **{key: value for key, value in payload.items() if value is not None},
    }
    try:
        sb.table("workflow_states").upsert(row, on_conflict="user_id,symbol").execute()
    except Exception:
        logger.exception("Failed to sync workflow state for %s", symbol)
