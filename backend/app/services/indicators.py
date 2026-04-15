"""
Pure-pandas technical indicator implementations.
No external dependencies beyond pandas and numpy.
All functions return pd.Series with the same index as the input.
"""
import numpy as np
import pandas as pd


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
