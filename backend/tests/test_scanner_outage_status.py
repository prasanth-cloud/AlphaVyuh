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

    def or_(self, *_args, **_kwargs):
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
        self.table_calls = []

    def table(self, table_name):
        self.table_calls.append(table_name)
        return _ScannerQuery(table_name, self.rows, self.universe_count)


def test_run_scanner_raises_503_when_admin_client_is_unavailable(monkeypatch):
    monkeypatch.setattr(scanner.scanner_limiter, "is_allowed", lambda user_id: True)
    monkeypatch.setattr(scanner, "get_admin_client", lambda: (_ for _ in ()).throw(RuntimeError("db down")))

    with pytest.raises(HTTPException) as exc:
        asyncio.run(scanner.run_scanner(scanner.ScanRequest(), user_id="user-1"))

    assert exc.value.status_code == 503
    assert exc.value.detail == "Scanner data is temporarily unavailable."


def test_execute_scan_raises_503_when_trade_date_is_unavailable(monkeypatch):
    scanner._latest_trade_date_cache = None
    monkeypatch.setattr(scanner, "get_latest_complete_trade_date", lambda client: None)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(scanner.execute_scan(object(), scanner.ScanRequest(), plan="pro"))

    assert exc.value.status_code == 503
    assert exc.value.detail == "No complete trade date is available for scanner."


def test_execute_scan_caches_latest_complete_trade_date(monkeypatch):
    scanner._latest_trade_date_cache = None
    scanner._universe_count_cache.clear()
    calls = {"latest_date": 0}

    def latest_date(_client):
        calls["latest_date"] += 1
        return "2026-05-19"

    monkeypatch.setattr(scanner, "get_latest_complete_trade_date", latest_date)
    client = _ScannerClient([_scanner_row("AAA"), _scanner_row("BBB")], universe_count=1000)
    body = scanner.ScanRequest(filters=scanner.ScanFilters(series=["EQ"]), page_size=25)

    first = asyncio.run(scanner.execute_scan(client, body, plan="pro"))
    second = asyncio.run(scanner.execute_scan(client, body, plan="pro"))

    assert first["trade_date"] == "2026-05-19"
    assert second["trade_date"] == "2026-05-19"
    assert calls["latest_date"] == 1
    scanner._latest_trade_date_cache = None
    scanner._universe_count_cache.clear()


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
    scanner._universe_count_cache.clear()
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
    scanner_performance = result["source_metadata"]["scanner_performance"]
    assert scanner_performance == {
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
        "timing_ms": scanner_performance["timing_ms"],
    }
    assert set(scanner_performance["timing_ms"]) == {
        "date_lookup",
        "query",
        "filter",
        "vcp",
        "score",
        "sort",
        "universe_count",
        "total",
    }
    assert all(value >= 0 for value in scanner_performance["timing_ms"].values())


def test_execute_scan_scores_only_visible_page_when_not_sorting_by_setup_score(monkeypatch):
    calls = []

    def score_setup(result, preset_id):
        calls.append((result["symbol"], preset_id))
        return {
            "setup_score": 77,
            "setup_grade": "B",
            "confidence_label": "Worth review",
            "confidence_reasons": ["test score"],
        }

    monkeypatch.setattr(scanner, "_score_setup", score_setup)
    rows = [_scanner_row(f"SYM{index:03d}") for index in range(250)]
    result = asyncio.run(
        scanner.execute_scan(
            _ScannerClient(rows, universe_count=1000),
            scanner.ScanRequest(sort_by="volume_ratio", page_size=25),
            plan="free",
            trade_date="2026-05-19",
        )
    )

    assert result["total_matches"] == 250
    assert result["plan_limit"] == 200
    assert result["visible_count"] == 25
    assert len(calls) == 25
    assert all(row["setup_score"] == 77 for row in result["results"])


def test_execute_scan_scores_all_matches_when_sorting_by_setup_score(monkeypatch):
    calls = []

    def score_setup(result, _preset_id):
        calls.append(result["symbol"])
        score = int(result["symbol"].removeprefix("SYM"))
        return {
            "setup_score": score,
            "setup_grade": "B",
            "confidence_label": "Worth review",
            "confidence_reasons": ["test score"],
        }

    monkeypatch.setattr(scanner, "_score_setup", score_setup)
    rows = [_scanner_row(f"SYM{index:03d}") for index in range(40)]
    result = asyncio.run(
        scanner.execute_scan(
            _ScannerClient(rows, universe_count=1000),
            scanner.ScanRequest(sort_by="setup_score", page_size=25),
            plan="free",
            trade_date="2026-05-19",
        )
    )

    assert len(calls) == 40
    assert [row["symbol"] for row in result["results"][:3]] == ["SYM039", "SYM038", "SYM037"]


def test_execute_scan_can_skip_return_payload_scoring(monkeypatch):
    calls = []

    def score_setup(result, _preset_id):
        calls.append(result["symbol"])
        return {
            "setup_score": 77,
            "setup_grade": "B",
            "confidence_label": "Worth review",
            "confidence_reasons": ["test score"],
        }

    monkeypatch.setattr(scanner, "_score_setup", score_setup)
    result = asyncio.run(
        scanner.execute_scan(
            _ScannerClient([_scanner_row("AAA"), _scanner_row("BBB")], universe_count=1000),
            scanner.ScanRequest(sort_by="volume_ratio", page_size=25),
            plan="pro",
            trade_date="2026-05-19",
            score_results=False,
        )
    )

    assert calls == []
    assert all("setup_score" not in row for row in result["results"])
    assert result["source_metadata"]["scanner_performance"]["timing_ms"]["score"] == 0


def test_execute_scan_caches_universe_count_for_repeated_scans():
    scanner._universe_count_cache.clear()
    client = _ScannerClient([_scanner_row("AAA"), _scanner_row("BBB")], universe_count=1000)
    body = scanner.ScanRequest(
        filters=scanner.ScanFilters(
            rs_score_min=70,
            volume_ratio_min=1.5,
            week_52_high_pct_max=10,
            series=["EQ"],
        ),
        page_size=25,
    )

    first = asyncio.run(scanner.execute_scan(client, body, plan="pro", trade_date="2026-05-19"))
    second = asyncio.run(scanner.execute_scan(client, body, plan="pro", trade_date="2026-05-19"))

    assert first["universe_size"] == 1000
    assert second["universe_size"] == 1000
    assert client.table_calls.count("stock_universe") == 1
    assert second["source_metadata"]["scanner_performance"]["db_prefilters_applied"][-3:] == [
        {"op": "or_", "column": "volume_ratio", "value": "volume_ratio.is.null,volume_ratio.gte.1.5"},
        {"op": "or_", "column": "w52h_pct", "value": "w52h_pct.is.null,w52h_pct.gte.-10"},
        {"op": "or_", "column": "w52h_pct", "value": "w52h_pct.is.null,w52h_pct.lte.10"},
    ]
    scanner._universe_count_cache.clear()


def test_scanner_selects_avoid_unmigrated_market_cap_category_column():
    assert "market_cap_category" not in scanner.SCANNER_BASE_SELECT
    assert "market_cap_category" not in scanner.SCANNER_INTELLIGENCE_SELECT


def test_execute_scan_can_skip_diagnostics_for_background_consumers():
    scanner._universe_count_cache.clear()
    client = _ScannerClient([_scanner_row("AAA"), _scanner_row("BBB")], universe_count=1000)

    result = asyncio.run(
        scanner.execute_scan(
            client,
            scanner.ScanRequest(
                filters=scanner.ScanFilters(
                    rs_score_min=70,
                    volume_ratio_min=1.0,
                    series=["EQ"],
                ),
                page_size=25,
            ),
            plan="pro",
            trade_date="2026-05-19",
            include_diagnostics=False,
        )
    )

    assert result["total_matches"] == 2
    assert result["universe_size"] is None
    assert result["query_row_reduction_pct"] is None
    assert result["db_prefilters_applied"] == []
    assert result["source_metadata"]["scanner_performance"]["universe_size"] is None
    assert result["source_metadata"]["scanner_performance"]["db_prefilters_applied"] == []
    assert client.table_calls.count("stock_universe") == 0


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
