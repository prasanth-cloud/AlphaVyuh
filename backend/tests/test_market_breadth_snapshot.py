from app.services.market_breadth_snapshot import _fetch_daily_rows


class _Result:
    def __init__(self, data):
        self.data = data


class _Query:
    def __init__(self, rows):
        self.rows = rows
        self.offset = 0
        self.end = 999

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def range(self, offset, end):
        self.offset = offset
        self.end = end
        return self

    def execute(self):
        return _Result(self.rows[self.offset:self.end + 1])


class _Client:
    def __init__(self, rows):
        self.rows = rows

    def table(self, table_name):
        assert table_name == "daily_ohlcv"
        return _Query(self.rows)


def test_fetch_daily_rows_paginates_past_postgrest_default_page_size():
    rows = [{"symbol": f"SYM{i}"} for i in range(2300)]

    fetched = _fetch_daily_rows(_Client(rows), "2026-05-11")

    assert len(fetched) == 2300
    assert fetched[0]["symbol"] == "SYM0"
    assert fetched[-1]["symbol"] == "SYM2299"
