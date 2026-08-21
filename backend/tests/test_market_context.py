from app.services.market_context import (
    eod_source_metadata,
    health_status_from_counts,
    indicator_coverage_summary,
    live_source_metadata,
    normalize_bhavcopy_provenance,
    normalize_health_row,
)


def test_health_status_marks_low_coverage_degraded():
    status, mode, coverage = health_status_from_counts(
        hours_stale=2,
        symbols_latest=700,
        universe_active=1000,
        null_rsi_latest=0,
        last_run_errors=0,
    )

    assert status == "degraded"
    assert mode == "fallback"
    assert coverage == 70.0


def test_eod_source_metadata_never_claims_live_data():
    metadata = eod_source_metadata(as_of="2026-04-24", status="healthy", coverage_pct=99.2)

    assert metadata["source_name"] == "NSE bhavcopy"
    assert metadata["mode"] == "eod"
    assert "realtime" in metadata["license_notes"].lower()


def test_live_source_metadata_uses_professional_access_language():
    metadata = live_source_metadata(provider="Broker import", as_of="2026-05-18T12:00:00Z")

    assert metadata["confidence"] == "account_scoped"
    assert "beta" not in metadata["license_notes"].lower()


def test_normalize_health_row_exposes_operator_fields():
    row = {
        "latest_trade_date": "2026-04-24",
        "symbols_latest": 990,
        "universe_active": 1000,
        "hours_since_last_run": 4.2,
        "null_rsi_latest": 0,
        "null_ema200_latest": 3,
        "last_run_id": "run-1",
        "last_run_errors": 0,
        "last_successful_bhavcopy_date": "2026-04-24",
        "last_bhavcopy_trade_date": "2026-04-24",
        "last_bhavcopy_status": "success",
        "last_bhavcopy_rows": 990,
        "last_bhavcopy_source_url": "https://example.test/bhavcopy.csv",
        "last_bhavcopy_quality_status": "passed",
        "last_bhavcopy_source_rows": 990,
        "last_bhavcopy_accepted_rows": 990,
        "last_bhavcopy_filtered_series_rows": 0,
        "last_bhavcopy_missing_required_rows": 0,
        "last_bhavcopy_invalid_ohlcv_rows": 0,
        "last_bhavcopy_duplicate_rows": 0,
        "last_bhavcopy_quality_reasons": [],
    }

    health = normalize_health_row(row)

    assert health["status"] == "healthy"
    assert health["mode"] == "eod"
    assert health["last_successful_eod_date"] == "2026-04-24"
    assert health["last_bhavcopy"]["status"] == "success"
    assert health["last_bhavcopy"]["quality"]["status"] == "passed"
    assert health["last_bhavcopy"]["quality"]["accepted_rows"] == 990
    assert health["provider"]["source_name"] == "NSE bhavcopy"


def test_normalize_bhavcopy_provenance_clears_stale_error_on_success():
    normalized = normalize_bhavcopy_provenance(
        status="success",
        rows_ingested=990,
        error_message="404 Client Error: Not Found for url: https://example.test/bhavcopy.csv",
    )

    assert normalized["status"] == "success"
    assert normalized["error_message"] is None


def test_normalize_bhavcopy_provenance_marks_failed_when_success_without_rows():
    normalized = normalize_bhavcopy_provenance(
        status="success",
        rows_ingested=0,
        error_message=None,
    )

    assert normalized["status"] == "failed"
    assert "without ingested rows" in (normalized["error_message"] or "")


def test_indicator_coverage_summary_reports_ema_gaps():
    summary = indicator_coverage_summary(
        symbols_latest=1000,
        null_rsi_latest=0,
        null_ema200_latest=407,
    )

    assert summary["ema_200_missing"] == 407
    assert summary["has_gaps"] is True
    assert summary["ema_200_missing_pct"] == 40.7


def test_normalize_health_row_normalizes_conflicting_bhavcopy_fields():
    row = {
        "latest_trade_date": "2026-04-24",
        "symbols_latest": 990,
        "universe_active": 1000,
        "hours_since_last_run": 4.2,
        "null_rsi_latest": 0,
        "null_ema200_latest": 407,
        "last_run_id": "run-1",
        "last_run_errors": 0,
        "last_successful_bhavcopy_date": "2026-04-24",
        "last_bhavcopy_trade_date": "2026-04-24",
        "last_bhavcopy_status": "success",
        "last_bhavcopy_rows": 990,
        "last_bhavcopy_error": "404 Client Error: Not Found",
    }

    health = normalize_health_row(row)

    assert health["last_bhavcopy"]["error_message"] is None
    assert health["indicator_coverage"]["ema_200_missing"] == 407
