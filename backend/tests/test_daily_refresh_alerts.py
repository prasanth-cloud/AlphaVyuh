import os
import importlib.util
from datetime import date
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


def test_yfinance_supplement_records_rate_limit_degradation(monkeypatch):
    from app.services import yfinance_ingest

    monkeypatch.setattr(yfinance_ingest, "NSE_UNIVERSE", ["RELIANCE", "ITC", "AUBANK"])
    monkeypatch.setenv("YFINANCE_RATE_LIMIT_BACKOFF_S", "0")
    monkeypatch.setattr(daily_refresh.time, "sleep", lambda _: None)

    def fake_fetch(symbol, period):
        assert period == "5d"
        if symbol == "RELIANCE":
            return {"symbol": symbol, "status": "success", "rows": 5}
        if symbol == "ITC":
            return {"symbol": symbol, "status": "error", "error": "Too Many Requests. Rate limited."}
        return {"symbol": symbol, "status": "no_data", "rows": 0}

    monkeypatch.setattr(yfinance_ingest, "fetch_and_ingest", fake_fetch)

    log = daily_refresh.Logger("test-run")
    result = daily_refresh.run_yfinance_top200(
        date(2026, 5, 29),
        log,
    )

    assert result["status"] == "degraded"
    assert result["attempted"] == 3
    assert result["total_symbols"] == 3
    assert result["success"] == 1
    assert result["failed"] == 2
    assert result["stopped_reason"] is None
    assert result["rate_limited"] == 1
    assert result["failure_reasons"] == {"rate_limited": 1, "no_data": 1}
    assert result["failures"][0]["symbol"] == "ITC"
    assert log.errors == []
    assert log.warnings


def test_yfinance_supplement_degrades_when_symbol_limit_is_bounded(monkeypatch):
    from app.services import yfinance_ingest

    monkeypatch.setattr(yfinance_ingest, "NSE_UNIVERSE", ["RELIANCE", "ITC", "AUBANK", "TCS"])
    monkeypatch.setattr(daily_refresh.time, "sleep", lambda _: None)
    monkeypatch.setattr(
        yfinance_ingest,
        "fetch_and_ingest",
        lambda symbol, period: {"symbol": symbol, "status": "success", "rows": 5},
    )

    log = daily_refresh.Logger("test-run")
    result = daily_refresh.run_yfinance_top200(date(2026, 5, 29), log, limit=2)

    assert result["status"] == "degraded"
    assert result["attempted"] == 2
    assert result["total_symbols"] == 4
    assert result["success"] == 2
    assert result["failed"] == 0
    assert result["coverage_pct"] == 50.0
    assert result["stopped_reason"] == "limit"
    assert log.errors == []
    assert log.warnings


def test_yfinance_supplement_degrades_when_time_budget_is_reached(monkeypatch):
    from app.services import yfinance_ingest

    monkeypatch.setattr(yfinance_ingest, "NSE_UNIVERSE", ["RELIANCE", "ITC", "AUBANK", "TCS"])
    monkeypatch.setattr(daily_refresh.time, "sleep", lambda _: None)
    monkeypatch.setattr(
        yfinance_ingest,
        "fetch_and_ingest",
        lambda symbol, period: {"symbol": symbol, "status": "success", "rows": 5},
    )
    ticks = iter([0.0, 0.0, 2.0])
    monkeypatch.setattr(daily_refresh.time, "monotonic", lambda: next(ticks))

    log = daily_refresh.Logger("test-run")
    result = daily_refresh.run_yfinance_top200(date(2026, 5, 29), log, time_budget_s=1)

    assert result["status"] == "degraded"
    assert result["attempted"] == 1
    assert result["total_symbols"] == 4
    assert result["success"] == 1
    assert result["failed"] == 0
    assert result["coverage_pct"] == 25.0
    assert result["stopped_reason"] == "time_budget"
    assert log.errors == []
    assert log.warnings


def test_supplemental_summary_surfaces_rs_and_yfinance_degradation():
    summary = daily_refresh.summarize_supplemental_data({
        "bhavcopy": {
            "status": "success",
            "rows_ingested": 3156,
            "rs_score": {"status": "failed", "error": "statement timeout"},
        },
        "yfinance": {
            "status": "degraded",
            "attempted": 200,
            "total_symbols": 200,
            "success": 42,
            "failed": 158,
            "coverage_pct": 21,
            "rate_limited": 155,
            "failure_reasons": {"rate_limited": 155, "no_data": 3},
        },
    })

    assert summary["status"] == "degraded"
    assert summary["rs_score"]["status"] == "failed"
    assert summary["yfinance"]["rate_limited"] == 155
    assert summary["warnings"] == [
        "RS score calculation failed for the latest bhavcopy run.",
        "yfinance supplement degraded: 42/200 symbols updated.",
    ]


def test_supplemental_summary_fails_when_yfinance_only_has_no_updates():
    summary = daily_refresh.summarize_supplemental_data(
        {
            "yfinance": {
                "status": "failed",
                "attempted": 200,
                "total_symbols": 200,
                "success": 0,
                "failed": 200,
                "coverage_pct": 0,
                "rate_limited": 200,
                "failure_reasons": {"rate_limited": 200},
            },
        },
        yfinance_only=True,
    )

    assert summary["status"] == "failed"
    assert summary["rs_score"]["status"] == "not_run"
    assert summary["warnings"] == ["yfinance supplement degraded: 0/200 symbols updated."]
