"""
Admin-only routes. Protected by INGEST_SERVICE_KEY header (same key as ingest routes).

These endpoints are for operator use only — never exposed to frontend users.
"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Header, HTTPException, Query, status

from app.services.supabase import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin", tags=["admin"])


def _require_service_key(x_service_key: str | None) -> None:
    if not settings.ingest_service_key or x_service_key != settings.ingest_service_key:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid service key")


@router.post("/rotate-broker-keys")
async def rotate_broker_keys(
    dry_run: bool = Query(default=True),
    x_service_key: str | None = Header(default=None),
) -> dict[str, Any]:
    """Re-encrypt broker_credentials from key_version 1 → 2.

    Requires env vars: BROKER_CREDS_KEY (old), BROKER_CREDS_KEY_NEW (new).
    Default is dry_run=true (verify only, no writes).
    """
    _require_service_key(x_service_key)

    import os

    old_key_hex = os.environ.get("BROKER_CREDS_KEY")
    new_key_hex = os.environ.get("BROKER_CREDS_KEY_NEW")

    if not old_key_hex or not new_key_hex:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="BROKER_CREDS_KEY and BROKER_CREDS_KEY_NEW must both be set.",
        )

    if len(old_key_hex) != 64 or len(new_key_hex) != 64:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Keys must be 64-char hex strings (32 bytes).",
        )

    if old_key_hex == new_key_hex:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Old and new keys must differ.",
        )

    old_key = bytes.fromhex(old_key_hex)
    new_key = bytes.fromhex(new_key_hex)

    from app.services.supabase import get_admin_client
    from scripts.rotate_broker_key import rotate_row, verify_row

    sb = get_admin_client()

    count_res = (
        sb.table("broker_credentials")
        .select("id", count="exact")
        .eq("key_version", 1)
        .execute()
    )
    pending = count_res.count or 0

    if pending == 0:
        return {"status": "complete", "pending": 0, "rotated": 0, "skipped": 0, "failed": 0, "dry_run": dry_run}

    rotated = 0
    skipped = 0
    failed = 0
    last_id = ""

    while True:
        query = (
            sb.table("broker_credentials")
            .select("id,user_id,broker,key_name,key_value")
            .eq("key_version", 1)
            .order("id")
            .limit(100)
        )
        if last_id:
            query = query.gt("id", last_id)
        batch = query.execute().data or []
        if not batch:
            break

        for row in batch:
            row_id = row["id"]
            last_id = row_id

            try:
                result = rotate_row(row, old_key, new_key)
            except Exception as exc:
                logger.warning("Rotation failed for row %s: %s", row_id, exc)
                if "decrypt" in str(exc).lower() or "InvalidTag" in type(exc).__name__:
                    skipped += 1
                else:
                    failed += 1
                continue

            if dry_run:
                try:
                    verify_row({**row, "key_value": result["key_value"]}, new_key)
                    rotated += 1
                except Exception:
                    failed += 1
                continue

            try:
                sb.table("broker_credentials").update(
                    {"key_value": result["key_value"], "key_version": 2}
                ).eq("id", row_id).eq("key_version", 1).execute()
                rotated += 1
            except Exception as exc:
                logger.error("DB update failed for row %s: %s", row_id, exc)
                failed += 1

    remaining = (
        sb.table("broker_credentials")
        .select("id", count="exact")
        .eq("key_version", 1)
        .execute()
    ).count or 0

    summary = {
        "status": "complete" if remaining == 0 else "partial",
        "dry_run": dry_run,
        "initial_pending": pending,
        "rotated": rotated,
        "skipped": skipped,
        "failed": failed,
        "remaining_v1": remaining,
    }

    if failed > 0:
        logger.error("Broker key rotation had %d failures: %s", failed, summary)
    elif remaining > 0:
        logger.warning("Broker key rotation incomplete: %d rows remain at v1", remaining)
    else:
        logger.info("Broker key rotation %s: %s", "verified" if dry_run else "complete", summary)

    return summary
