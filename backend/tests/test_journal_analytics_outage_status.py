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
    def __init__(self, *, data=None, fail=False):
        self._data = data or []
        self._fail = fail

    def select(self, *args, **kwargs):
        return self

    def eq(self, *args, **kwargs):
        return self

    def order(self, *args, **kwargs):
        return self

    def execute(self):
        if self._fail:
            raise RuntimeError("journal review query down")
        return _Response(self._data)


class _Client:
    def __init__(self, *, trades=None, reviews=None, fail=False, review_fail=False):
        self._trades = trades or []
        self._reviews = reviews or []
        self._fail = fail
        self._review_fail = review_fail

    def table(self, name):
        if name == "trade_journal":
            return _Query(data=self._trades, fail=self._fail)
        if name == "trade_reviews":
            return _Query(data=self._reviews, fail=self._fail or self._review_fail)
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
