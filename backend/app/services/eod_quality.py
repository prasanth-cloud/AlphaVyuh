"""EOD ingestion quality checks and durable operational run evidence.

The EOD path is intentionally fail-closed: malformed rows are excluded from
market-data writes, and the counts explaining that decision are persisted
alongside the import attempt when the additive operational schema is present.
"""

from __future__ import annotations

import logging
import uuid
from datetime import date, datetime, timezone
from typing import Any

import pandas as pd

logger = logging.getLogger(__name__)

REQUIRED_BHAVCOPY_COLUMNS = ("symbol", "series", "open", "high", "low", "close", "volume")
PRICE_COLUMNS = ("open", "high", "low", "close")


def assess_bhavcopy_frame(
    frame: pd.DataFrame,
    *,
    valid_series: set[str],
) -> tuple[pd.DataFrame, dict[str, Any]]:
    """Normalize a parsed bhavcopy and return only safe rows plus quality counts.

    Counts are deliberately explicit and non-overlapping for the rows that are
    rejected after series filtering: missing required values are counted before
    OHLCV validation, invalid OHLCV rows require all required values, and
    duplicate rows count only the extra copies that would collide on the
    ``symbol, trade_date`` primary key.
    """

    working = frame.copy()
    source_rows = len(working)

    for column in ("symbol", "series"):
        if column in working:
            working[column] = working[column].astype("string").str.strip().str.upper()

    missing_columns = [column for column in REQUIRED_BHAVCOPY_COLUMNS if column not in working]
    if missing_columns:
        raise ValueError(f"Missing columns after normalisation: {missing_columns}")

    for column in PRICE_COLUMNS + ("volume",):
        working[column] = pd.to_numeric(working[column], errors="coerce")

    valid_series_mask = working["series"].isin(valid_series)
    filtered_series_rows = int((~valid_series_mask).sum())

    missing_mask = working[list(REQUIRED_BHAVCOPY_COLUMNS)].isna().any(axis=1)
    missing_mask |= working["symbol"].fillna("").eq("")
    missing_required_rows = int((valid_series_mask & missing_mask).sum())

    complete = working.loc[valid_series_mask & ~missing_mask].copy()
    if complete.empty:
        invalid_ohlcv_rows = 0
        duplicate_rows = 0
        clean = complete
    else:
        invalid_mask = (
            (complete[list(PRICE_COLUMNS)] <= 0).any(axis=1)
            | (complete["volume"] < 0)
            | (complete["high"] < complete[["open", "close"]].max(axis=1))
            | (complete["low"] > complete[["open", "close"]].min(axis=1))
            | (complete["high"] < complete["low"])
        )
        invalid_ohlcv_rows = int(invalid_mask.sum())
        valid = complete.loc[~invalid_mask].copy()
        duplicate_mask = valid.duplicated(subset=["symbol"], keep="first")
        duplicate_rows = int(duplicate_mask.sum())
        clean = valid.loc[~duplicate_mask].copy()

    rejected_rows = missing_required_rows + invalid_ohlcv_rows + duplicate_rows
    if source_rows == 0:
        quality_status = "empty"
    elif clean.empty:
        quality_status = "failed"
    elif rejected_rows or filtered_series_rows:
        quality_status = "partial"
    else:
        quality_status = "passed"

    reasons: list[str] = []
    if filtered_series_rows:
        reasons.append(f"filtered {filtered_series_rows} unsupported-series rows")
    if missing_required_rows:
        reasons.append(f"rejected {missing_required_rows} rows with missing required values")
    if invalid_ohlcv_rows:
        reasons.append(f"rejected {invalid_ohlcv_rows} rows with invalid OHLCV values")
    if duplicate_rows:
        reasons.append(f"removed {duplicate_rows} duplicate symbol rows")

    quality = {
        "quality_status": quality_status,
        "source_rows": source_rows,
        "accepted_rows": len(clean),
        "filtered_series_rows": filtered_series_rows,
        "missing_required_rows": missing_required_rows,
        "invalid_ohlcv_rows": invalid_ohlcv_rows,
        "duplicate_rows": duplicate_rows,
        "rejected_rows": rejected_rows + filtered_series_rows,
        "reasons": reasons,
    }
    return clean.reset_index(drop=True), quality


def _now() -> datetime:
    return datetime.now(timezone.utc)


def start_job_run(
    client,
    *,
    job_type: str,
    trade_date: date,
    input_payload: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    """Create a best-effort operational job row without blocking ingestion."""

    run_id = str(uuid.uuid4())
    started_at = _now()
    try:
        client.table("job_runs").insert(
            {
                "id": run_id,
                "job_type": job_type,
                "trade_date": str(trade_date),
                "status": "running",
                "started_at": started_at.isoformat(),
                "input_payload": input_payload or {},
            }
        ).execute()
        return {"id": run_id, "started_at": started_at}
    except Exception as exc:
        logger.warning("Unable to start %s job evidence: %s", job_type, exc)
        return None


def finish_job_run(
    client,
    handle: dict[str, Any] | None,
    *,
    status: str,
    result: dict[str, Any] | None = None,
    error: str | None = None,
) -> None:
    """Complete a job row when the additive job-run table is available."""

    if not handle:
        return

    completed_at = _now()
    started_at = handle.get("started_at")
    duration_ms = None
    if isinstance(started_at, datetime):
        duration_ms = max(0, int((completed_at - started_at).total_seconds() * 1000))

    payload = {
        "status": status,
        "completed_at": completed_at.isoformat(),
        "duration_ms": duration_ms,
        "result": result or {},
        "error": {"message": error[:1000]} if error else None,
    }
    try:
        client.table("job_runs").update(payload).eq("id", handle["id"]).execute()
    except Exception as exc:
        logger.warning("Unable to finish job evidence %s: %s", handle.get("id"), exc)


def quality_log_fields(quality: dict[str, Any]) -> dict[str, Any]:
    """Map the in-memory quality contract to additive ingestion-log columns."""

    return {
        "quality_status": quality.get("quality_status"),
        "source_rows": quality.get("source_rows"),
        "accepted_rows": quality.get("accepted_rows"),
        "filtered_series_rows": quality.get("filtered_series_rows"),
        "missing_required_rows": quality.get("missing_required_rows"),
        "invalid_ohlcv_rows": quality.get("invalid_ohlcv_rows"),
        "duplicate_rows": quality.get("duplicate_rows"),
        "quality_summary": quality,
    }
