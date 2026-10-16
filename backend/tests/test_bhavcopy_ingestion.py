import asyncio
import importlib.util
import os
from datetime import date
from pathlib import Path
from types import SimpleNamespace

import pandas as pd
import pytest

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")

from app.services import bhavcopy


TRADE_DATE = date(2026, 10, 14)
SOURCE_URL = "https://nsearchives.nseindia.com/products/content/sec_bhavdata_full_14102026.csv"


class Query:
    def __init__(self, client, table):
        self.client = client
        self.table = table
        self.filters = []
        self.payload = None
        self.operation = "select"
        self.count = False
        self.start = 0
        self.end = 999

    def select(self, _fields, **kwargs):
        self.count = kwargs.get("count") == "exact"
        return self

    def eq(self, field, value):
        self.filters.append(lambda row: row.get(field) == value)
        return self

    def in_(self, field, values):
        self.filters.append(lambda row: row.get(field) in values)
        return self

    def lte(self, field, value):
        self.filters.append(lambda row: row.get(field) <= value)
        return self

    def gte(self, field, value):
        self.filters.append(lambda row: row.get(field) >= value)
        return self

    def order(self, *_args, **_kwargs):
        return self

    def range(self, start, end):
        self.start, self.end = start, end
        return self

    def upsert(self, payload, **_kwargs):
        self.operation = "upsert"
        self.payload = payload if isinstance(payload, list) else [payload]
        return self

    def update(self, payload):
        self.operation = "update"
        self.payload = payload
        return self

    def execute(self):
        rows = self.client.tables[self.table]
        selected = [row for row in rows if all(predicate(row) for predicate in self.filters)]
        if self.operation == "upsert":
            keys = {"stock_universe": ["symbol"], "daily_ohlcv": ["symbol", "trade_date"], "bhavcopy_ingestion_log": ["trade_date"]}[self.table]
            for payload in self.payload:
                existing = next((row for row in rows if all(row[key] == payload[key] for key in keys)), None)
                if existing is None:
                    rows.append(dict(payload))
                else:
                    existing.update(payload)
            return SimpleNamespace(data=self.payload)
        if self.operation == "update":
            for row in selected:
                row.update(self.payload)
        return SimpleNamespace(data=selected[self.start:self.end + 1], count=len(selected) if self.count else None)


class Client:
    def __init__(self, universe=None, candles=None, receipt=None):
        self.tables = {
            "stock_universe": universe or [],
            "daily_ohlcv": candles or [],
            "bhavcopy_ingestion_log": [receipt] if receipt else [],
        }

    def table(self, name):
        return Query(self, name)

    def rpc(self, *_args, **_kwargs):
        return SimpleNamespace(execute=lambda: SimpleNamespace(data=None))


def csv_bytes(trade_date="14-Oct-2026", include_date=True):
    header = "SYMBOL,SERIES,OPEN_PRICE,HIGH_PRICE,LOW_PRICE,CLOSE_PRICE,PREV_CLOSE,TTL_TRD_QNTY"
    rows = ["AUBANK,EQ,100,110,90,105,99,100000", "NEW,EQ,50,55,45,52,51,200000"]
    if include_date:
        header += ",DATE1"
        rows = [f"{row},{trade_date}" for row in rows]
    return ("\n".join([header, *rows]) + "\n" * 600).encode()


def prepare_ingest(monkeypatch, client, content=None):
    calls = []

    def get(url, **_kwargs):
        calls.append(url)
        return SimpleNamespace(content=content or csv_bytes(), raise_for_status=lambda: None)

    monkeypatch.setattr(bhavcopy, "get_admin_client", lambda: client)
    monkeypatch.setattr(bhavcopy.requests, "Session", lambda: SimpleNamespace(get=get))
    monkeypatch.setattr(bhavcopy, "invalidate_scanner_cache", lambda *_args: None)
    from app.services import market_breadth_snapshot
    monkeypatch.setattr(market_breadth_snapshot, "persist_market_breadth_snapshot", lambda *_args: {})
    return calls


def test_current_csv_preserves_known_universe_metadata(monkeypatch):
    client = Client(universe=[{
        "symbol": "AUBANK", "company_name": "AU Small Finance Bank", "isin": "INE949L01017",
        "series": "EQ", "is_active": True, "sector": "Banking",
    }])
    prepare_ingest(monkeypatch, client)

    asyncio.run(bhavcopy.download_and_ingest(TRADE_DATE))

    known, added = client.tables["stock_universe"]
    assert known["company_name"] == "AU Small Finance Bank"
    assert known["isin"] == "INE949L01017"
    assert known["sector"] == "Banking"
    assert added["company_name"] == "NEW"
    assert added["isin"] is None
    assert client.tables["daily_ohlcv"][0]["trade_date"] == "2026-10-14"
    assert client.tables["daily_ohlcv"][0]["close"] == 105


@pytest.mark.parametrize("content", [csv_bytes("13-Oct-2026"), csv_bytes(include_date=False)], ids=["wrong-date", "missing-date"])
def test_wrong_or_missing_source_date_cannot_write_target_candles(monkeypatch, content):
    client = Client()
    prepare_ingest(monkeypatch, client, content)

    with pytest.raises(ValueError, match="trade date"):
        asyncio.run(bhavcopy.download_and_ingest(TRADE_DATE))

    assert client.tables["stock_universe"] == []
    assert client.tables["daily_ohlcv"] == []
    assert client.tables["bhavcopy_ingestion_log"][0]["status"] == "failed"


@pytest.mark.parametrize("receipt,candle_count", [
    ({"status": "success", "rows_ingested": 45, "expected_rows": 2000, "partial_ingest": False}, 45),
    ({"status": "success", "rows_ingested": 100, "expected_rows": 100, "partial_ingest": True}, 100),
    ({"status": "success", "rows_ingested": 100, "expected_rows": 100, "partial_ingest": False}, 0),
])
def test_incomplete_success_receipt_does_not_skip_full_ingest(monkeypatch, receipt, candle_count):
    candles = [{"symbol": f"S{index}", "trade_date": "2026-10-14"} for index in range(candle_count)]
    receipt.update(trade_date="2026-10-14", source_url=SOURCE_URL)
    client = Client(candles=candles, receipt=receipt)
    calls = prepare_ingest(monkeypatch, client)
    monkeypatch.setattr(bhavcopy, "_compute_indicators_bulk", lambda *_args: [])

    result = asyncio.run(bhavcopy.download_and_ingest(TRADE_DATE))

    assert SOURCE_URL in calls
    assert result["status"] != "already_done"
    assert any(row["symbol"] == "AUBANK" and row["close"] == 105 for row in client.tables["daily_ohlcv"])


def test_complete_success_receipt_and_stored_rows_skip_download(monkeypatch):
    receipt = {"trade_date": "2026-10-14", "status": "success", "rows_ingested": 100,
               "expected_rows": 100, "partial_ingest": False, "source_url": SOURCE_URL}
    candles = [{"symbol": f"S{index}", "trade_date": "2026-10-14"} for index in range(100)]
    client = Client(candles=candles, receipt=receipt)
    calls = prepare_ingest(monkeypatch, client)

    result = asyncio.run(bhavcopy.download_and_ingest(TRADE_DATE))

    assert result["status"] == "already_done"
    assert result["rows_ingested"] == 100
    assert calls == []


def test_complete_session_uses_source_count_and_can_skip_a_repeat(monkeypatch):
    client = Client(universe=[{"symbol": "ABSENT", "series": "EQ", "is_active": True}])
    calls = prepare_ingest(monkeypatch, client)

    first = asyncio.run(bhavcopy.download_and_ingest(TRADE_DATE))
    second = asyncio.run(bhavcopy.download_and_ingest(TRADE_DATE))

    assert first["expected_rows"] == 2
    assert first["rows_ingested"] == 2
    assert first["coverage_pct"] == 100
    assert first["partial_ingest"] is False
    assert second["status"] == "already_done"
    assert calls.count(SOURCE_URL) == 1


def test_discarded_source_prices_remain_in_expected_count(monkeypatch):
    client = Client()
    content = csv_bytes().replace(b"NEW,EQ,50,55,45,52", b"NEW,EQ,50,55,45,invalid")
    prepare_ingest(monkeypatch, client, content)

    result = asyncio.run(bhavcopy.download_and_ingest(TRADE_DATE))

    assert result["expected_rows"] == 2
    assert result["rows_ingested"] == 1
    assert result["coverage_pct"] == 50
    assert result["status"] == "partial"
    assert result["partial_ingest"] is True


def test_source_without_supported_series_cannot_report_success(monkeypatch):
    client = Client()
    prepare_ingest(monkeypatch, client, csv_bytes().replace(b",EQ,", b",ZZ,"))

    with pytest.raises(ValueError, match="supported"):
        asyncio.run(bhavcopy.download_and_ingest(TRADE_DATE))

    assert client.tables["daily_ohlcv"] == []


def load_backfill(monkeypatch):
    import dotenv
    monkeypatch.setattr(dotenv, "load_dotenv", lambda *_args, **_kwargs: None)
    spec = importlib.util.spec_from_file_location("test_bhavcopy_backfill", Path(__file__).resolve().parents[1] / "scripts/backfill_bhavcopy.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_backfill_keeps_discarded_source_rows_in_coverage(monkeypatch):
    backfill = load_backfill(monkeypatch)
    client = Client()
    content = csv_bytes().replace(b"NEW,EQ,50,55,45,52", b"NEW,EQ,50,55,45,invalid")
    response = SimpleNamespace(content=content, status_code=200, raise_for_status=lambda: None)
    session = SimpleNamespace(get=lambda *_args, **_kwargs: response)
    downloaded = backfill._download_csv(TRADE_DATE, session)
    assert isinstance(downloaded, tuple)
    assert downloaded[1] == 2
    monkeypatch.setattr(backfill, "get_admin_client", lambda: client)
    monkeypatch.setattr(backfill, "_download_csv", lambda *_args: downloaded)
    monkeypatch.setattr(backfill.requests, "Session", lambda: session)
    monkeypatch.setattr(backfill.time, "sleep", lambda *_args: None)

    asyncio.run(backfill.backfill(start_date=TRADE_DATE, end_date=TRADE_DATE, update_universe=True, compute_indicators=False))

    receipt = client.tables["bhavcopy_ingestion_log"][0]
    assert receipt["expected_rows"] == 2
    assert receipt["rows_ingested"] == 1
    assert receipt["status"] == "partial"
    assert receipt["partial_ingest"] is True


@pytest.mark.parametrize("update_universe", [False, True])
def test_backfill_receipt_distinguishes_selected_universe_from_full_csv(monkeypatch, update_universe):
    backfill = load_backfill(monkeypatch)
    client = Client(universe=[{"symbol": "AUBANK", "series": "EQ", "is_active": True,
                              "company_name": "AU Small Finance Bank", "isin": "INE949L01017"}])
    frame = pd.DataFrame([
        {"symbol": "AUBANK", "series": "EQ", "open": 100, "high": 110, "low": 90, "close": 105, "volume": 100000},
        {"symbol": "NEW", "series": "EQ", "open": 50, "high": 55, "low": 45, "close": 52, "volume": 200000},
    ])
    monkeypatch.setattr(backfill, "get_admin_client", lambda: client)
    monkeypatch.setattr(backfill, "_download_csv", lambda *_args: (frame.copy(), 2))
    monkeypatch.setattr(backfill.requests, "Session", lambda: SimpleNamespace(get=lambda *_args, **_kwargs: None))
    monkeypatch.setattr(backfill.time, "sleep", lambda *_args: None)

    asyncio.run(backfill.backfill(start_date=TRADE_DATE, end_date=TRADE_DATE, update_universe=update_universe, compute_indicators=False))

    receipt = client.tables["bhavcopy_ingestion_log"][0]
    assert receipt["status"] == ("success" if update_universe else "partial")
    assert receipt["rows_ingested"] == (2 if update_universe else 1)
    assert receipt["expected_rows"] == 2
    assert receipt["partial_ingest"] is (not update_universe)
    assert receipt["source_url"] == SOURCE_URL
    assert client.tables["stock_universe"][0]["company_name"] == "AU Small Finance Bank"
    assert client.tables["stock_universe"][0]["isin"] == "INE949L01017"


def test_backfill_cannot_skip_success_receipt_after_candles_were_removed(monkeypatch):
    backfill = load_backfill(monkeypatch)
    receipt = {"trade_date": "2026-10-14", "status": "success", "rows_ingested": 2,
               "expected_rows": 2, "partial_ingest": False, "source_url": SOURCE_URL}
    client = Client(universe=[{"symbol": "AUBANK", "series": "EQ", "is_active": True}], receipt=receipt)
    frame = pd.DataFrame([{"symbol": "AUBANK", "series": "EQ", "open": 100, "high": 110,
                           "low": 90, "close": 105, "volume": 100000}])
    monkeypatch.setattr(backfill, "get_admin_client", lambda: client)
    monkeypatch.setattr(backfill, "_download_csv", lambda *_args: (frame.copy(), 1))
    monkeypatch.setattr(backfill.requests, "Session", lambda: SimpleNamespace(get=lambda *_args, **_kwargs: None))
    monkeypatch.setattr(backfill.time, "sleep", lambda *_args: None)

    asyncio.run(backfill.backfill(start_date=TRADE_DATE, end_date=TRADE_DATE, compute_indicators=False))

    assert client.tables["daily_ohlcv"][0]["symbol"] == "AUBANK"
    assert client.tables["daily_ohlcv"][0]["close"] == 105


@pytest.mark.parametrize("sessions,missing_high", [(1, False), (252, False), (252, True)])
def test_backfill_recalculates_52_week_fields_without_retaining_short_history_factors(monkeypatch, sessions, missing_high):
    backfill = load_backfill(monkeypatch)
    candles = [
        {"symbol": "AUBANK", "trade_date": day.strftime("%Y-%m-%d"), "open": 100 + index,
         "high": 101.5 + index, "low": 98.5 + index, "close": 100 + index, "volume": 100000,
         "prev_close": 99 + index,
         "week_52_high": 9999, "week_52_low": 1, "w52h_pct": 9999, "w52l_pct": 9999,
         "is_new_52w_high": True, "is_new_52w_low": True}
        for index, day in enumerate(pd.bdate_range(end=TRADE_DATE, periods=sessions))
    ]
    if missing_high:
        candles[30]["high"] = None
    client = Client(universe=[{"symbol": "AUBANK", "is_active": True}], candles=candles)

    backfill._compute_and_update_indicators(client)

    latest = client.tables["daily_ohlcv"][-1]
    expected = {
        "week_52_high": 352.5, "week_52_low": 98.5, "w52h_pct": 0.4274, "w52l_pct": 256.3452,
        "is_new_52w_high": True, "is_new_52w_low": False,
    } if sessions == 252 and not missing_high else {
        "week_52_high": None, "week_52_low": None, "w52h_pct": None, "w52l_pct": None,
        "is_new_52w_high": None, "is_new_52w_low": None,
    }
    assert {field: latest[field] for field in expected} == expected
    assert latest["prev_close"] == (350 if sessions == 252 else 99)
