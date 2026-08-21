import asyncio
import os

import pytest
from fastapi import HTTPException

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")

from app.routers import ai, journal  # noqa: E402


class _Response:
    def __init__(self, data):
        self.data = data


class _Query:
    def __init__(self, *, data=None, fail=False, filters=None):
        self._data = data or []
        self._fail = fail
        self.filters = filters if filters is not None else []

    def select(self, *args, **kwargs):
        return self

    def eq(self, *args, **kwargs):
        self.filters.append(("eq", args, kwargs))
        return self

    def gte(self, *args, **kwargs):
        self.filters.append(("gte", args, kwargs))
        return self

    def lte(self, *args, **kwargs):
        self.filters.append(("lte", args, kwargs))
        return self

    def in_(self, *args, **kwargs):
        self.filters.append(("in", args, kwargs))
        return self

    def range(self, *args, **kwargs):
        self.filters.append(("range", args, kwargs))
        return self

    def order(self, *args, **kwargs):
        return self

    def execute(self):
        if self._fail:
            raise RuntimeError("journal review query down")
        return _Response(self._data)


class _Client:
    def __init__(self, *, trades=None, reviews=None, sectors=None, bars=None, paths=None, fail=False, review_fail=False):
        self._trades = trades or []
        self._reviews = reviews or []
        self._sectors = sectors or []
        self._bars = bars or []
        self._paths = paths or []
        self._fail = fail
        self._review_fail = review_fail
        self.trade_query = None

    def table(self, name):
        if name == "trade_journal":
            self.trade_query = _Query(data=self._trades, fail=self._fail)
            return self.trade_query
        if name == "trade_reviews":
            return _Query(data=self._reviews, fail=self._fail or self._review_fail)
        if name == "stock_universe":
            return _Query(data=self._sectors)
        if name == "daily_ohlcv":
            return _Query(data=self._bars)
        if name == "trade_intraday_paths":
            return _Query(data=self._paths)
        raise AssertionError(f"unexpected table: {name}")


def test_journal_analytics_raises_503_when_query_fails(monkeypatch):
    monkeypatch.setattr(journal, "get_admin_client", lambda: _Client(fail=True))

    with pytest.raises(HTTPException) as exc:
        asyncio.run(journal.get_analytics(user_id="user-1"))

    assert exc.value.status_code == 503
    assert exc.value.detail == "Journal analytics are temporarily unavailable."


def test_journal_analytics_keeps_empty_history_as_valid_empty_state(monkeypatch):
    monkeypatch.setattr(journal, "get_admin_client", lambda: _Client(trades=[]))

    result = asyncio.run(journal.get_analytics(user_id="user-1"))

    assert result["equity_curve"] == []
    assert result["setup_breakdown"] == []
    assert result["monthly_pnl"] == []
    assert result["review_summary"]["reviewed_trades"] == 0
    assert result["review_summary"]["unreviewed_closed_trades"] == 0
    assert result["review_summary"]["sample_size_sufficient"] is False


def test_journal_analytics_reports_review_adherence_and_lineage_sample(monkeypatch):
    trades = [
        {"id": "entry-1", "setup_id": "setup-1", "exit_date": "2026-08-01", "pnl": 100},
        {"id": "entry-2", "setup_id": "setup-2", "exit_date": "2026-08-02", "pnl": -50},
        {"id": "entry-3", "setup_id": "setup-3", "exit_date": "2026-08-03", "pnl": 20},
        {"id": "entry-4", "setup_id": None, "exit_date": "2026-08-04", "pnl": -80},
    ]
    reviews = [
        {"journal_entry_id": "entry-1", "status": "completed", "plan_adherence": "followed"},
        {"journal_entry_id": "entry-2", "status": "completed", "plan_adherence": "followed"},
        {"journal_entry_id": "entry-3", "status": "completed", "plan_adherence": "partial"},
    ]
    monkeypatch.setattr(journal, "get_admin_client", lambda: _Client(trades=trades, reviews=reviews))

    result = asyncio.run(journal.get_analytics(user_id="user-1"))
    summary = result["review_summary"]
    rows = {row["adherence"]: row for row in summary["plan_adherence"]}

    assert summary["reviewed_trades"] == 3
    assert summary["unreviewed_closed_trades"] == 1
    assert summary["linked_trades"] == 3
    assert summary["unplanned_trades"] == 1
    assert summary["minimum_sample_size"] == 5
    assert summary["sample_size_sufficient"] is False
    assert rows["followed"] == {
        "adherence": "followed",
        "trades": 2,
        "wins": 1,
        "win_rate": 50.0,
        "total_pnl": 50.0,
        "avg_pnl": 25.0,
    }
    assert rows["partial"]["trades"] == 1
    assert rows["partial"]["total_pnl"] == 20.0
    assert rows["unknown"]["trades"] == 1
    assert rows["not_followed"]["trades"] == 0


def test_journal_analytics_keeps_core_metrics_when_review_enrichment_is_unavailable(monkeypatch):
    trades = [{"id": "entry-1", "setup_id": "setup-1", "exit_date": "2026-08-01", "pnl": 100}]
    monkeypatch.setattr(journal, "get_admin_client", lambda: _Client(trades=trades, review_fail=True))

    result = asyncio.run(journal.get_analytics(user_id="user-1"))

    assert result["equity_curve"] == [{"date": "2026-08-01", "cumulative_pnl": 100.0}]
    assert result["review_summary"]["review_data_status"] == "unavailable"
    assert result["review_summary"]["reviewed_trades"] == 0
    assert result["review_summary"]["unreviewed_closed_trades"] == 1


def test_journal_analytics_adds_date_bounded_cohorts_and_realized_r(monkeypatch):
    trades = [
        {
            "id": "entry-1", "setup_id": "setup-1", "symbol": "RELIANCE", "trade_type": "long",
            "setup_type": "Breakout", "exit_date": "2026-08-02", "pnl": 100,
            "entry_price": 100, "stop_loss": 95, "quantity": 10, "holding_days": 2,
            "scanner_context": {"preset_name": "Trend Template"},
        },
        {
            "id": "entry-2", "setup_id": "setup-2", "symbol": "TCS", "trade_type": "long",
            "setup_type": "Pullback", "exit_date": "2026-08-03", "pnl": -50,
            "entry_price": 100, "stop_loss": 95, "quantity": 10, "holding_days": 7,
            "scanner_context": None,
        },
        {
            "id": "entry-3", "setup_id": None, "symbol": "INFY", "trade_type": "short",
            "setup_type": "unplanned", "exit_date": "2026-08-04", "pnl": -100,
            "entry_price": 100, "stop_loss": 105, "quantity": 10, "holding_days": 14,
            "scanner_context": {"preset_name": "Trend Template"},
        },
    ]
    client = _Client(
        trades=trades,
        sectors=[
            {"symbol": "RELIANCE", "sector": "Energy"},
            {"symbol": "TCS", "sector": "IT Services"},
            {"symbol": "INFY", "sector": "IT Services"},
        ],
    )
    monkeypatch.setattr(journal, "get_admin_client", lambda: client)

    result = asyncio.run(journal.get_analytics(
        from_date="2026-08-01",
        to_date="2026-08-31",
        user_id="user-1",
    ))

    assert result["analysis_period"] == {
        "from_date": "2026-08-01",
        "to_date": "2026-08-31",
        "trade_count": 3,
    }
    assert ("gte", ("exit_date", "2026-08-01"), {}) in client.trade_query.filters
    assert ("lte", ("exit_date", "2026-08-31"), {}) in client.trade_query.filters
    assert result["r_multiple_summary"] == {
        "trades": 3,
        "available_trades": 3,
        "missing_risk_plan": 0,
        "positive_trades": 1,
        "negative_trades": 2,
        "win_rate": 33.3,
        "total_r": -1.0,
        "expectancy_r": -0.33,
        "avg_winner_r": 2.0,
        "avg_loser_r": -1.5,
    }
    scanner_rows = {row["cohort"]: row for row in result["cohort_breakdown"]["scanner"]}
    assert scanner_rows["Trend Template"]["trades"] == 2
    assert scanner_rows["Trend Template"]["avg_r_multiple"] == 0.0
    assert scanner_rows["Not scanner-sourced"]["trades"] == 1
    sector_rows = {row["cohort"]: row for row in result["cohort_breakdown"]["sector"]}
    assert sector_rows["IT Services"]["trades"] == 2
    assert result["sector_context"]["status"] == "available"
    assert result["mae_mfe"]["status"] == "unavailable"


def test_journal_analytics_rejects_invalid_date_range(monkeypatch):
    monkeypatch.setattr(journal, "get_admin_client", lambda: _Client())

    with pytest.raises(HTTPException) as exc:
        asyncio.run(journal.get_analytics(from_date="2026-09-01", to_date="2026-08-01", user_id="user-1"))

    assert exc.value.status_code == 400
    assert exc.value.detail == "from_date must be on or before to_date."


def test_journal_analytics_builds_eod_mae_mfe_proxy(monkeypatch):
    trades = [{
        "id": "entry-1", "setup_id": "setup-1", "symbol": "RELIANCE", "trade_type": "long",
        "setup_type": "Breakout", "entry_date": "2026-08-01", "exit_date": "2026-08-03",
        "pnl": 100, "entry_price": 100, "stop_loss": 95, "quantity": 10, "holding_days": 2,
        "scanner_context": None,
    }]
    client = _Client(
        trades=trades,
        sectors=[{"symbol": "RELIANCE", "sector": "Energy"}],
        bars=[
            {"symbol": "RELIANCE", "trade_date": "2026-08-01", "high": 104, "low": 98},
            {"symbol": "RELIANCE", "trade_date": "2026-08-02", "high": 108, "low": 96},
            {"symbol": "RELIANCE", "trade_date": "2026-08-03", "high": 106, "low": 101},
        ],
    )
    monkeypatch.setattr(journal, "get_admin_client", lambda: client)

    result = asyncio.run(journal.get_analytics(user_id="user-1"))
    summary = result["mae_mfe"]

    assert summary["status"] == "available"
    assert summary["basis"] == "daily_ohlcv_eod_proxy"
    assert summary["trades_with_path"] == 1
    assert summary["trades_without_path"] == 0
    assert summary["avg_mae_pct"] == -4.0
    assert summary["avg_mfe_pct"] == 8.0
    assert summary["avg_mae_r"] == -0.8
    assert summary["avg_mfe_r"] == 1.6
    assert summary["trades"][0]["bars_count"] == 3


def test_journal_analytics_prefers_persisted_intraday_path(monkeypatch):
    trades = [{
        "id": "entry-1", "setup_id": "setup-1", "symbol": "RELIANCE", "trade_type": "long",
        "setup_type": "Breakout", "entry_date": "2026-08-01", "exit_date": "2026-08-01",
        "pnl": 100, "entry_price": 100, "stop_loss": 95, "quantity": 10, "holding_days": 0,
        "scanner_context": None,
    }]
    client = _Client(
        trades=trades,
        paths=[{
            "journal_id": "entry-1",
            "interval": "15minute",
            "source": "zerodha_kite",
            "capture_status": "available",
            "captured_at": "2026-08-01T12:00:00Z",
            "bars": [
                {"time": "2026-08-01T03:45:00Z", "open": 100, "high": 104, "low": 99, "close": 103, "volume": 100},
                {"time": "2026-08-01T04:00:00Z", "open": 103, "high": 108, "low": 101, "close": 107, "volume": 120},
            ],
        }],
    )
    monkeypatch.setattr(journal, "get_admin_client", lambda: client)

    result = asyncio.run(journal.get_analytics(user_id="user-1"))
    summary = result["mae_mfe"]

    assert summary["status"] == "available"
    assert summary["basis"] == "intraday_path"
    assert summary["intraday_trades"] == 1
    assert summary["eod_proxy_trades"] == 0
    assert summary["trades"][0]["basis"] == "intraday_path"
    assert summary["trades"][0]["interval"] == "15minute"
    assert summary["trades"][0]["source"] == "zerodha_kite"
    assert summary["trades"][0]["bars_count"] == 2


def test_ai_patterns_raises_503_when_query_fails(monkeypatch):
    monkeypatch.setattr(ai, "get_admin_client", lambda: _Client(fail=True))

    with pytest.raises(HTTPException) as exc:
        asyncio.run(ai.get_patterns(user_id="user-1"))

    assert exc.value.status_code == 503
    assert exc.value.detail == "Trade pattern review is temporarily unavailable."


def test_ai_patterns_keeps_insufficient_trades_as_valid_readiness_state(monkeypatch):
    monkeypatch.setattr(ai, "get_admin_client", lambda: _Client(trades=[]))

    result = asyncio.run(ai.get_patterns(user_id="user-1"))

    assert result == {
        "min_trades_required": ai.MIN_TRADES,
        "trades_available": 0,
        "ready": False,
    }
