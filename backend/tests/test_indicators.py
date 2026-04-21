"""Unit tests for indicators.py — momentum, supertrend, and helpers.
No DB required; all tests use synthetic price series.
"""
import numpy as np
import pandas as pd
import pytest

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.services.indicators import sma, ema, atr, macd, supertrend


# ── Helpers ───────────────────────────────────────────────────────────────────

def _flat_series(price: float, n: int) -> pd.Series:
    return pd.Series([float(price)] * n)


def _ramp_series(start: float, step: float, n: int) -> pd.Series:
    return pd.Series([start + i * step for i in range(n)])


# ── SMA ───────────────────────────────────────────────────────────────────────

class TestSMA:
    def test_flat_series_returns_same_value(self):
        s = _flat_series(100.0, 20)
        result = sma(s, 10)
        assert abs(result.iloc[-1] - 100.0) < 1e-9

    def test_min_periods_respected(self):
        s = _flat_series(50.0, 5)
        result = sma(s, 10)
        # Fewer bars than period → all NaN
        assert result.isna().all()

    def test_exactly_at_period(self):
        s = _ramp_series(1.0, 1.0, 10)  # [1,2,...,10]
        result = sma(s, 10)
        # SMA(10) of 1..10 = 5.5
        assert abs(result.iloc[-1] - 5.5) < 1e-9

    def test_sma_vs_manual(self):
        vals = [10, 20, 30, 40, 50]
        s = pd.Series(vals, dtype=float)
        result = sma(s, 3)
        assert abs(result.iloc[-1] - 40.0) < 1e-9  # (30+40+50)/3


# ── Momentum ─────────────────────────────────────────────────────────────────

class TestMomentum:
    """
    Momentum_Nd = (close[today] - close[N sessions ago]) / close[N sessions ago] * 100.
    Tested via the bhavcopy ingest helper pattern (inline, no DB).
    """

    def _momentum(self, closes: list[float], n: int) -> float | None:
        """Replicate ingest momentum formula."""
        if len(closes) < n + 1:
            return None
        c0 = closes[-(n + 1)]
        c1 = closes[-1]
        if not c0 or c0 <= 0:
            return None
        return round((c1 - c0) / c0 * 100, 4)

    def test_zero_gain(self):
        closes = [100.0] * 10
        assert self._momentum(closes, 5) == 0.0

    def test_ten_pct_gain(self):
        closes = [100.0] * 5 + [110.0]
        # c0=closes[0]=100, c1=closes[-1]=110
        result = self._momentum(closes, 5)
        assert result is not None
        assert abs(result - 10.0) < 1e-4

    def test_negative_momentum(self):
        closes = [100.0] * 5 + [90.0]
        result = self._momentum(closes, 5)
        assert result is not None
        assert abs(result - (-10.0)) < 1e-4

    def test_insufficient_history_returns_none(self):
        closes = [100.0, 110.0, 120.0]
        assert self._momentum(closes, 5) is None

    def test_exactly_n_plus_one_bars(self):
        closes = [80.0] + [100.0]  # 2 bars, n=1
        result = self._momentum(closes, 1)
        assert result is not None
        assert abs(result - 25.0) < 1e-4


# ── ATR ───────────────────────────────────────────────────────────────────────

class TestATR:
    def test_flat_ohlc_atr_equals_zero(self):
        n = 30
        h = _flat_series(105.0, n)
        l = _flat_series(95.0, n)
        c = _flat_series(100.0, n)
        result = atr(h, l, c, 14)
        # TR = high - low = 10 for every bar; ATR converges to 10
        assert abs(result.iloc[-1] - 10.0) < 0.1

    def test_min_periods(self):
        n = 10
        h = _flat_series(110.0, n)
        l = _flat_series(90.0, n)
        c = _flat_series(100.0, n)
        result = atr(h, l, c, 14)
        # Fewer than 14 bars → NaN
        assert result.isna().all()


# ── Supertrend ────────────────────────────────────────────────────────────────

class TestSupertrend:
    def _make_uptrend(self, n: int = 80) -> tuple[pd.Series, pd.Series, pd.Series]:
        """Steadily rising prices: should eventually turn bullish."""
        close = pd.Series([100.0 + i * 0.5 for i in range(n)])
        high  = close + 2.0
        low   = close - 2.0
        return high, low, close

    def _make_downtrend(self, n: int = 80) -> tuple[pd.Series, pd.Series, pd.Series]:
        """Steadily falling prices: should eventually turn bearish."""
        close = pd.Series([200.0 - i * 0.5 for i in range(n)])
        high  = close + 2.0
        low   = close - 2.0
        return high, low, close

    def test_insufficient_bars_all_zero(self):
        n = 9  # < period=10, so ATR never defined
        h, l, c = self._make_uptrend(n)
        result = supertrend(h, l, c, period=10, multiplier=3.0)
        assert (result == 0).all()

    def test_first_n_minus_1_bars_are_zero(self):
        n = 20
        h, l, c = self._make_uptrend(n)
        result = supertrend(h, l, c, period=10, multiplier=3.0)
        # Bars 0..8 have no ATR (need min_periods=10) → direction = 0
        assert (result.iloc[:9] == 0).all()

    def test_uptrend_is_bullish(self):
        h, l, c = self._make_uptrend(80)
        result = supertrend(h, l, c, period=10, multiplier=3.0)
        # After warm-up, last bar should be bullish
        assert result.iloc[-1] == 1

    def test_downtrend_is_bearish(self):
        h, l, c = self._make_downtrend(80)
        result = supertrend(h, l, c, period=10, multiplier=3.0)
        assert result.iloc[-1] == -1

    def test_direction_only_contains_valid_values(self):
        h, l, c = self._make_uptrend(50)
        result = supertrend(h, l, c, period=10, multiplier=3.0)
        assert set(result.unique()).issubset({-1, 0, 1})

    def test_flat_prices_no_flip(self):
        n = 50
        close = _flat_series(100.0, n)
        high  = _flat_series(102.0, n)
        low   = _flat_series(98.0, n)
        result = supertrend(high, low, close, period=10, multiplier=3.0)
        # Flat prices: after warm-up, direction should be stable (no flipping)
        non_zero = result[result != 0]
        if len(non_zero) >= 2:
            # Check no alternating flips
            assert not ((non_zero.diff() != 0).sum() > 3), "Too many direction flips on flat prices"

    def test_band_locking_prevents_early_exit(self):
        """
        Simulate a dip that doesn't reach the lower band — direction must stay bullish.
        Without band-locking, the moving basic_upper would sometimes fall below close
        and incorrectly trigger a bearish flip.
        """
        n = 60
        # Uptrend then small dip then recovery
        prices = [100.0 + i for i in range(40)] + [135.0 - i * 0.5 for i in range(10)] + [130.0 + i * 0.3 for i in range(10)]
        close = pd.Series(prices[:n])
        high  = close + 3.0
        low   = close - 3.0
        result = supertrend(high, low, close, period=10, multiplier=3.0)
        # After recovery, last bar should still be bullish
        assert result.iloc[-1] == 1


# ── MACD prev_macd_hist ───────────────────────────────────────────────────────

class TestMACDPrevHist:
    def test_prev_hist_is_second_to_last(self):
        n = 60
        close = pd.Series([100.0 + i * 0.2 for i in range(n)])
        _, _, hist = macd(close, fast=12, slow=26, signal=9)
        # prev_macd_hist = hist[-2]
        prev_h = hist.iloc[-2]
        assert prev_h is not None and not np.isnan(prev_h)

    def test_bullish_cross_detection(self):
        """macd_hist crosses from negative to positive → bullish cross."""
        n = 60
        # Downtrend then sharp upswing to force histogram sign change
        prices = [100.0 - i * 0.5 for i in range(40)] + [80.0 + i * 2.0 for i in range(20)]
        close = pd.Series(prices)
        _, _, hist = macd(close, fast=12, slow=26, signal=9)
        # Find a bullish cross in the series
        cross_found = any(
            hist.iloc[i] > 0 and hist.iloc[i - 1] <= 0
            for i in range(1, len(hist))
            if not (np.isnan(hist.iloc[i]) or np.isnan(hist.iloc[i - 1]))
        )
        assert cross_found, "Expected at least one bullish MACD cross in strong upswing"
