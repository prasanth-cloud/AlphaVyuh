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
