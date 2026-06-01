import asyncio
import os

import pytest
from fastapi import HTTPException

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")

from app.routers import scanner  # noqa: E402


class _Result:
    def __init__(self, data=None, count=None):
        self.data = data
        self.count = count


class _FailingQuery:
    def __getattr__(self, _name):
        return lambda *args, **kwargs: self

    def execute(self):
        raise RuntimeError("scanner query down")


class _FailingClient:
    def table(self, _name):
        return _FailingQuery()


class _ScreensQuery:
    def __init__(self, data=None):
        self.data = data if data is not None else []

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def order(self, *_args, **_kwargs):
        return self

    def execute(self):
        return _Result(self.data)


class _ScreensClient:
    def __init__(self, data=None):
        self.data = data

    def table(self, table_name):
        assert table_name == "saved_screens"
        return _ScreensQuery(self.data)


class _VcpRpcQuery:
    def __init__(self, symbols):
        self.symbols = symbols

    def execute(self):
        if "BROKEN" in self.symbols:
            raise RuntimeError("vcp lookback down")
        return _Result([
            {"symbol": symbol, "history": [{"close": 100}, {"close": 102}]}
            for symbol in self.symbols
        ])


class _VcpClient:
    def rpc(self, function_name, params):
        assert function_name == "get_vcp_lookback"
        return _VcpRpcQuery(params["p_symbols"])


def _scanner_row(symbol):
    return {
        "symbol": symbol,
        "open": 101,
        "high": 110,
        "low": 99,
        "close": 105,
        "prev_close": 100,
        "volume": 100_000,
        "avg_volume_20d": 100_000,
        "avg_volume_50d": 120_000,
        "turnover": 10_000_000,
        "rsi_14": 60,
        "ema_20": 100,
        "ema_50": 95,
        "ema_150": 91,
        "ema_200": 90,
        "ema_200_slope_30d": 2.4,
        "sma_50": 96,
        "sma_150": 92,
        "sma_200": 88,
        "atr_14": 2,
        "week_52_high": 110,
        "week_52_low": 70,
        "price_perf_6m_pct": 24.5,
        "high_3w": 110,
        "low_3w": 98,
        "darvas_box_height_pct": 12.2,
        "is_nr7": False,
        "rs_score": 80,
        "volume_ratio": 1.0,
        "w52h_pct": None,
        "w52l_pct": None,
        "stock_universe": {
            "company_name": f"{symbol} Ltd",
            "series": "EQ",
            "sector": "Test",
            "is_active": True,
            "market": "NSE",
            "currency": "INR",
            "market_cap_category": "midcap",
            "market_cap_cr": 1200,
        },
    }


class _ScannerQuery:
    def __init__(self, table_name, rows, universe_count):
        self.table_name = table_name
        self.rows = rows
        self.universe_count = universe_count

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def gte(self, *_args, **_kwargs):
        return self

    def lte(self, *_args, **_kwargs):
        return self

    def gt(self, *_args, **_kwargs):
        return self

    def in_(self, *_args, **_kwargs):
        return self

    def limit(self, *_args, **_kwargs):
        return self

    def execute(self):
        if self.table_name == "stock_universe":
            return _Result([], count=self.universe_count)
        return _Result(self.rows)


class _ScannerClient:
    def __init__(self, rows, universe_count):
        self.rows = rows
        self.universe_count = universe_count

    def table(self, table_name):
        return _ScannerQuery(table_name, self.rows, self.universe_count)


def test_run_scanner_raises_503_when_admin_client_is_unavailable(monkeypatch):
    monkeypatch.setattr(scanner.scanner_limiter, "is_allowed", lambda user_id: True)
    monkeypatch.setattr(scanner, "get_admin_client", lambda: (_ for _ in ()).throw(RuntimeError("db down")))

    with pytest.raises(HTTPException) as exc:
        asyncio.run(scanner.run_scanner(scanner.ScanRequest(), user_id="user-1"))

    assert exc.value.status_code == 503
    assert exc.value.detail == "Scanner data is temporarily unavailable."


def test_execute_scan_raises_503_when_trade_date_is_unavailable(monkeypatch):
    monkeypatch.setattr(scanner, "get_latest_complete_trade_date", lambda client: None)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(scanner.execute_scan(object(), scanner.ScanRequest(), plan="pro"))

    assert exc.value.status_code == 503
    assert exc.value.detail == "No complete trade date is available for scanner."


def test_execute_scan_raises_503_when_primary_and_fallback_queries_fail():
    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            scanner.execute_scan(
                _FailingClient(),
                scanner.ScanRequest(),
                plan="pro",
                trade_date="2026-05-19",
            )
        )

    assert exc.value.status_code == 503
    assert exc.value.detail == "Scanner query could not complete; try a narrower preset."


def test_execute_scan_reports_query_reduction_without_marking_data_degraded():
    result = asyncio.run(
        scanner.execute_scan(
            _ScannerClient([_scanner_row("AAA"), _scanner_row("BBB")], universe_count=1000),
            scanner.ScanRequest(
                filters=scanner.ScanFilters(
                    rs_score_min=70,
                    avg_volume_50d_min=100000,
                    series=["EQ"],
                ),
                page_size=25,
            ),
            plan="pro",
            trade_date="2026-05-19",
        )
    )

    assert result["query_rows"] == 2
    assert result["source_rows"] == 2
    assert result["query_row_reduction_pct"] == 99.8
    assert result["coverage_pct"] is None
    assert result["source_metadata"]["mode"] == "eod"
    assert result["source_metadata"]["confidence"] == "healthy"
    assert result["source_metadata"]["scanner_performance"] == {
        "query_rows": 2,
        "universe_size": 1000,
        "query_row_reduction_pct": 99.8,
        "db_prefilters_applied": [
            {"op": "eq", "column": "stock_universe.is_active", "value": True},
            {"op": "in_", "column": "stock_universe.series", "value": ["EQ"]},
            {"op": "gte", "column": "rs_score", "value": 70},
            {"op": "gte", "column": "avg_volume_50d", "value": 100000},
        ],
        "fallback_query": False,
    }


def test_list_screens_keeps_valid_empty_state(monkeypatch):
    monkeypatch.setattr(scanner, "get_admin_client", lambda: _ScreensClient(data=[]))

    assert asyncio.run(scanner.list_screens(user_id="user-1")) == {"screens": []}


def test_list_screens_raises_503_when_saved_screen_query_fails(monkeypatch):
    monkeypatch.setattr(scanner, "get_admin_client", lambda: _FailingClient())

    with pytest.raises(HTTPException) as exc:
        asyncio.run(scanner.list_screens(user_id="user-1"))

    assert exc.value.status_code == 503
    assert exc.value.detail == "Saved scanner screens are temporarily unavailable."


def test_vcp_pass2_raises_503_when_any_lookback_chunk_fails(monkeypatch):
    monkeypatch.setattr(scanner, "VCP_RPC_CHUNK", 1)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            scanner._run_vcp_pass2(
                _VcpClient(),
                [{"symbol": "RELIANCE"}, {"symbol": "BROKEN"}],
                "2026-05-20",
                scanner.ScanFilters(vcp_min_pivots=2),
            )
        )

    assert exc.value.status_code == 503
    assert exc.value.detail == "VCP scanner lookback is temporarily unavailable."
