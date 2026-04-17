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
