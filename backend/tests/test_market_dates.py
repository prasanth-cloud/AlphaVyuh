from app.services.market_dates import get_latest_complete_trade_date


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
            "close": 100,
            "prev_close": 99,
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


def test_latest_complete_trade_date_falls_back_when_universe_count_unavailable():
    rows = [
        *_date_rows("2026-05-11", 1001),
        *_date_rows("2026-05-08", 900),
    ]
    client = _Client(rows, active_count=None)

    assert get_latest_complete_trade_date(client) == "2026-05-11"
