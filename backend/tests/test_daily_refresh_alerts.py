import os
import importlib.util
from pathlib import Path

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")

from app.main import _bhavcopy_result_supports_alerts

_spec = importlib.util.spec_from_file_location(
    "daily_refresh",
    Path(__file__).resolve().parents[1] / "scripts" / "daily_refresh.py",
)
daily_refresh = importlib.util.module_from_spec(_spec)
assert _spec and _spec.loader
_spec.loader.exec_module(daily_refresh)
should_run_scan_alerts = daily_refresh.should_run_scan_alerts


def test_daily_refresh_runs_alerts_only_after_complete_bhavcopy():
    eligible, reason = should_run_scan_alerts(
        {"status": "success", "rows_ingested": 3114, "partial_ingest": False},
        dry_run=False,
        yfinance_only=False,
    )

    assert eligible is True
    assert reason == "eligible"
    assert _bhavcopy_result_supports_alerts({"status": "success", "rows_ingested": 3114}) is True


def test_daily_refresh_skips_alerts_for_partial_or_dry_run():
    partial, partial_reason = should_run_scan_alerts(
        {"status": "partial", "rows_ingested": 500, "partial_ingest": True},
        dry_run=False,
        yfinance_only=False,
    )
    dry_run, dry_reason = should_run_scan_alerts(
        {"status": "success", "rows_ingested": 3114},
        dry_run=True,
        yfinance_only=False,
    )

    assert partial is False
    assert partial_reason == "bhavcopy_partial"
    assert dry_run is False
    assert dry_reason == "dry_run"
    assert _bhavcopy_result_supports_alerts({"status": "partial", "rows_ingested": 500, "partial_ingest": True}) is False


def test_daily_refresh_skips_alerts_when_no_rows_are_available():
    eligible, reason = should_run_scan_alerts(
        {"status": "already_done", "rows_ingested": 0},
        dry_run=False,
        yfinance_only=False,
    )

    assert eligible is False
    assert reason == "no_rows_ingested"
    assert _bhavcopy_result_supports_alerts({"status": "already_done", "rows_ingested": 0}) is False
