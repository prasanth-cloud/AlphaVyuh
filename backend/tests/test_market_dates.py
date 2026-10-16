import pytest

from app.services.market_dates import (
    analyze_trade_date_quality,
    get_latest_complete_trade_date,
)


class _Result:
    def __init__(self, data=None, count=None):
        self.data = data or []
        self.count = count


class _Query:
    def __init__(self, table_name, rows, count=None):
        self.table_name = table_name
        self.rows = rows
        self.count = count
        self.offset = 0
        self.end = 999

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def limit(self, *_args, **_kwargs):
        return self

    def order(self, *_args, **_kwargs):
        return self

    def range(self, offset, end):
        self.offset = offset
        self.end = end
        return self

    def execute(self):
        if self.table_name == "stock_universe":
            return _Result(count=self.count)
        return _Result(data=self.rows[self.offset:self.end + 1])


class _Client:
    def __init__(self, rows, active_count):
        self.rows = rows
        self.active_count = active_count

    def table(self, table_name):
        if table_name == "stock_universe":
            return _Query(table_name, [], count=self.active_count)
        return _Query(table_name, self.rows)


def _date_rows(trade_date, count):
    return [
        {
            "trade_date": trade_date,
            "symbol": f"SYM{i}",
            "open": 100,
            "high": 103,
            "low": 98,
            "close": 100,
            "prev_close": 99,
            "volume": 100000 + i,
            "pct_change": 1.01,
            "stock_universe": {"series": "EQ", "market": "NSE", "is_active": True},
        }
        for i in range(count)
    ]


def test_latest_complete_trade_date_skips_partial_latest_session():
    rows = [
        *_date_rows("2026-05-11", 900),
        *_date_rows("2026-05-08", 2300),
    ]
    client = _Client(rows, active_count=2500)

    assert get_latest_complete_trade_date(client) == "2026-05-08"


def test_latest_complete_trade_date_uses_minimum_coverage_when_universe_count_unavailable():
    previous = _date_rows("2026-05-08", 900)
    for row in previous:
        row["volume"] += 1000000
    rows = [
        *_date_rows("2026-05-11", 1001),
        *previous,
    ]
    client = _Client(rows, active_count=None)

    assert get_latest_complete_trade_date(client) == "2026-05-11"


def test_latest_complete_trade_date_accepts_stored_pct_change_when_prev_close_missing():
    rows = _date_rows("2026-05-11", 1500)
    for row in rows:
        row["prev_close"] = None
        row["pct_change"] = 0.4
    client = _Client(rows, active_count=1800)

    assert get_latest_complete_trade_date(client) == "2026-05-11"


def test_latest_complete_trade_date_rejects_flat_newest_session():
    flat_latest = _date_rows("2026-05-11", 2300)
    for row in flat_latest:
        row["prev_close"] = row["close"]
        row["pct_change"] = 0

    rows = [
        *flat_latest,
        *_date_rows("2026-05-08", 2300),
    ]
    client = _Client(rows, active_count=2500)

    assert get_latest_complete_trade_date(client) == "2026-05-08"


def test_latest_complete_trade_date_rejects_newest_session_duplicated_from_previous_day():
    previous = _date_rows("2026-05-08", 2300)
    duplicated_latest = []
    for row in previous:
        duplicated_latest.append({
            **row,
            "trade_date": "2026-05-11",
            "prev_close": row["close"],
            "pct_change": 0,
        })

    rows = [
        *duplicated_latest,
        *previous,
    ]
    client = _Client(rows, active_count=2500)

    assert get_latest_complete_trade_date(client) == "2026-05-08"


@pytest.mark.parametrize("active_count", [None, 2500])
def test_latest_complete_trade_date_requires_coverage_even_without_complete_history(active_count):
    client = _Client(_date_rows("2026-05-11", 900), active_count=active_count)

    assert get_latest_complete_trade_date(client) is None


def test_latest_complete_trade_date_does_not_restore_suspicious_session_via_partial_fallback():
    previous = _date_rows("2026-05-08", 900)
    latest = [{**row, "trade_date": "2026-05-11"} for row in previous]
    latest.extend(_date_rows("2026-05-11", 100)[-100:])
    # Use distinct symbols while preserving enough previous-session duplicates.
    for index, row in enumerate(latest[900:]):
        row["symbol"] = f"EXTRA{index}"
    client = _Client([*latest, *previous], active_count=None)

    assert get_latest_complete_trade_date(client) is None


@pytest.mark.parametrize(
    "invalid_fields",
    [
        {"close": float("nan")},
        {"close": float("inf")},
        {"close": None},
        {"close": 0},
        {"open": float("nan")},
        {"high": 99},
        {"low": 101},
        {"volume": float("inf")},
        {"volume": float("nan")},
        {"volume": None},
        {"volume": -1},
        {"volume": 1.5},
        {"prev_close": None, "pct_change": float("nan")},
        {"prev_close": None, "pct_change": float("inf")},
        {"prev_close": float("nan"), "pct_change": None},
    ],
)
def test_latest_complete_trade_date_excludes_corrupt_rows_from_coverage(invalid_fields):
    latest = _date_rows("2026-05-11", 1000)
    latest[-1].update(invalid_fields)
    previous = _date_rows("2026-05-08", 1000)
    for row in previous:
        row["volume"] += 1000000
    client = _Client([*latest, *previous], active_count=None)

    assert get_latest_complete_trade_date(client) == "2026-05-08"


@pytest.mark.parametrize("invalid_date", ["2099-01-01", "not-a-date", "2026-05-99"])
def test_latest_complete_trade_date_excludes_invalid_and_future_dates(invalid_date):
    previous = _date_rows("2026-05-08", 1000)
    for row in previous:
        row["volume"] += 1000000
    client = _Client(
        [*_date_rows(invalid_date, 1000), *previous],
        active_count=None,
    )

    assert get_latest_complete_trade_date(client) == "2026-05-08"


def test_trade_date_quality_does_not_count_nonfinite_moves_as_unchanged():
    rows = [
        {"close": float("nan"), "prev_close": 99},
        {"close": float("inf"), "prev_close": 99},
        {"close": 100, "prev_close": float("inf")},
        {"close": 100, "prev_close": None, "pct_change": float("nan")},
    ]

    quality = analyze_trade_date_quality(rows)

    assert quality["total"] == 0
    assert quality["unchanged"] == 0
