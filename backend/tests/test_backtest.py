import asyncio
import os

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")

from app.routers import backtest  # noqa: E402


class _Result:
    def __init__(self, data=None):
        self.data = data or []


def _ohlcv_row(symbol: str, close: float = 105.0) -> dict:
    return {
        "symbol": symbol,
        "open": 101,
        "high": 110,
        "low": 99,
        "close": close,
        "prev_close": 100,
        "volume": 100_000,
        "avg_volume_20d": 100_000,
        "turnover": 10_000_000,
        "rsi_14": 60,
        "ema_20": 100,
        "ema_50": 95,
        "ema_200": 90,
        "week_52_high": 110,
        "week_52_low": 70,
        "atr_14": 2,
        "stock_universe": {
            "company_name": f"{symbol} Ltd",
            "series": "EQ",
            "sector": "Test",
            "is_active": True,
            "market": "NSE",
            "currency": "INR",
        },
    }


class _BacktestQuery:
    def __init__(self, client, table_name):
        self.client = client
        self.table_name = table_name
        self.eq_filters = {}
        self.limit_value = None
        self.range_start = None
        self.range_end = None

    def select(self, *_args, **_kwargs):
        return self

    def in_(self, column, values):
        self.eq_filters[column] = values
        return self

    def order(self, *_args, **_kwargs):
        return self

    def limit(self, value):
        self.limit_value = value
        return self

    def range(self, start, end):
        self.range_start = start
        self.range_end = end
        return self

    def eq(self, column, value):
        self.eq_filters[column] = value
        return self

    def execute(self):
        self.client.queries.append((self.table_name, dict(self.eq_filters), self.limit_value))
        if self.table_name == "bhavcopy_ingestion_log":
            return _Result([
                {"trade_date": trade_date}
                for trade_date in self.client.log_dates[: self.limit_value]
            ])
        if self.table_name == "daily_ohlcv" and "trade_date" not in self.eq_filters:
            rows = [{"trade_date": row["trade_date"]} for row in self.client.date_rows]
            start = self.range_start or 0
            end = self.range_end if self.range_end is not None else len(rows) - 1
            return _Result(rows[start : end + 1])
        if self.table_name == "daily_ohlcv":
            return _Result(self.client.rows_by_date.get(self.eq_filters["trade_date"], []))
        return _Result()


class _BacktestClient:
    def __init__(self, *, log_dates=None, date_rows=None, rows_by_date=None):
        self.log_dates = log_dates or []
        self.date_rows = date_rows or []
        self.rows_by_date = rows_by_date or {}
        self.queries = []

    def table(self, table_name):
        return _BacktestQuery(self, table_name)


def test_run_backtest_uses_unique_ingestion_dates(monkeypatch):
    client = _BacktestClient(
        log_dates=["2026-05-15", "2026-05-14", "2026-05-13"],
        rows_by_date={
            "2026-05-13": [_ohlcv_row("CCC")],
            "2026-05-14": [_ohlcv_row("BBB")],
            "2026-05-15": [_ohlcv_row("AAA")],
        },
    )
    monkeypatch.setattr(backtest, "_get_user_plan", lambda _user_id: "pro")
    monkeypatch.setattr(backtest, "get_admin_client", lambda: client)

    result = asyncio.run(backtest.run_backtest(backtest.BacktestRequest(days=3), user_id="user-1"))

    assert result["days_analysed"] == 3
    assert [row["date"] for row in result["results"]] == ["2026-05-13", "2026-05-14", "2026-05-15"]
    assert [row["top_symbols"] for row in result["results"]] == [["CCC"], ["BBB"], ["AAA"]]
    assert ("bhavcopy_ingestion_log", {"status": ["success", "already_done"]}, 3) in client.queries


def test_recent_trade_dates_falls_back_to_unique_daily_ohlcv_pages():
    client = _BacktestClient(
        date_rows=[
            {"trade_date": "2026-05-15"},
            {"trade_date": "2026-05-15"},
            {"trade_date": "2026-05-14"},
            {"trade_date": "2026-05-14"},
            {"trade_date": "2026-05-13"},
        ],
    )

    assert backtest._recent_trade_dates(client, 3) == ["2026-05-13", "2026-05-14", "2026-05-15"]


def test_recent_trade_dates_fills_partial_ingestion_log_from_daily_rows():
    client = _BacktestClient(
        log_dates=["2026-05-15"],
        date_rows=[
            {"trade_date": "2026-05-15"},
            {"trade_date": "2026-05-15"},
            {"trade_date": "2026-05-14"},
            {"trade_date": "2026-05-13"},
            {"trade_date": "2026-05-12"},
        ],
    )

    assert backtest._recent_trade_dates(client, 3) == ["2026-05-13", "2026-05-14", "2026-05-15"]
