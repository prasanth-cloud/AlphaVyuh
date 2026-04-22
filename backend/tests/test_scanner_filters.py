"""Tests for scanner filter logic (no DB required)."""
import pytest


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


class TestRsRatingFilter:
    """rs_rating is a new M3-A column — 1-99 Minervini relative strength scale."""

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
