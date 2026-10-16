import asyncio
import json
import os
from datetime import date
from types import SimpleNamespace

import pytest

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")

from app.routers import journal


class _Query:
    def __init__(self, client):
        self.client = client
        self.filters = {}
        self.offset = 0
        self.end = 999
        self.orders = []

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, key, value):
        self.filters[key] = value
        return self

    def order(self, key, **_kwargs):
        self.orders.append(key)
        return self

    def range(self, offset, end):
        self.offset, self.end = offset, end
        return self

    def execute(self):
        self.client.calls.append(self)
        if self.client.fail_page == len(self.client.calls):
            raise RuntimeError("private database detail")
        rows = [
            row for row in self.client.rows
            if all(row.get(key) == value for key, value in self.filters.items())
        ]
        rows.sort(key=lambda row: (row.get("exit_date") or "", row["id"]))
        end = min(self.end + 1, self.offset + self.client.row_cap)
        return SimpleNamespace(data=rows[self.offset:end], count=len(rows))


class _Client:
    def __init__(self, rows, row_cap=1000, fail_page=None):
        self.rows = rows
        self.row_cap = row_cap
        self.fail_page = fail_page
        self.calls = []

    def table(self, name):
        assert name == "trade_journal"
        return _Query(self)


def _trade(index, pnl_pct=14, **overrides):
    return {
        "id": f"trade-{index:05}",
        "user_id": "user-1",
        "symbol": "EXAMPLE",
        "status": "closed",
        "entry_date": "2026-05-01",
        "exit_date": "2026-05-08",
        "pnl": 140 if pnl_pct and pnl_pct > 0 else -700,
        "pnl_pct": pnl_pct,
        "holding_days": 999,
        **overrides,
    }


def _analytics(monkeypatch, rows, **client_options):
    client = _Client(rows, **client_options)
    monkeypatch.setattr(journal, "get_admin_client", lambda: client)
    monkeypatch.setattr(journal, "_journal_today", lambda: date(2026, 5, 31), raising=False)
    result = asyncio.run(journal.get_analytics(user_id="user-1"))
    return result, client


def test_analytics_rejects_duplicate_ids_when_dates_change_between_pages(monkeypatch):
    rows = [_trade(index) for index in range(1001)]
    original_execute = _Query.execute

    def execute_with_date_edit(query):
        if query.offset == 1000:
            rows[0]["exit_date"] = "2026-05-09"
        return original_execute(query)

    monkeypatch.setattr(_Query, "execute", execute_with_date_edit)
    with pytest.raises(journal.HTTPException) as error:
        _analytics(monkeypatch, rows)
    assert error.value.status_code == 503
    assert "temporarily unavailable" in error.value.detail.lower()


def test_published_46_percent_14_percent_gain_7_percent_loss_example(monkeypatch):
    rows = [
        *[_trade(index, 14) for index in range(46)],
        *[_trade(100 + index, -7, exit_date="2026-05-03") for index in range(54)],
    ]

    result, _ = _analytics(monkeypatch, rows)
    edge = result["trading_edge"]

    assert edge["closed_trades"] == edge["return_trade_count"] == 100
    assert edge["win_rate_pct"] == 46
    assert edge["avg_gain_pct"] == 14
    assert edge["avg_loss_pct"] == 7
    assert edge["payoff_ratio"] == 2
    assert edge["adjusted_win_loss_ratio"] == pytest.approx(1.7037)
    assert edge["expectancy_pct"] == pytest.approx(2.66)
    assert edge["avg_win_cash"] == 140
    assert edge["avg_loss_cash"] == 700
    assert edge["expectancy_cash"] == pytest.approx(-313.6)
    assert edge["profit_factor_cash"] == pytest.approx(0.1704)
    assert edge["avg_winner_holding_days"] == 7
    assert edge["avg_loser_holding_days"] == 2
    assert result["monthly_tracker"][0]["month"] == "2026-05"


def test_95_trade_sample_uses_actual_total_including_breakevens(monkeypatch):
    rows = [
        *[_trade(index, 14) for index in range(44)],
        *[_trade(100 + index, -7) for index in range(50)],
        _trade(999, 0, pnl=0),
    ]

    result, _ = _analytics(monkeypatch, rows)
    edge = result["trading_edge"]

    assert edge["closed_trades"] == edge["return_trade_count"] == 95
    assert edge["wins"] == 44
    assert edge["losses"] == 50
    assert edge["breakevens"] == 1
    assert edge["win_rate_pct"] == pytest.approx(46.3158)
    assert edge["loss_rate_pct"] == pytest.approx(52.6316)
    assert edge["adjusted_win_loss_ratio"] == pytest.approx(1.76)
    assert edge["expectancy_pct"] == pytest.approx((44 * 14 - 50 * 7) / 95, abs=0.0001)


def test_months_use_closed_dates_and_exclude_unknown_future_and_open_trades(monkeypatch):
    rows = [
        _trade(1, 10, exit_date="2026-04-30", entry_date="2026-04-01"),
        _trade(2, -5),
        _trade(3, 20, exit_date=None),
        _trade(4, 20, exit_date="invalid-date"),
        _trade(5, 90, exit_date="2026-06-01"),
        _trade(6, 90, status="open"),
        _trade(7, 90, user_id="another-user"),
    ]

    result, _ = _analytics(monkeypatch, rows)

    assert [(row["month"], row["closed_trades"]) for row in result["monthly_tracker"]] == [
        ("2026-04", 1), ("2026-05", 1),
    ]
    assert result["metric_coverage"] == {
        "closed_trades": 5,
        "eligible_trades": 2,
        "return_trade_count": 2,
        "cash_trade_count": 2,
        "unknown_exit_date_count": 2,
        "future_exit_date_count": 1,
        "missing_return_count": 0,
        "missing_cash_pnl_count": 0,
    }
    assert result["trade_distribution"]["returns_pct"] == [10, -5]
    assert result["trading_edge"]["largest_gain_pct"] == 10
    assert result["trading_edge"]["largest_loss_pct"] == 5


@pytest.mark.parametrize("bad_value", [None, "bad", float("nan"), float("inf"), float("-inf"), True])
def test_missing_or_nonfinite_trade_values_do_not_become_zero_returns(monkeypatch, bad_value):
    rows = [_trade(1, 14), _trade(2, -7), _trade(3, 0, pnl=0)]
    rows[-1].update(pnl_pct=bad_value, pnl=bad_value, risk_reward=bad_value)

    result, _ = _analytics(monkeypatch, rows)
    edge = result["trading_edge"]

    assert edge["closed_trades"] == 3
    assert edge["return_trade_count"] == edge["cash_trade_count"] == 2
    assert edge["breakevens"] == 0
    assert edge["win_rate_pct"] == 50
    assert result["metric_coverage"]["missing_return_count"] == 1
    assert result["metric_coverage"]["missing_cash_pnl_count"] == 1
    assert result["trade_distribution"]["returns_pct"] == [14, -7]
    json.dumps(result, allow_nan=False)


def test_holding_duration_uses_calendar_dates_and_tracks_missing_coverage(monkeypatch):
    rows = [
        _trade(1, 14, entry_date="2026-05-06", holding_days=999),
        _trade(2, 14, entry_date=None, holding_days=2),
        _trade(3, -7, entry_date="2026-05-10", holding_days=2),
        _trade(4, -7, entry_date="2026-05-08", holding_days=99),
    ]

    result, _ = _analytics(monkeypatch, rows)
    edge = result["trading_edge"]

    assert edge["avg_winner_holding_days"] == 2
    assert edge["winner_holding_count"] == 1
    assert edge["avg_loser_holding_days"] == 0
    assert edge["loser_holding_count"] == 1
    assert result["setup_breakdown"][0]["avg_holding_days"] == 1


@pytest.mark.parametrize("returns", [[], [14, 14], [-7, -7], [0, 0]])
def test_empty_or_single_sided_samples_do_not_invent_undefined_ratios(monkeypatch, returns):
    result, _ = _analytics(monkeypatch, [_trade(index, value, pnl=value) for index, value in enumerate(returns)])
    edge = result["trading_edge"]

    assert edge["payoff_ratio"] is None
    assert edge["adjusted_win_loss_ratio"] is None
    if not returns:
        assert edge["win_rate_pct"] is None
        assert edge["expectancy_pct"] is None
        assert result["monthly_tracker"] == []
    json.dumps(result, allow_nan=False)


@pytest.mark.parametrize("row_cap", [1000, 400])
def test_analytics_paginates_the_full_user_closed_history(monkeypatch, row_cap):
    rows = [_trade(index, 14) for index in range(2501)]
    rows.extend([_trade(3000, 90, user_id="another-user"), _trade(3001, 90, status="open")])

    result, client = _analytics(monkeypatch, rows, row_cap=row_cap)

    assert result["trading_edge"]["closed_trades"] == 2501
    assert result["trading_edge"]["return_trade_count"] == 2501
    assert len(result["trade_distribution"]["returns_pct"]) == 2501
    assert len(client.calls) > 1
    assert all(query.filters == {"user_id": "user-1", "status": "closed"} for query in client.calls)
    assert all(query.orders == ["exit_date", "id"] for query in client.calls)


def test_a_later_page_failure_does_not_return_partial_analytics(monkeypatch):
    with pytest.raises(journal.HTTPException) as exc:
        _analytics(monkeypatch, [_trade(index) for index in range(1001)], fail_page=2)

    assert exc.value.status_code == 503
    assert exc.value.detail == "Journal analytics are temporarily unavailable."
