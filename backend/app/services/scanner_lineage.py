"""Persistence helpers for user-owned EOD scanner runs and candidates."""

from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4


# Keep snapshots small enough for a predictable PostgREST request while
# retaining the fields a trader needs to understand and reopen a match.
_SNAPSHOT_KEYS = {
    "symbol",
    "company_name",
    "series",
    "sector",
    "market",
    "currency",
    "close",
    "prev_close",
    "pct_change",
    "volume",
    "avg_volume_20d",
    "avg_volume_50d",
    "volume_ratio",
    "turnover",
    "turnover_cr",
    "rsi_14",
    "ema_20",
    "ema_50",
    "ema_150",
    "ema_200",
    "ema_200_slope_30d",
    "sma_50",
    "sma_150",
    "sma_200",
    "week_52_high",
    "week_52_low",
    "week_52_high_pct",
    "week_52_low_pct",
    "price_perf_6m_pct",
    "high_3w",
    "low_3w",
    "darvas_box_height_pct",
    "atr_14",
    "atr_pct",
    "rs_score",
    "is_new_52w_high",
    "is_new_52w_low",
    "is_inside_bar",
    "is_nr7",
    "setup_score",
    "setup_grade",
    "confidence_label",
}


def _json_safe(value: Any) -> Any:
    """Convert database/Python values into JSON-safe evidence snapshots."""
    if isinstance(value, dict):
        return {str(key): _json_safe(entry) for key, entry in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(entry) for entry in value]
    if isinstance(value, float) and not math.isfinite(value):
        return None
    return value


def compact_candidate_snapshot(result: dict[str, Any]) -> dict[str, Any]:
    return _json_safe({key: result.get(key) for key in _SNAPSHOT_KEYS if key in result})


def _candidate_payload(
    result: dict[str, Any],
    *,
    user_id: str,
    run_id: str,
    rank: int,
    candidate_id: str,
) -> dict[str, Any]:
    return {
        "id": candidate_id,
        "user_id": user_id,
        "scanner_run_id": run_id,
        "symbol": str(result.get("symbol") or "").strip().upper(),
        "rank": rank,
        "status": "new",
        "matched_conditions": _json_safe({
            "match_reasons": result.get("match_reasons") or [],
            "confidence_reasons": result.get("confidence_reasons") or [],
            "data_warnings": result.get("data_warnings") or [],
        }),
        "result_snapshot": compact_candidate_snapshot(result),
    }


def record_scanner_run(
    client: Any,
    *,
    user_id: str,
    body: Any,
    response: dict[str, Any],
    candidates: list[dict[str, Any]],
) -> dict[str, Any]:
    """Write one completed run and its ranked candidates.

    The caller owns the fallback behavior when the migration is not yet
    applied. This helper deliberately raises on a write failure so callers do
    not mistake an unrecorded run for durable evidence.
    """
    now = datetime.now(timezone.utc).isoformat()
    run_id = str(uuid4())
    run_row = {
        "id": run_id,
        "user_id": user_id,
        "scanner_definition_id": str(body.scanner_definition_id) if body.scanner_definition_id else None,
        "preset_id": body.preset_id,
        "input_definition": _json_safe({
            "filters": body.filters.model_dump(mode="json"),
            "sort_by": body.sort_by,
            "sort_order": body.sort_order,
            "page": body.page,
            "page_size": body.page_size,
        }),
        "trade_date": response.get("trade_date"),
        "status": "completed",
        "total_matches": max(0, int(response.get("total_matches") or 0)),
        "result_count": sum(
            1 for result in candidates if str(result.get("symbol") or "").strip()
        ),
        "source_metadata": _json_safe(response.get("source_metadata") or {}),
        "started_at": now,
        "completed_at": now,
    }
    inserted_run = client.table("scanner_runs").insert(run_row).execute()
    if not inserted_run.data:
        raise RuntimeError("Scanner run was not recorded")

    candidate_rows: list[dict[str, Any]] = []
    candidate_ids_by_symbol: dict[str, str] = {}
    for rank, result in enumerate(candidates, start=1):
        symbol = str(result.get("symbol") or "").strip().upper()
        if not symbol:
            continue
        candidate_id = str(uuid4())
        candidate_ids_by_symbol[symbol] = candidate_id
        candidate_rows.append(_candidate_payload(
            result,
            user_id=user_id,
            run_id=run_id,
            rank=rank,
            candidate_id=candidate_id,
        ))

    # Avoid oversized single REST requests on the Pro result limit.
    try:
        for start in range(0, len(candidate_rows), 250):
            client.table("scanner_candidates").insert(candidate_rows[start:start + 250]).execute()
    except Exception as exc:
        # Keep the run visible but truthful if a candidate batch fails after
        # the run row has been created.
        try:
            client.table("scanner_runs").update({
                "status": "partial",
                "error_message": str(exc)[:500],
                "completed_at": now,
            }).eq("id", run_id).eq("user_id", user_id).execute()
        except Exception:
            pass
        raise

    return {
        "scan_run_id": run_id,
        "candidate_ids_by_symbol": candidate_ids_by_symbol,
    }


def add_lineage_ids(
    response: dict[str, Any],
    *,
    scan_run_id: str,
    candidate_ids_by_symbol: dict[str, str],
) -> dict[str, Any]:
    """Attach user-specific lineage ids to a response copy.

    Scanner result caching is shared by user because market data is shared.
    This function must run after cache lookup and before returning to the
    authenticated caller; ids are never written into the shared cache.
    """
    result = dict(response)
    result["scan_run_id"] = scan_run_id
    result["results"] = [
        {
            **row,
            "scan_run_id": scan_run_id,
            "candidate_id": candidate_ids_by_symbol.get(str(row.get("symbol") or "").upper()),
        }
        for row in (response.get("results") or [])
    ]
    result["lineage"] = {
        "status": "recorded",
        "scan_run_id": scan_run_id,
    }
    return result
