from __future__ import annotations

from datetime import datetime, timezone
from typing import Any


EOD_SOURCE_NAME = "NSE bhavcopy"
EOD_LICENSE_NOTE = "NSE bhavcopy data from the latest completed market session; not a licensed realtime feed."
LIVE_LICENSE_NOTE = "Broker/provider data is account-scoped; verify freshness before trading."
FALLBACK_LICENSE_NOTE = "Fallback or cached market data; verify before acting."


def _safe_float(value: Any) -> float | None:
    try:
        if value is None:
            return None
        number = float(value)
    except (TypeError, ValueError):
        return None
    if number != number or number in (float("inf"), float("-inf")):
        return None
    return number


def eod_source_metadata(
    *,
    as_of: str | None,
    status: str = "healthy",
    coverage_pct: float | None = None,
    symbols_count: int | None = None,
    universe_active: int | None = None,
    cache_status: str | None = None,
) -> dict[str, Any]:
    mode = "eod"
    confidence = status
    if status in {"stale", "unknown"}:
        mode = "fallback"
        confidence = "stale"
    elif status == "degraded":
        mode = "fallback"

    return {
        "source_name": EOD_SOURCE_NAME,
        "mode": mode,
        "as_of": as_of,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "confidence": confidence,
        "coverage_pct": coverage_pct,
        "symbols_count": symbols_count,
        "universe_active": universe_active,
        "cache_status": cache_status,
        "license_notes": EOD_LICENSE_NOTE if mode == "eod" else FALLBACK_LICENSE_NOTE,
    }


def live_source_metadata(
    *,
    provider: str,
    as_of: str | None = None,
    confidence: str = "account_scoped",
) -> dict[str, Any]:
    return {
        "source_name": provider,
        "mode": "live",
        "as_of": as_of or datetime.now(timezone.utc).isoformat(),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "confidence": confidence,
        "coverage_pct": None,
        "symbols_count": None,
        "universe_active": None,
        "cache_status": None,
        "license_notes": LIVE_LICENSE_NOTE,
    }


def fallback_source_metadata(message: str, *, as_of: str | None = None) -> dict[str, Any]:
    return {
        "source_name": "AlphaVyuh fallback",
        "mode": "fallback",
        "as_of": as_of,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "confidence": "unavailable",
        "coverage_pct": None,
        "symbols_count": None,
        "universe_active": None,
        "cache_status": "fallback",
        "license_notes": FALLBACK_LICENSE_NOTE,
        "message": message,
    }


_BHAVCOPY_SUCCESS_STATUSES = {"success", "already_done", "partial"}


def normalize_bhavcopy_provenance(
    *,
    status: str | None,
    rows_ingested: int | None,
    error_message: str | None,
    warning_message: str | None = None,
) -> dict[str, Any]:
    """Avoid showing success alongside stale failure text from prior ingest attempts."""
    normalized_status = status
    normalized_error = error_message
    note = warning_message

    if status in _BHAVCOPY_SUCCESS_STATUSES and error_message:
        if rows_ingested and rows_ingested > 0:
            normalized_error = None
        elif "404" in error_message:
            normalized_status = "failed"
            note = note or "Latest bhavcopy attempt failed before rows were ingested."

    if status in _BHAVCOPY_SUCCESS_STATUSES and not rows_ingested and not normalized_error:
        normalized_status = "failed"
        normalized_error = "Bhavcopy reported success without ingested rows."

    return {
        "status": normalized_status,
        "rows_ingested": rows_ingested,
        "error_message": normalized_error,
        "warning_message": note,
    }


def indicator_coverage_summary(
    *,
    symbols_latest: int | None,
    null_rsi_latest: int | None,
    null_ema200_latest: int | None,
) -> dict[str, Any]:
    total = max(symbols_latest or 0, 0)
    rsi_missing = max(null_rsi_latest or 0, 0)
    ema_missing = max(null_ema200_latest or 0, 0)
    return {
        "symbols_on_latest_date": total or None,
        "rsi_14_missing": rsi_missing,
        "ema_200_missing": ema_missing,
        "rsi_14_missing_pct": round((rsi_missing / total) * 100, 1) if total else None,
        "ema_200_missing_pct": round((ema_missing / total) * 100, 1) if total else None,
        "has_gaps": rsi_missing > 0 or ema_missing > 0,
    }


def health_status_from_counts(
    *,
    hours_stale: float | None,
    symbols_latest: int | None,
    universe_active: int | None,
    null_rsi_latest: int | None,
    last_run_errors: int | None,
) -> tuple[str, str, float | None]:
    total_syms = max(symbols_latest or 0, 0)
    active_universe = max(universe_active or total_syms or 0, 0)
    coverage_pct = round((total_syms / active_universe) * 100, 1) if active_universe else None
    null_rsi = null_rsi_latest or 0
    errors = last_run_errors or 0

    if not symbols_latest:
        return "unknown", "unknown", coverage_pct
    if hours_stale is not None and hours_stale > 28:
        return "stale", "unknown", coverage_pct
    if coverage_pct is not None and coverage_pct < 90:
        return "degraded", "fallback", coverage_pct
    if total_syms and (null_rsi / total_syms) > 0.05:
        return "degraded", "fallback", coverage_pct
    if errors > 20:
        return "degraded", "fallback", coverage_pct
    return "healthy", "eod", coverage_pct


def normalize_health_row(row: dict[str, Any]) -> dict[str, Any]:
    hours_stale = _safe_float(row.get("hours_since_last_run"))
    symbols_latest = row.get("symbols_latest")
    universe_active = row.get("universe_active")
    last_run_errors = row.get("last_run_errors") or 0
    status, mode, coverage_pct = health_status_from_counts(
        hours_stale=hours_stale,
        symbols_latest=symbols_latest,
        universe_active=universe_active,
        null_rsi_latest=row.get("null_rsi_latest"),
        last_run_errors=last_run_errors,
    )
    if status == "healthy":
        message = "Latest complete market day is available."
    elif status == "degraded":
        message = "Newest market-data ingest has gaps; product views use the latest usable market day."
    elif status == "stale":
        message = "Market data refresh is overdue; verify before acting."
    else:
        message = "Data freshness could not be established; verify source status before acting."

    latest_trade_date = row.get("latest_trade_date")
    bhavcopy = normalize_bhavcopy_provenance(
        status=row.get("last_bhavcopy_status"),
        rows_ingested=row.get("last_bhavcopy_rows"),
        error_message=row.get("last_bhavcopy_error"),
    )
    bhavcopy["quality"] = {
        "status": row.get("last_bhavcopy_quality_status"),
        "source_rows": row.get("last_bhavcopy_source_rows"),
        "accepted_rows": row.get("last_bhavcopy_accepted_rows"),
        "filtered_series_rows": row.get("last_bhavcopy_filtered_series_rows"),
        "missing_required_rows": row.get("last_bhavcopy_missing_required_rows"),
        "invalid_ohlcv_rows": row.get("last_bhavcopy_invalid_ohlcv_rows"),
        "duplicate_rows": row.get("last_bhavcopy_duplicate_rows"),
        "reasons": row.get("last_bhavcopy_quality_reasons") or [],
    }
    indicator_coverage = indicator_coverage_summary(
        symbols_latest=symbols_latest,
        null_rsi_latest=row.get("null_rsi_latest"),
        null_ema200_latest=row.get("null_ema200_latest"),
    )
    return {
        "status": status,
        "mode": mode,
        "message": message,
        "latest_trade_date": latest_trade_date,
        "last_successful_eod_date": row.get("last_successful_bhavcopy_date") or latest_trade_date,
        "hours_since_refresh": round(hours_stale, 1) if hours_stale is not None else None,
        "symbols_on_latest_date": symbols_latest,
        "universe_active": universe_active,
        "coverage_pct": coverage_pct,
        "indicators_missing": {
            "rsi_14": row.get("null_rsi_latest"),
            "ema_200": row.get("null_ema200_latest"),
        },
        "indicator_coverage": indicator_coverage,
        "last_run": {
            "id": row.get("last_run_id"),
            "errors": last_run_errors,
        },
        "last_bhavcopy": {
            "trade_date": row.get("last_bhavcopy_trade_date"),
            "status": bhavcopy["status"],
            "rows_ingested": bhavcopy["rows_ingested"],
            "source_url": row.get("last_bhavcopy_source_url"),
            "error_message": bhavcopy["error_message"],
            "warning_message": bhavcopy["warning_message"],
            "quality": bhavcopy["quality"],
        },
        "provider": eod_source_metadata(
            as_of=latest_trade_date,
            status=status,
            coverage_pct=coverage_pct,
            symbols_count=symbols_latest,
            universe_active=universe_active,
        ),
        "fallback_active": mode in {"fallback", "unknown"},
        "next_refresh_hint": "After NSE bhavcopy is published on the next trading day.",
    }
