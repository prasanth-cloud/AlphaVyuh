"""
Quarterly broker credential key rotation check.

Runs on the 1st of Jan/Apr/Jul/Oct at 02:00 IST. If BROKER_CREDS_KEY_NEW is set,
performs a dry-run rotation and logs results. On failure, logs at ERROR level for
Sentry capture.

The actual rotation (dry_run=False) should be triggered via the admin API or CLI
after reviewing the dry-run results. This cron is a safety net that alerts if
rotation is overdue or misconfigured.
"""
from __future__ import annotations

import logging
import os

logger = logging.getLogger(__name__)


async def quarterly_rotation_check() -> dict:
    """Check if broker key rotation is needed and run a dry-run if keys are staged."""
    old_key_hex = os.environ.get("BROKER_CREDS_KEY")
    new_key_hex = os.environ.get("BROKER_CREDS_KEY_NEW")

    if not old_key_hex:
        logger.error("BROKER_CREDS_KEY not set — broker credentials cannot be decrypted")
        return {"status": "error", "reason": "BROKER_CREDS_KEY missing"}

    if not new_key_hex:
        logger.info(
            "Quarterly broker key rotation check: BROKER_CREDS_KEY_NEW not set. "
            "No rotation staged. Set BROKER_CREDS_KEY_NEW to stage a rotation."
        )
        return {"status": "skipped", "reason": "no new key staged"}

    if old_key_hex == new_key_hex:
        logger.warning("BROKER_CREDS_KEY and BROKER_CREDS_KEY_NEW are identical — rotation is a no-op")
        return {"status": "skipped", "reason": "keys identical"}

    try:
        old_key = bytes.fromhex(old_key_hex)
        new_key = bytes.fromhex(new_key_hex)
    except ValueError as exc:
        logger.error("Broker key rotation: invalid hex key — %s", exc)
        return {"status": "error", "reason": f"invalid hex: {exc}"}

    try:
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
            logger.info("Quarterly rotation check: no v1 rows remaining — rotation already complete")
            return {"status": "complete", "pending": 0}

        verified = 0
        failed = 0
        rows = (
            sb.table("broker_credentials")
            .select("id,user_id,broker,key_name,key_value")
            .eq("key_version", 1)
            .order("id")
            .limit(500)
            .execute()
            .data or []
        )

        for row in rows:
            try:
                result = rotate_row(row, old_key, new_key)
                verify_row({**row, "key_value": result["key_value"]}, new_key)
                verified += 1
            except Exception:
                failed += 1

        summary = {
            "status": "dry_run_complete",
            "pending": pending,
            "verified": verified,
            "failed": failed,
        }

        if failed > 0:
            logger.error(
                "Quarterly broker key rotation DRY RUN: %d/%d rows failed verification. "
                "Investigate before running live rotation. Summary: %s",
                failed, pending, summary,
            )
        else:
            logger.info(
                "Quarterly broker key rotation DRY RUN passed: %d rows ready for rotation. "
                "Run POST /api/admin/rotate-broker-keys?dry_run=false to execute.",
                pending,
            )

        return summary

    except Exception as exc:
        logger.error("Quarterly broker key rotation check failed: %s", exc, exc_info=True)
        return {"status": "error", "reason": str(exc)}
