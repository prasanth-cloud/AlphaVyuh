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
    def __init__(self, *, trades=None, fail=False):
        self._trades = trades or []
        self._fail = fail

    def table(self, name):
        assert name == "trade_journal"
        return _Query(data=self._trades, fail=self._fail)


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
