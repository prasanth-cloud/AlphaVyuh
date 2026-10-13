import asyncio
import os

import pytest

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")

from app.routers import journal  # noqa: E402


class _Query:
    def __init__(self, entries):
        self.data = entries
        self.count = len(entries)

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def order(self, *_args, **_kwargs):
        return self

    def range(self, offset, end):
        self.data = self.data[offset:end + 1]
        return self

    def execute(self):
        return self


class _Client:
    def __init__(self, entries):
        self.entries = entries

    def table(self, table_name):
        assert table_name == "trade_journal"
        return _Query(self.entries)


def _analytics(monkeypatch, dated_pnl):
    entries = [
        {"id": f"trade-{index}", "symbol": "EXAMPLE", "exit_date": exit_date, "pnl": pnl, "status": "closed"}
        for index, (exit_date, pnl) in enumerate(dated_pnl)
    ]
    monkeypatch.setattr(journal, "get_admin_client", lambda: _Client(entries))
    return asyncio.run(journal.get_analytics(user_id="user-1"))


@pytest.mark.parametrize(
    ("dated_pnl", "expected_drawdowns", "expected_max", "expected_days"),
    [
        (
            [("2026-01-01", 100), ("2026-01-10", 50), ("2026-01-20", 50)],
            [0, 0, 0],
            0,
            0,
        ),
        (
            [("2026-01-01", -100), ("2026-01-05", -25), ("2026-01-12", 50), ("2026-01-21", 100)],
            [-100, -125, -75, 0],
            125,
            20,
        ),
        (
            [("2026-01-01", 100), ("2026-01-10", -50), ("2026-01-20", -10)],
            [0, -50, -60],
            60,
            10,
        ),
        (
            [("2026-01-01", 100), ("2026-01-05", -25), ("2026-01-09", 25), ("2026-01-15", -10)],
            [0, -25, 0, -10],
            25,
            4,
        ),
        (
            [("2026-01-01", 100), ("2026-01-05", -50), ("2026-01-09", 70), ("2026-01-13", -10), ("2026-01-20", 30)],
            [0, -50, 0, -10, 0],
            50,
            7,
        ),
    ],
    ids=["rising-highs", "losses-before-profit", "active-drawdown", "equal-high-recovery", "separate-local-peaks"],
)
def test_drawdown_uses_observed_underwater_periods(
    monkeypatch, dated_pnl, expected_drawdowns, expected_max, expected_days
):
    result = _analytics(monkeypatch, dated_pnl)

    assert [point["drawdown"] for point in result["drawdown_curve"]] == expected_drawdowns
    assert result["max_drawdown"] == expected_max
    assert result["longest_dd_days"] == expected_days


def test_drawdown_percentage_is_unknown_without_account_equity(monkeypatch):
    result = _analytics(monkeypatch, [("2026-01-01", -100), ("2026-01-10", 200), ("2026-01-20", -50)])

    assert all(point["drawdown_pct"] is None for point in result["drawdown_curve"])


def test_drawdown_empty_history_remains_valid(monkeypatch):
    result = _analytics(monkeypatch, [])

    assert result["drawdown_curve"] == []
    assert result["max_drawdown"] == 0
    assert result["longest_dd_days"] == 0
    assert result["recovery_factor"] is None


def test_drawdown_malformed_date_preserves_amounts_and_valid_duration(monkeypatch):
    result = _analytics(monkeypatch, [
        ("2026-01-01", 100),
        ("invalid-date", -20),
        ("2026-01-10", -30),
        ("2026-01-20", -10),
    ])

    assert [point["drawdown"] for point in result["drawdown_curve"]] == [0, -20, -50, -60]
    assert result["max_drawdown"] == 60
    assert result["longest_dd_days"] == 10
