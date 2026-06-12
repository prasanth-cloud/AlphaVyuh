import pytest

from app.services.market_breadth_snapshot import (
    SNAPSHOT_RUN_ID_PREFIX,
    _fetch_daily_rows,
    build_market_breadth_snapshot,
    read_latest_market_breadth_snapshot,
)


class _Result:
    def __init__(self, data=None, count=None):
        self.data = data
        self.count = count


class _Query:
    def __init__(self, table_name, rows, count=None):
        self.table_name = table_name
        self.rows = rows
        self.count = count
        self.offset = 0
        self.end = 999
        self.single = False

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, column, value):
        if self.table_name == "ingest_runs" and column == "run_id":
            self.rows = [row for row in self.rows if row.get("run_id") == value]
        return self

    def lte(self, *_args, **_kwargs):
        return self

    def like(self, *_args, **_kwargs):
        return self

    def order(self, *_args, **_kwargs):
        return self

    def limit(self, *_args, **_kwargs):
        return self

    def range(self, offset, end):
        self.offset = offset
        self.end = end
        return self

    def maybe_single(self):
        self.single = True
        return self

    def execute(self):
        if self.table_name == "stock_universe":
            return _Result(count=self.count)
        if self.table_name == "ingest_runs" and self.single:
            return _Result(self.rows[0] if self.rows else None)
        return _Result(self.rows[self.offset:self.end + 1], count=len(self.rows))


class _Client:
    def __init__(self, rows, *, active_count=2500, ingest_rows=None):
        self.rows = rows
        self.active_count = active_count
        self.ingest_rows = ingest_rows or []

    def table(self, table_name):
        if table_name == "stock_universe":
            return _Query(table_name, [], count=self.active_count)
        if table_name == "ingest_runs":
            return _Query(table_name, self.ingest_rows)
        assert table_name == "daily_ohlcv"
        return _Query(table_name, self.rows)


def _breadth_row(index, trade_date="2026-05-11", pct_change=1.0):
    close = 100 + (pct_change / 100)
    return {
        "symbol": f"SYM{index}",
        "trade_date": trade_date,
        "open": 99,
        "high": 102,
        "low": 98,
        "close": close,
        "prev_close": 100,
        "volume": 100000 + index,
        "avg_volume_20d": 90000 + index,
        "week_52_high": 130,
        "week_52_low": 80,
        "rsi_14": 55,
        "ema_20": 98,
        "ema_50": 96,
        "ema_200": 90,
        "atr_14": 2,
        "pct_change": pct_change,
        "stock_universe": {
            "symbol": f"SYM{index}",
            "company_name": f"Symbol {index}",
            "series": "EQ",
            "sector": "Technology",
            "market": "NSE",
            "is_active": True,
        },
    }


def _daily_row(symbol, sector, close, prev_close):
    return {
        "symbol": symbol,
        "close": close,
        "prev_close": prev_close,
        "open": prev_close,
        "high": close,
        "low": prev_close,
        "volume": 1000,
        "avg_volume_20d": 1000,
        "week_52_high": close * 1.1,
        "week_52_low": close * 0.8,
        "rsi_14": 55,
        "ema_20": close - 1,
        "ema_50": close - 2,
        "ema_200": close - 3,
        "atr_14": 2,
        "pct_change": None,
        "stock_universe": {
            "symbol": symbol,
            "company_name": symbol,
            "series": "EQ",
            "sector": sector,
            "market": "NSE",
            "is_active": True,
        },
    }


def test_fetch_daily_rows_paginates_past_postgrest_default_page_size():
    rows = [{"symbol": f"SYM{i}"} for i in range(2300)]

    fetched = _fetch_daily_rows(_Client(rows), "2026-05-11")

    assert len(fetched) == 2300
    assert fetched[0]["symbol"] == "SYM0"
    assert fetched[-1]["symbol"] == "SYM2299"


def test_build_market_breadth_snapshot_rejects_implausibly_flat_distribution():
    rows = [_breadth_row(index, pct_change=0) for index in range(2300)]

    with pytest.raises(ValueError, match="implausibly flat breadth"):
        build_market_breadth_snapshot(_Client(rows), "2026-05-11")


def test_read_latest_market_breadth_snapshot_skips_implausibly_flat_snapshot():
    bad_overview = {
        "trade_date": "2026-05-11",
        "advances": 0,
        "declines": 2,
        "unchanged": 2462,
        "total": 2464,
        "coverage_pct": 98.6,
        "universe_active": 2500,
    }
    good_overview = {
        "trade_date": "2026-05-08",
        "advances": 1200,
        "declines": 950,
        "unchanged": 120,
        "total": 2270,
        "coverage_pct": 90.8,
        "universe_active": 2500,
    }
    ingest_rows = [
        {
            "run_id": f"{SNAPSHOT_RUN_ID_PREFIX}-2026-05-11",
            "started_at": "2026-05-11T18:00:00Z",
            "meta": {"overview": bad_overview},
        },
        {
            "run_id": f"{SNAPSHOT_RUN_ID_PREFIX}-2026-05-08",
            "started_at": "2026-05-08T18:00:00Z",
            "meta": {"overview": good_overview},
        },
    ]

    snapshot = read_latest_market_breadth_snapshot(
        _Client([], ingest_rows=ingest_rows),
        indices=[],
        quote_source="latest_complete_session",
        indices_live=False,
    )

    assert snapshot["trade_date"] == "2026-05-08"
    assert snapshot["advances"] == 1200


def test_breadth_snapshot_does_not_hide_small_sector_taxonomy():
    rows = [
        _daily_row("AAA", "Tiny Sector", 102, 100),
        _daily_row("BBB", "Tiny Sector", 101, 100),
        _daily_row("CCC", "Financial Services", 99, 100),
        _daily_row("DDD", "Financial Services", 98, 100),
        _daily_row("EEE", "Financial Services", 103, 100),
    ]

    snapshot = build_market_breadth_snapshot(_Client(rows), "2026-05-11")

    sector_names = {item["sector"] for item in snapshot["sector_breadth"]}
    assert "Tiny Sector" in sector_names
    taxonomy = snapshot["sector_taxonomy"]
    assert taxonomy["display_filter"]["minimum_active_symbols"] == 1
    assert taxonomy["display_filter"]["hidden_sector_count"] == 0
    tiny = next(item for item in taxonomy["sector_counts"] if item["sector"] == "Tiny Sector")
    assert tiny["active_count"] == 2
    assert tiny["hidden_by_filter"] is False
