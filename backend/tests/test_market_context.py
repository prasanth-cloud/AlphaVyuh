from app.services.market_context import eod_source_metadata, health_status_from_counts, normalize_health_row


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

    assert metadata["source_name"] == "NSE bhavcopy EOD"
    assert metadata["mode"] == "eod"
    assert "realtime" in metadata["license_notes"].lower()


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
    }

    health = normalize_health_row(row)

    assert health["status"] == "healthy"
    assert health["mode"] == "eod"
    assert health["last_successful_eod_date"] == "2026-04-24"
    assert health["last_bhavcopy"]["status"] == "success"
    assert health["provider"]["source_name"] == "NSE bhavcopy EOD"
