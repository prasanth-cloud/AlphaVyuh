"""
Pure-pandas technical indicator implementations.
No external dependencies beyond pandas and numpy.
All functions return pd.Series with the same index as the input.
"""
import numpy as np
import pandas as pd


def sma(series: pd.Series, length: int) -> pd.Series:
    return series.rolling(window=length, min_periods=length).mean()


def ema(series: pd.Series, length: int) -> pd.Series:
    return series.ewm(span=length, adjust=False, min_periods=length).mean()


def rsi(series: pd.Series, length: int = 14) -> pd.Series:
    delta = series.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(alpha=1 / length, adjust=False, min_periods=length).mean()
    avg_loss = loss.ewm(alpha=1 / length, adjust=False, min_periods=length).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    return 100 - (100 / (1 + rs))


def macd(series: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9):
    """Returns (macd_line, signal_line, histogram) as three pd.Series."""
    ema_fast = series.ewm(span=fast, adjust=False, min_periods=fast).mean()
    ema_slow = series.ewm(span=slow, adjust=False, min_periods=slow).mean()
    macd_line = ema_fast - ema_slow
    signal_line = macd_line.ewm(span=signal, adjust=False, min_periods=signal).mean()
    histogram = macd_line - signal_line
    return macd_line, signal_line, histogram


def bbands(series: pd.Series, length: int = 20, std: float = 2.0):
    """Returns (upper, mid, lower) as three pd.Series."""
    mid = series.rolling(window=length, min_periods=length).mean()
    std_dev = series.rolling(window=length, min_periods=length).std()
    upper = mid + std * std_dev
    lower = mid - std * std_dev
    return upper, mid, lower


def atr(high: pd.Series, low: pd.Series, close: pd.Series, length: int = 14) -> pd.Series:
    prev_close = close.shift(1)
    tr = pd.concat([
        high - low,
        (high - prev_close).abs(),
        (low - prev_close).abs(),
    ], axis=1).max(axis=1)
    return tr.ewm(alpha=1 / length, adjust=False, min_periods=length).mean()


def ichimoku(
    high: pd.Series,
    low: pd.Series,
    close: pd.Series,
    tenkan: int = 9,
    kijun: int = 26,
    senkou_b: int = 52,
):
    """
    Returns (tenkan_sen, kijun_sen, senkou_a, senkou_b, chikou_span) as five pd.Series.
    Senkou spans are shifted forward kijun periods to align with common chart display.
    Chikou span is close shifted back kijun periods.
    """
    def midpoint(n: int) -> pd.Series:
        return (high.rolling(n, min_periods=n).max() + low.rolling(n, min_periods=n).min()) / 2

    t = midpoint(tenkan)
    k = midpoint(kijun)
    sa = ((t + k) / 2).shift(kijun)
    sb = midpoint(senkou_b).shift(kijun)
    chikou = close.shift(-kijun)
    return t, k, sa, sb, chikou


def supertrend(
    high: pd.Series,
    low: pd.Series,
    close: pd.Series,
    period: int = 10,
    multiplier: float = 3.0,
) -> pd.Series:
    """
    Supertrend(period, multiplier). Returns pd.Series of int8 direction:
      1 = bullish (close above lower band), -1 = bearish (close below upper band),
      0 = insufficient data (ATR not yet defined).

    ATR uses Wilder RMA (alpha=1/period), matching atr() above.

    Band-locking (the sticky logic that makes Supertrend a trend-following indicator):
      final_upper[i] = min(basic_upper[i], final_upper[i-1])
                       if close[i-1] <= final_upper[i-1] else basic_upper[i]
      final_lower[i] = max(basic_lower[i], final_lower[i-1])
                       if close[i-1] >= final_lower[i-1] else basic_lower[i]

    Direction flip:
      if prev_dir >= 0: stay bullish while close >= final_lower[i], else flip bearish
      if prev_dir < 0:  stay bearish while close <= final_upper[i], else flip bullish
    """
    atr_s = atr(high, low, close, period)
    hl2 = (high + low) / 2.0
    basic_upper = hl2 + multiplier * atr_s
    basic_lower = hl2 - multiplier * atr_s

    n = len(close)
    fu = np.full(n, np.nan)
    fl = np.full(n, np.nan)
    direction = np.zeros(n, dtype=int)

    for i in range(n):
        if np.isnan(atr_s.iloc[i]):
            continue  # direction stays 0

        bu = float(basic_upper.iloc[i])
        bl = float(basic_lower.iloc[i])

        if i == 0 or np.isnan(fu[i - 1]):
            fu[i] = bu
            fl[i] = bl
        else:
            prev_c = float(close.iloc[i - 1])
            fu[i] = min(bu, fu[i - 1]) if prev_c <= fu[i - 1] else bu
            fl[i] = max(bl, fl[i - 1]) if prev_c >= fl[i - 1] else bl

        c = float(close.iloc[i])
        prev_dir = direction[i - 1] if i > 0 else 0
        if prev_dir >= 0:
            direction[i] = 1 if c >= fl[i] else -1
        else:
            direction[i] = -1 if c <= fu[i] else 1

    return pd.Series(direction, index=close.index)


def stochastic(
    high: pd.Series,
    low: pd.Series,
    close: pd.Series,
    k_period: int = 14,
    d_period: int = 3,
    smooth_k: int = 3,
):
    """
    Returns (%K smoothed, %D) as two pd.Series.
    %K = SMA(raw_k, smooth_k),  %D = SMA(%K, d_period)
    """
    lowest_low  = low.rolling(k_period, min_periods=k_period).min()
    highest_high = high.rolling(k_period, min_periods=k_period).max()
    denom = (highest_high - lowest_low).replace(0, np.nan)
    raw_k = 100 * (close - lowest_low) / denom
    k = raw_k.rolling(smooth_k, min_periods=smooth_k).mean()
    d = k.rolling(d_period, min_periods=d_period).mean()
    return k, d
