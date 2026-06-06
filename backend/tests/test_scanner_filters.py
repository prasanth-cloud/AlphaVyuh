"""Tests for scanner filter logic (no DB required)."""
import os
import random

import pytest

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")


def _apply_numeric_filter(value, min_val, max_val):
    if min_val is not None and value < min_val:
        return False
    if max_val is not None and value > max_val:
        return False
    return True


def _apply_bool_filter(value, required):
    if required is True and value is not True:
        return False
    return True


def _apply_market_filter(market_code, filter_val):
    if filter_val is None:
        return True
    nse_bse = {"NSE", "BSE"}
    us_markets = {"NASDAQ", "NYSE"}
    if filter_val == "IN":
        return market_code in nse_bse
    if filter_val == "US":
        return market_code in us_markets
    return market_code == filter_val


class TestNumericFilter:
    def test_within_range(self):
        assert _apply_numeric_filter(100, 50, 200) is True

    def test_below_min(self):
        assert _apply_numeric_filter(30, 50, 200) is False

    def test_above_max(self):
        assert _apply_numeric_filter(300, 50, 200) is False

    def test_no_min(self):
        assert _apply_numeric_filter(10, None, 200) is True

    def test_no_max(self):
        assert _apply_numeric_filter(500, 50, None) is True

    def test_no_bounds(self):
        assert _apply_numeric_filter(9999, None, None) is True

    def test_at_boundary(self):
        assert _apply_numeric_filter(50, 50, 200) is True
        assert _apply_numeric_filter(200, 50, 200) is True


class TestBoolFilter:
    def test_required_true_passes(self):
        assert _apply_bool_filter(True, True) is True

    def test_required_true_fails_on_false(self):
        assert _apply_bool_filter(False, True) is False

    def test_required_true_fails_on_none(self):
        assert _apply_bool_filter(None, True) is False

    def test_filter_not_set_always_passes(self):
        assert _apply_bool_filter(False, None) is True
        assert _apply_bool_filter(None, None) is True


class TestMarketFilter:
    def test_no_filter_passes_all(self):
        assert _apply_market_filter("NSE", None) is True
        assert _apply_market_filter("NASDAQ", None) is True

    def test_IN_includes_NSE(self):
        assert _apply_market_filter("NSE", "IN") is True

    def test_IN_includes_BSE(self):
        assert _apply_market_filter("BSE", "IN") is True

    def test_IN_excludes_NASDAQ(self):
        assert _apply_market_filter("NASDAQ", "IN") is False

    def test_US_includes_NASDAQ(self):
        assert _apply_market_filter("NASDAQ", "US") is True

    def test_US_includes_NYSE(self):
        assert _apply_market_filter("NYSE", "US") is True

    def test_US_excludes_NSE(self):
        assert _apply_market_filter("NSE", "US") is False

    def test_exact_match(self):
        assert _apply_market_filter("NASDAQ", "NASDAQ") is True
        assert _apply_market_filter("NSE", "NASDAQ") is False


class TestRsScoreFilter:
    """rs_score is a new M3-A column — 1-99 relative strength scale."""

    def test_above_threshold_passes(self):
        assert _apply_numeric_filter(75, 70, None) is True

    def test_below_threshold_fails(self):
        assert _apply_numeric_filter(65, 70, None) is False

    def test_at_threshold_passes(self):
        assert _apply_numeric_filter(70, 70, None) is True

    def test_range_filter(self):
        assert _apply_numeric_filter(80, 70, 99) is True
        assert _apply_numeric_filter(65, 70, 99) is False
        assert _apply_numeric_filter(99, 70, 99) is True

    def test_none_filter_passes_all(self):
        assert _apply_numeric_filter(1, None, None) is True
        assert _apply_numeric_filter(99, None, None) is True


def _resolve_volume_ratio(db_value, volume: int, avg_vol: int) -> float | None:
    """Mirrors the DB-prefer fallback logic in _apply_filters (M3-B)."""
    if db_value is not None:
        return float(db_value)
    return round(volume / avg_vol, 2) if avg_vol else None


class TestVolumeRatioFallback:
    """volume_ratio column: use DB value when populated, else compute from raw cols."""

    def test_uses_db_value_when_present(self):
        result = _resolve_volume_ratio(db_value=2.5, volume=500_000, avg_vol=100_000)
        assert result == 2.5

    def test_falls_back_to_computation_when_db_null(self):
        result = _resolve_volume_ratio(db_value=None, volume=300_000, avg_vol=100_000)
        assert result == 3.0

    def test_returns_none_when_avg_vol_zero(self):
        result = _resolve_volume_ratio(db_value=None, volume=100_000, avg_vol=0)
        assert result is None

    def test_db_zero_is_used_not_treated_as_null(self):
        result = _resolve_volume_ratio(db_value=0.0, volume=500_000, avg_vol=100_000)
        assert result == 0.0


def _scanner_row(**overrides):
    row = {
        "symbol": "TEST",
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
            "company_name": "Test Ltd",
            "series": "EQ",
            "sector": "Test",
            "is_active": True,
            "market": "NSE",
            "currency": "INR",
            "market_cap_category": "midcap",
            "market_cap_cr": 1200,
        },
    }
    row.update(overrides)
    return row


class TestScanner52WeekFilters:
    def test_new_52w_high_uses_intraday_high_when_flag_missing(self):
        from app.routers.scanner import ScanFilters, _apply_filters

        rows = [_scanner_row(close=105, high=110, week_52_high=110, is_new_52w_high=None)]
        results = _apply_filters(rows, ScanFilters(new_52w_high=True))

        assert len(results) == 1
        assert results[0]["is_new_52w_high"] is True

    def test_new_52w_high_rejects_rows_below_high(self):
        from app.routers.scanner import ScanFilters, _apply_filters

        rows = [_scanner_row(close=104, high=108, week_52_high=110, is_new_52w_high=False)]

        assert _apply_filters(rows, ScanFilters(new_52w_high=True)) == []

    def test_week_52_high_pct_accepts_negative_db_distance(self):
        from app.routers.scanner import ScanFilters, _apply_filters

        rows = [_scanner_row(w52h_pct=-2.0)]

        assert len(_apply_filters(rows, ScanFilters(week_52_high_pct_max=5))) == 1

    def test_week_52_high_pct_rejects_negative_db_distance_over_limit(self):
        from app.routers.scanner import ScanFilters, _apply_filters

        rows = [_scanner_row(w52h_pct=-8.0)]

        assert _apply_filters(rows, ScanFilters(week_52_high_pct_max=5)) == []


class TestCanonicalSwingPresets:
    def test_backend_exposes_six_trader_presets(self):
        from app.routers.scanner import PRESETS

        assert [preset["id"] for preset in PRESETS] == [
            "trend_template",
            "vcp_breakout",
            "stage2_breakout",
            "high_52w_breakout",
            "episodic_pivot",
            "darvas_box_breakout",
        ]
        names = {preset["id"]: preset["name"] for preset in PRESETS}
        descriptions = " ".join(preset["description"] for preset in PRESETS)
        filters = {preset["id"]: preset["filters"] for preset in PRESETS}
        assert names["darvas_box_breakout"] == "Box Breakout"
        assert "Minervini" not in descriptions
        assert filters["vcp_breakout"]["vcp_pivot_proximity_pct"] == 5.0
        assert filters["high_52w_breakout"]["new_52w_high"] is True
        assert filters["stage2_breakout"]["volume_ratio_min"] == 1.5
        assert filters["darvas_box_breakout"]["avg_volume_50d_min"] == 100000.0

    def test_sma_trend_stack_filter_accepts_constructive_stack(self):
        from app.routers.scanner import ScanFilters, _apply_filters

        rows = [_scanner_row(close=105, sma_50=96, sma_150=92, sma_200=88)]
        results = _apply_filters(rows, ScanFilters(all_smas_bullish=True))

        assert len(results) == 1
        assert results[0]["symbol"] == "TEST"

    def test_sma_trend_stack_filter_rejects_broken_stack(self):
        from app.routers.scanner import ScanFilters, _apply_filters

        rows = [_scanner_row(close=105, sma_50=90, sma_150=92, sma_200=88)]

        assert _apply_filters(rows, ScanFilters(all_smas_bullish=True)) == []

    def test_scanner_result_explains_why_row_matched(self):
        from app.routers.scanner import ScanFilters, _apply_filters

        rows = [_scanner_row()]
        results = _apply_filters(rows, ScanFilters(all_smas_bullish=True, rs_score_min=70, volume_ratio_min=1), "trend_template")

        assert results
        assert any("SMA 50/150/200" in reason for reason in results[0]["match_reasons"])
        assert any("RS score" in reason for reason in results[0]["match_reasons"])
        assert results[0]["setup_score"] >= 65
        assert results[0]["setup_grade"] in {"A", "B"}
        assert results[0]["confidence_label"] in {"High confidence", "Worth review"}

    def test_strict_preset_rejects_missing_slope_data(self):
        from app.routers.scanner import ScanFilters, _apply_filters

        assert _apply_filters([_scanner_row(ema_200_slope_30d=None)], ScanFilters(ema_200_trending_up=True), "trend_template") == []

    def test_scanner_rejects_when_new_intelligence_fields_are_not_backfilled(self):
        from app.routers.scanner import ScanFilters, _apply_filters

        rows = [_scanner_row(ema_200_slope_30d=None)]
        results = _apply_filters(rows, ScanFilters(ema_200_trending_up=True))

        assert results == []

    def test_scanner_rejects_when_ema150_is_not_backfilled(self):
        from app.routers.scanner import ScanFilters, _apply_filters

        rows = [_scanner_row(ema_150=None)]
        results = _apply_filters(rows, ScanFilters(price_vs_ema150="above", ema50_above_ema150=True))

        assert results == []

    def test_darvas_box_height_filter_uses_backfilled_field_when_available(self):
        from app.routers.scanner import ScanFilters, _apply_filters

        accepted = _apply_filters([_scanner_row(darvas_box_height_pct=12.2)], ScanFilters(darvas_box_height_pct_max=15))
        rejected = _apply_filters([_scanner_row(darvas_box_height_pct=18.0)], ScanFilters(darvas_box_height_pct_max=15))

        assert len(accepted) == 1
        assert rejected == []

    def test_market_cap_category_filter_uses_stock_universe_field(self):
        from app.routers.scanner import ScanFilters, _apply_filters

        rows = [
            _scanner_row(symbol="MID", stock_universe={**_scanner_row()["stock_universe"], "market_cap_category": "midcap"}),
            _scanner_row(symbol="SMALL", stock_universe={**_scanner_row()["stock_universe"], "market_cap_category": "smallcap"}),
        ]

        results = _apply_filters(rows, ScanFilters(market_cap_category=["midcap"]))

        assert [result["symbol"] for result in results] == ["MID"]
        assert results[0]["market_cap_category"] == "midcap"


class _RecordingQuery:
    def __init__(self):
        self.calls = []

    def gte(self, column, value):
        self.calls.append(("gte", column, value))
        return self

    def lte(self, column, value):
        self.calls.append(("lte", column, value))
        return self

    def gt(self, column, value):
        self.calls.append(("gt", column, value))
        return self

    def eq(self, column, value):
        self.calls.append(("eq", column, value))
        return self

    def in_(self, column, value):
        self.calls.append(("in_", column, value))
        return self

    def or_(self, value):
        self.calls.append(("or_", "", value))
        return self


class TestScannerDbPrefilters:
    def test_exposes_prefilter_ops_for_diagnostics(self):
        from app.routers.scanner import ScanFilters, _db_prefilter_ops

        assert _db_prefilter_ops(
            ScanFilters(
                rs_score_min=70,
                avg_volume_50d_min=100000,
                ema_200_trending_up=True,
                darvas_box_height_pct_max=15,
            ),
            m3a_ready=True,
        ) == [
            ("eq", "stock_universe.is_active", True),
            ("in_", "stock_universe.series", ["EQ", "BE"]),
            ("gte", "rs_score", 70),
            ("gte", "avg_volume_50d", 100000),
            ("gt", "ema_200_slope_30d", 0),
            ("lte", "darvas_box_height_pct", 15),
        ]

    def test_pushes_non_fallback_intelligence_filters_to_db(self):
        from app.routers.scanner import ScanFilters, _push_db_prefilters

        query = _push_db_prefilters(
            _RecordingQuery(),
            ScanFilters(
                rs_score_min=70,
                rs_score_max=95,
                avg_volume_50d_min=100000,
                avg_volume_50d_max=5000000,
                price_perf_6m_min=20,
                price_perf_6m_max=200,
                ema_200_trending_up=True,
                ema_200_slope_30d_min=1.5,
                ema_200_slope_30d_max=20,
                darvas_box_height_pct_max=15,
                nr7=True,
            ),
            m3a_ready=True,
        )

        assert query.calls == [
            ("eq", "stock_universe.is_active", True),
            ("in_", "stock_universe.series", ["EQ", "BE"]),
            ("gte", "rs_score", 70),
            ("lte", "rs_score", 95),
            ("gte", "avg_volume_50d", 100000),
            ("lte", "avg_volume_50d", 5000000),
            ("gte", "price_perf_6m_pct", 20),
            ("lte", "price_perf_6m_pct", 200),
            ("gt", "ema_200_slope_30d", 0),
            ("gte", "ema_200_slope_30d", 1.5),
            ("lte", "ema_200_slope_30d", 20),
            ("lte", "darvas_box_height_pct", 15),
            ("eq", "is_nr7", True),
        ]

    def test_pushes_stock_universe_filters_to_db_without_unmigrated_category(self):
        from app.routers.scanner import ScanFilters, _push_db_prefilters

        query = _push_db_prefilters(
            _RecordingQuery(),
            ScanFilters(
                series=["EQ"],
                sector=["Financial Services", "IT"],
                # market_cap_category is handled Python-side when a row exposes
                # it. The stock_universe table has no repository migration for
                # this column, so pushing it to PostgREST breaks production.
                market_cap_category=["largecap", "midcap"],
                market="IN",
                market_cap_min=500,
                market_cap_max=50000,
                pe_min=5,
                pe_max=80,
                roe_min=12,
                debt_to_equity_max=1.5,
            ),
        )

        assert query.calls == [
            ("eq", "stock_universe.is_active", True),
            ("in_", "stock_universe.series", ["EQ"]),
            ("in_", "stock_universe.sector", ["Financial Services", "IT"]),
            ("in_", "stock_universe.market", ["NSE", "BSE"]),
            ("gte", "stock_universe.market_cap_cr", 500),
            ("lte", "stock_universe.market_cap_cr", 50000),
            ("gte", "stock_universe.pe_ratio", 5),
            ("lte", "stock_universe.pe_ratio", 80),
            ("lte", "stock_universe.debt_to_equity", 1.5),
            ("gte", "stock_universe.roe", 12),
        ]

    def test_skips_m3a_filters_when_columns_not_ready(self):
        from app.routers.scanner import ScanFilters, _push_db_prefilters

        query = _push_db_prefilters(
            _RecordingQuery(),
            ScanFilters(
                rs_score_min=70,
                volume_ratio_min=1.5,
                volume_ratio_max=5,
                week_52_high_pct_max=10,
                w52l_pct_min=30,
            ),
            m3a_ready=False,
        )

        assert query.calls == [
            ("eq", "stock_universe.is_active", True),
            ("in_", "stock_universe.series", ["EQ", "BE"]),
        ]

    def test_pushes_m3a_filters_when_columns_ready(self):
        from app.routers.scanner import ScanFilters, _push_db_prefilters

        query = _push_db_prefilters(
            _RecordingQuery(),
            ScanFilters(
                rs_score_min=70,
                volume_ratio_min=1.5,
                volume_ratio_max=5,
                week_52_high_pct_max=10,
                w52l_pct_min=30,
            ),
            m3a_ready=True,
        )

        assert query.calls == [
            ("eq", "stock_universe.is_active", True),
            ("in_", "stock_universe.series", ["EQ", "BE"]),
            ("gte", "rs_score", 70),
            ("gte", "volume_ratio", 1.5),
            ("lte", "volume_ratio", 5),
            ("gte", "w52h_pct", -10),
            ("lte", "w52h_pct", 10),
            ("gte", "w52l_pct", 30),
        ]


class TestScannerSortSlice:
    def test_plan_slice_matches_full_desc_sort_without_sorting_every_result(self):
        from app.routers.scanner import _sorted_plan_slice

        rows = [
            {"symbol": "AAA", "volume_ratio": 2.0},
            {"symbol": "BBB", "volume_ratio": None},
            {"symbol": "CCC", "volume_ratio": 3.0},
            {"symbol": "DDD", "volume_ratio": 3.0},
            {"symbol": "EEE", "volume_ratio": 1.0},
        ]

        sliced = _sorted_plan_slice(rows, "volume_ratio", reverse=True, limit=3)

        assert [row["symbol"] for row in sliced] == ["CCC", "DDD", "AAA"]

    def test_plan_slice_matches_full_asc_sort_with_null_first(self):
        from app.routers.scanner import _sorted_plan_slice

        rows = [
            {"symbol": "AAA", "volume_ratio": 2.0},
            {"symbol": "BBB", "volume_ratio": None},
            {"symbol": "CCC", "volume_ratio": 3.0},
            {"symbol": "DDD", "volume_ratio": 3.0},
            {"symbol": "EEE", "volume_ratio": 1.0},
        ]

        sliced = _sorted_plan_slice(rows, "volume_ratio", reverse=False, limit=3)

        assert [row["symbol"] for row in sliced] == ["BBB", "EEE", "AAA"]

    def test_plan_slice_matches_full_sort_for_varied_limits_and_ties(self):
        from app.routers.scanner import _sorted_plan_slice

        rng = random.Random(42)
        values = [None, 0.0, 1.0, 1.0, 2.5, 2.5, 5.0, -1.0]
        rows = [
            {"symbol": f"SYM{index:03d}", "setup_score": rng.choice(values)}
            for index in range(80)
        ]

        for reverse in (False, True):
            for limit in (1, 5, 17, 79):
                expected = sorted(
                    rows,
                    key=lambda row: (row.get("setup_score") is not None, row.get("setup_score") or 0),
                    reverse=reverse,
                )[:limit]

                assert _sorted_plan_slice(rows, "setup_score", reverse=reverse, limit=limit) == expected


class TestM3aDbPush:
    def test_m3a_columns_ready_when_eighty_percent_scored(self):
        from app.routers.scanner import _m3a_columns_ready

        class _Not:
            def __init__(self, parent):
                self._parent = parent

            def is_(self, *_args, **_kwargs):
                return self._parent

        class _Client:
            def __init__(self):
                self._call = 0
                self.not_ = _Not(self)

            def table(self, _name):
                return self

            def select(self, *_args, **_kwargs):
                return self

            def eq(self, *_args, **_kwargs):
                return self

            def execute(self):
                self._call += 1
                if self._call == 1:
                    return type("R", (), {"count": 100})()
                return type("R", (), {"count": 85})()

        assert _m3a_columns_ready(_Client(), "2026-05-01") is True

    def test_m3a_columns_ready_false_below_threshold(self):
        from app.routers.scanner import _m3a_columns_ready

        class _Not:
            def __init__(self, parent):
                self._parent = parent

            def is_(self, *_args, **_kwargs):
                return self._parent

        class _Client:
            def __init__(self):
                self._call = 0
                self.not_ = _Not(self)

            def table(self, _name):
                return self

            def select(self, *_args, **_kwargs):
                return self

            def eq(self, *_args, **_kwargs):
                return self

            def execute(self):
                self._call += 1
                if self._call == 1:
                    return type("R", (), {"count": 100})()
                return type("R", (), {"count": 50})()

        assert _m3a_columns_ready(_Client(), "2026-05-01") is False


class TestExecuteScanDiagnostics:
    def test_execute_scan_includes_query_timing_ms(self, monkeypatch):
        import asyncio
        from app.routers.scanner import ScanRequest, ScanFilters, execute_scan

        class _FakeQuery:
            def select(self, *_args, **_kwargs):
                return self

            def eq(self, *_args, **_kwargs):
                return self

            def limit(self, *_args, **_kwargs):
                return self

            def execute(self):
                return type("R", (), {"data": []})()

        class _FakeClient:
            def table(self, _name):
                return _FakeQuery()

        monkeypatch.setattr(
            "app.routers.scanner._scanner_latest_complete_trade_date",
            lambda _c: "2026-05-01",
        )
        monkeypatch.setattr("app.routers.scanner._active_universe_size", lambda *_args: 100)
        monkeypatch.setattr("app.routers.scanner._m3a_columns_ready", lambda *_args: False)

        result = asyncio.run(
            execute_scan(
                _FakeClient(),
                ScanRequest(filters=ScanFilters()),
                plan="pro",
            )
        )
        timing = result["source_metadata"]["scanner_performance"]["timing_ms"]
        assert "query" in timing
        assert "m3a_ready" in timing
        assert isinstance(timing["query"], (int, float))
        assert result["source_metadata"]["scanner_performance"]["m3a_columns_ready"] is False


class TestVCPAsyncPass2:
    """Structural tests for the async _run_vcp_pass2 — no DB required."""

    def test_run_vcp_pass2_is_coroutine(self):
        import asyncio
        from app.routers.scanner import _run_vcp_pass2
        assert asyncio.iscoroutinefunction(_run_vcp_pass2)

    def test_vcp_concurrency_constant_in_safe_range(self):
        from app.routers.scanner import VCP_CONCURRENCY
        assert 1 <= VCP_CONCURRENCY <= 8, "concurrency cap should be between 1 and 8"

    def test_empty_candidates_returns_immediately(self):
        import asyncio
        from pydantic import BaseModel

        # Minimal ScanFilters stub — avoids importing DB-dependent modules
        from app.routers.scanner import _run_vcp_pass2, ScanFilters
        f = ScanFilters()
        result = asyncio.run(_run_vcp_pass2(None, [], "2026-01-01", f))
        assert result == []
