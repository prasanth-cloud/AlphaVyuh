import os

import pytest

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")

from app.routers import charts  # noqa: E402


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
