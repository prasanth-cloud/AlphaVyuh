import os
from datetime import date
from types import SimpleNamespace

import pandas as pd
import pytest

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")

from app.services.bhavcopy import _compute_indicators_bulk


class _HistoryQuery:
    def __init__(self, client):
        self.client = client
        self.symbols = []
        self.end_date = None
        self.start = 0
        self.end = 999

    def select(self, *_args):
        return self

    def in_(self, column, symbols):
        assert column == "symbol"
        self.symbols = symbols
        return self

    def lte(self, column, value):
        assert column == "trade_date"
        self.end_date = value
        self.client.date_bounds.append(value)
        return self

    def order(self, *_args, **_kwargs):
        return self

    def range(self, start, end):
        self.start, self.end = start, end
        return self

    def execute(self):
        rows = [
            row for row in self.client.rows
            if row["symbol"] in self.symbols
            and (self.end_date is None or row["trade_date"] <= self.end_date)
        ]
        rows.sort(key=lambda row: (row["trade_date"], row["symbol"]))
        return SimpleNamespace(data=rows[self.start:self.end + 1])


class _HistoryClient:
    def __init__(self, rows):
        self.rows = rows
        self.date_bounds = []

    def table(self, name):
        assert name == "daily_ohlcv"
        return _HistoryQuery(self)


def _history_row(trade_date, close):
    return {
        "symbol": "TEST",
        "trade_date": trade_date.strftime("%Y-%m-%d"),
        "open": close - 0.5,
        "high": close + 1.5,
        "low": close - 1.5,
        "close": close,
        "volume": 100000,
    }


@pytest.mark.parametrize("future_bars", [1, 300])
def test_historical_indicator_recalculation_cannot_use_future_bars(future_bars):
    trade_date = date(2026, 5, 8)
    historical_rows = [
        _history_row(day, 100 + index)
        for index, day in enumerate(pd.bdate_range(end=trade_date, periods=260))
    ]
    future_rows = [
        _history_row(day, 10000 + index)
        for index, day in enumerate(
            pd.bdate_range(start="2026-05-11", periods=future_bars)
        )
    ]
    history_only = _HistoryClient(historical_rows)
    history_with_future = _HistoryClient([*historical_rows, *future_rows])

    expected = _compute_indicators_bulk(history_only, ["TEST"], trade_date)
    actual = _compute_indicators_bulk(history_with_future, ["TEST"], trade_date)

    assert actual == expected
    assert actual[0][1]["prev_close"] == 358
    assert actual[0][1]["sma_200"] == 259.5
    assert history_with_future.date_bounds == ["2026-05-08"]
