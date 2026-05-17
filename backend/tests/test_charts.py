import os
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")

from app.routers import charts  # noqa: E402


class _FakeRequest:
    headers = {}
    client = SimpleNamespace(host="127.0.0.1")


class _MaybeSingleQuery:
    def select(self, *_args, **_kwargs):
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def maybe_single(self):
        return self

    def execute(self):
        return None


class _FakeSupabase:
    def table(self, _name):
        return _MaybeSingleQuery()


class _Result:
    def __init__(self, data):
        self.data = data


class _CandleQuery:
    def __init__(self, rows):
        self.rows = rows
        self.offset = 0
        self.end = 999

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def gte(self, *_args, **_kwargs):
        return self

    def lte(self, *_args, **_kwargs):
        return self

    def order(self, *_args, **_kwargs):
        return self

    def range(self, offset, end):
        self.offset = offset
        self.end = end
        return self

    def execute(self):
        return _Result(self.rows[self.offset:self.end + 1])


class _FakeCandleClient:
    def __init__(self, rows):
        self.rows = rows

    def table(self, table_name):
        assert table_name == "daily_ohlcv"
        return _CandleQuery(self.rows)


class _TableQuery:
    def __init__(self, rows):
        self.rows = rows
        self.filters = {}

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, key, value):
        self.filters[key] = value
        return self

    def maybe_single(self):
        return self

    def execute(self):
        for row in self.rows:
            if all(row.get(key) == value for key, value in self.filters.items()):
                return _Result(row)
        return _Result(None)


class _AliasClient:
    def table(self, table_name):
        if table_name == "stock_universe":
            return _TableQuery([
                {"symbol": "CARYSIL", "company_name": "Carysil Ltd", "sector": "Consumer Durables", "series": "EQ"}
            ])
        if table_name == "symbol_aliases":
            return _TableQuery([
                {"alias_symbol": "ACRYSIL", "current_symbol": "CARYSIL", "alias_type": "rename", "notes": "Historical NSE symbol"}
            ])
        raise AssertionError(table_name)


def _daily_row(day: str, close: float = 100.0):
    return {
        "trade_date": day,
        "open": close - 1,
        "high": close + 2,
        "low": close - 2,
        "close": close,
        "volume": 100000,
        "prev_close": close - 1,
        "avg_volume_20d": 100000,
        "rsi_14": 55,
        "ema_20": close - 2,
        "ema_50": close - 4,
        "ema_200": close - 8,
        "atr_14": 3,
        "week_52_high": close + 20,
        "week_52_low": close - 20,
    }


@pytest.mark.anyio
async def test_get_layout_returns_default_when_no_saved_layout(monkeypatch):
    monkeypatch.setattr(charts, "get_admin_client", lambda: _FakeSupabase())

    layout = await charts.get_layout("reliance", user_id="user-123")

    assert layout == {
        "symbol": "RELIANCE",
        "timeframe": "D",
        "indicators": [],
        "drawing_tools": [],
    }


def test_fetch_candle_rows_paginates_five_year_history():
    rows = [{"trade_date": f"2020-01-{(idx % 28) + 1:02d}", "close": idx} for idx in range(1250)]

    fetched = charts._fetch_candle_rows(_FakeCandleClient(rows), "AUBANK", limit=1250)

    assert len(fetched) == 1250
    assert fetched[0]["close"] == 0
    assert fetched[-1]["close"] == 1249


def test_resolve_chart_symbol_uses_alias_mapping():
    symbol, meta, alias = charts._resolve_chart_symbol(_AliasClient(), "ACRYSIL")

    assert symbol == "CARYSIL"
    assert meta["company_name"] == "Carysil Ltd"
    assert alias["alias_type"] == "rename"


def test_normalize_eod_timeframe_rejects_intraday():
    assert charts._normalize_eod_timeframe("d") == "D"
    assert charts._normalize_eod_timeframe("W") == "W"

    with pytest.raises(HTTPException) as exc:
        charts._normalize_eod_timeframe("5m")

    assert exc.value.status_code == 422
    assert "Intraday candle data is not available" in exc.value.detail


@pytest.mark.anyio
async def test_get_candles_returns_chart_coverage_metadata(monkeypatch):
    rows = [_daily_row("2026-01-01", 100), _daily_row("2026-01-02", 104)]
    monkeypatch.setattr(charts, "get_admin_client", lambda: _FakeCandleClient(rows))
    monkeypatch.setattr(
        charts,
        "_resolve_chart_symbol",
        lambda _client, symbol: (symbol, {"company_name": "Aubank", "sector": "Financial Services"}, None),
    )

    response = await charts.get_candles(
        "AUBANK",
        timeframe="D",
        from_date="2025-01-01",
        to_date="2026-01-02",
        limit=270,
        adjusted=False,
    )

    assert response["source"] == "NSE bhavcopy"
    assert response["source_metadata"]["as_of"] == "2026-01-02"
    assert response["coverage"] == {
        "requested_from": "2025-01-01",
        "requested_to": "2026-01-02",
        "available_from": "2026-01-01",
        "available_to": "2026-01-02",
        "returned_candles": 2,
        "requested_limit": 270,
        "timeframe": "D",
        "requested_days": 366,
        "covered_days": 1,
        "coverage_pct": 0.3,
        "partial": True,
        "partial_reason": "history_starts_after_requested_window",
        "source_name": "NSE bhavcopy",
        "as_of": "2026-01-02",
    }


@pytest.mark.anyio
async def test_get_weekly_candles_coverage_uses_aggregated_dates(monkeypatch):
    rows = [
        _daily_row("2026-01-01", 100),
        _daily_row("2026-01-02", 102),
        _daily_row("2026-01-08", 104),
        _daily_row("2026-01-09", 106),
    ]
    monkeypatch.setattr(charts, "get_admin_client", lambda: _FakeCandleClient(rows))
    monkeypatch.setattr(
        charts,
        "_resolve_chart_symbol",
        lambda _client, symbol: (symbol, {"company_name": "Aubank", "sector": "Financial Services"}, None),
    )

    response = await charts.get_candles(
        "AUBANK",
        timeframe="W",
        from_date="2026-01-01",
        to_date="2026-01-09",
        limit=10,
        adjusted=False,
    )

    assert response["coverage"]["available_from"] == response["candles"][0]["time"]
    assert response["coverage"]["available_to"] == response["candles"][-1]["time"]
    assert response["coverage"]["returned_candles"] == len(response["candles"])


@pytest.mark.anyio
async def test_live_candles_metadata_uses_latest_provider_bar(monkeypatch):
    class _Provider:
        name = "fake"

        def live_candles(self, _symbol, timeframe, limit, _identity):
            return {
                "symbol": "AUBANK",
                "timeframe": timeframe,
                "source": "fake provider",
                "candles": [
                    {"time": "2026-01-01", "open": 1, "high": 2, "low": 1, "close": 2, "volume": 10},
                    {"time": "2026-01-02", "open": 2, "high": 3, "low": 2, "close": 3, "volume": 20},
                ],
                "latest": {"close": 3},
            }

    monkeypatch.setattr(charts, "get_market_data_provider", lambda: _Provider())
    monkeypatch.setattr(charts, "_lookup_market_identity", lambda _symbol: charts.MarketIdentity())

    response = await charts.get_candles_live("AUBANK", _FakeRequest(), timeframe="D", limit=5)

    assert response["source_metadata"]["as_of"] == "2026-01-02"
    assert response["coverage"]["available_to"] == "2026-01-02"
    assert response["coverage"]["source_name"] == "fake provider"
