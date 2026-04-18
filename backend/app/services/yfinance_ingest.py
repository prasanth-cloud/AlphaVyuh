"""
yfinance-based data ingest for NSE stocks.
Fetches OHLCV + indicators and upserts into daily_ohlcv / stock_universe.
"""
from __future__ import annotations

import logging
from typing import Optional

import pandas as pd
import numpy as np

logger = logging.getLogger(__name__)

# Top 200 NSE stocks by liquidity
NSE_UNIVERSE = [
    "RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK", "HINDUNILVR", "SBIN", "BHARTIARTL",
    "ITC", "KOTAKBANK", "LT", "AXISBANK", "ASIANPAINT", "MARUTI", "NESTLEIND", "BAJFINANCE",
    "HCLTECH", "WIPRO", "SUNPHARMA", "ULTRACEMCO", "TITAN", "ADANIENT", "ADANIPORTS",
    "BAJAJFINSV", "TATAMOTORS", "NTPC", "POWERGRID", "TECHM", "ONGC", "COALINDIA",
    "TATASTEEL", "JSWSTEEL", "HINDALCO", "GRASIM", "CIPLA", "DRREDDY", "DIVISLAB",
    "APOLLOHOSP", "EICHERMOT", "HEROMOTOCO", "M&M", "TATACONSUM", "BRITANNIA",
    "PIDILITIND", "DABUR", "MARICO", "COLPAL", "GODREJCP", "BERGEPAINT", "HAVELLS",
    "VOLTAS", "BAJAJ-AUTO", "INDIGO", "IRCTC", "ZOMATO", "NYKAA", "HDFCLIFE",
    "SBILIFE", "ICICIPRULI", "CHOLAFIN", "MUTHOOTFIN", "BAJAJHFL", "LICI", "GICRE",
    "FEDERALBNK", "BANDHANBNK", "IDFCFIRSTB", "AUBANK", "KARURVYSYA", "RBLBANK",
    "ASHOKLEY", "TVSMOTOR", "ESCORTS", "MOTHERSON", "BOSCHLTD", "AMARAJABAT",
    "EXIDEIND", "CEAT", "APOLLOTYRE", "MRF", "BALKRISIND", "TIINDIA", "ELGIEQUIP",
    "THERMAX", "CUMMINSIND", "BHARATFORG", "BHEL", "BEL", "HAL", "BEML", "MAZDOCK",
    "AUROPHARMA", "LUPIN", "TORNTPHARM", "ALKEM", "ABBOTINDIA", "GLENMARK", "BIOCON",
    "LAURUSLABS", "GRANULES", "INDIAMART", "NAUKRI", "DLF", "GODREJPROP",
    "PRESTIGE", "OBEROIRLTY", "PHOENIXLTD", "BRIGADE", "SOBHA", "CENTURYTEX",
    "TRIDENT", "RAYMOND", "NATIONALUM", "HINDCOPPER", "APLAPOLLO", "JSPL", "RATNAMANI",
    "SHREECEM", "JKCEMENT", "HEIDELBERG", "AMBUJACEM", "ACC", "RAMCOCEM",
    "HINDZINC", "VEDL", "NMDC", "MOIL", "TATAPOWER", "ADANIGREEN",
    "TORNTPOWER", "CESC", "NHPC", "SJVN", "KALPATPOWR",
    "DIXON", "KAYNES", "AMBER", "TANLA", "LATENTVIEW", "TATAELXSI",
    "KPITTECH", "MASTEK", "MPHASIS", "COFORGE", "LTTS", "PERSISTENT", "BIRLASOFT",
    "ROUTE", "NEWGEN", "NUCLEUS", "DATAMATICS", "JUSTDIAL", "MATRIMONY",
    "SPANDANA", "CREDITACC", "EQUITAS",
    "UJJIVANSFW", "ESAFSFB", "ANGELONE", "IIFL", "JMFINANCL", "MOTILALOFS",
    "RECLTD", "PFC", "IRFC", "HUDCO", "MFSL", "MANAPPURAM", "SHRIRAMFIN",
    "LTFH", "PAGEIND", "SYMPHONY", "WHIRLPOOL", "RAJESHEXPO",
    "KOLTEPATIL", "SUNTECK", "MAHLIFE",
    "PAYTM", "POLICYBZR", "DELHIVERY",
    "EASEMYTRIP", "ZOMATO",
]


def _get_sb():
    from app.services.supabase import get_admin_client
    return get_admin_client()


# ── Pure pandas indicator helpers ──────────────────────────────────────────────

def _compute_rsi(series: pd.Series, length: int = 14) -> pd.Series:
    delta = series.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(com=length - 1, min_periods=length).mean()
    avg_loss = loss.ewm(com=length - 1, min_periods=length).mean()
    rs = avg_gain / avg_loss.replace(0, float("nan"))
    return (100 - 100 / (1 + rs)).round(2)


def _compute_ema(series: pd.Series, length: int) -> pd.Series:
    return series.ewm(span=length, adjust=False, min_periods=length).mean().round(2)


def _compute_atr(high: pd.Series, low: pd.Series, close: pd.Series, length: int = 14) -> pd.Series:
    prev_close = close.shift(1)
    tr = pd.concat([
        high - low,
        (high - prev_close).abs(),
        (low - prev_close).abs(),
    ], axis=1).max(axis=1)
    return tr.ewm(com=length - 1, min_periods=length).mean().round(4)


def _compute_macd(series: pd.Series) -> tuple[pd.Series, pd.Series, pd.Series]:
    ema12 = series.ewm(span=12, adjust=False, min_periods=12).mean()
    ema26 = series.ewm(span=26, adjust=False, min_periods=26).mean()
    macd_line = (ema12 - ema26).round(4)
    signal = macd_line.ewm(span=9, adjust=False, min_periods=9).mean().round(4)
    hist = (macd_line - signal).round(4)
    return macd_line, signal, hist


def _compute_bollinger(series: pd.Series, length: int = 20, std: float = 2.0) -> tuple[pd.Series, pd.Series, pd.Series, pd.Series]:
    mid = series.rolling(window=length, min_periods=length).mean()
    s = series.rolling(window=length, min_periods=length).std()
    upper = (mid + std * s).round(2)
    lower = (mid - std * s).round(2)
    mid = mid.round(2)
    width = ((upper - lower) / mid).round(4)
    return upper, mid, lower, width


def _compute_stochastic(high: pd.Series, low: pd.Series, close: pd.Series, k_period: int = 14, d_period: int = 3) -> tuple[pd.Series, pd.Series]:
    lowest_low = low.rolling(window=k_period, min_periods=k_period).min()
    highest_high = high.rolling(window=k_period, min_periods=k_period).max()
    denom = (highest_high - lowest_low).replace(0, float("nan"))
    k = ((close - lowest_low) / denom * 100).round(2)
    d = k.rolling(window=d_period, min_periods=d_period).mean().round(2)
    return k, d


def _compute_adx(high: pd.Series, low: pd.Series, close: pd.Series, length: int = 14) -> pd.Series:
    """Wilder's ADX."""
    high_diff = high.diff()
    low_diff = -low.diff()
    plus_dm = high_diff.where((high_diff > low_diff) & (high_diff > 0), 0.0)
    minus_dm = low_diff.where((low_diff > high_diff) & (low_diff > 0), 0.0)

    prev_close = close.shift(1)
    tr = pd.concat([high - low, (high - prev_close).abs(), (low - prev_close).abs()], axis=1).max(axis=1)

    atr = tr.ewm(alpha=1 / length, adjust=False, min_periods=length).mean()
    atr_safe = atr.replace(0, float("nan"))
    plus_di = (plus_dm.ewm(alpha=1 / length, adjust=False, min_periods=length).mean() / atr_safe * 100)
    minus_di = (minus_dm.ewm(alpha=1 / length, adjust=False, min_periods=length).mean() / atr_safe * 100)
    dx_denom = (plus_di + minus_di).replace(0, float("nan"))
    dx = ((plus_di - minus_di).abs() / dx_denom * 100)
    adx = dx.ewm(alpha=1 / length, adjust=False, min_periods=length).mean().round(2)
    return adx


def _compute_cci(high: pd.Series, low: pd.Series, close: pd.Series, length: int = 20) -> pd.Series:
    typical = (high + low + close) / 3
    ma = typical.rolling(window=length, min_periods=length).mean()
    mad = typical.rolling(window=length, min_periods=length).apply(lambda x: np.mean(np.abs(x - np.mean(x))), raw=True)
    mad_safe = mad.replace(0, float("nan"))
    return ((typical - ma) / (0.015 * mad_safe)).round(2)


def _compute_williams_r(high: pd.Series, low: pd.Series, close: pd.Series, length: int = 14) -> pd.Series:
    highest_high = high.rolling(window=length, min_periods=length).max()
    lowest_low = low.rolling(window=length, min_periods=length).min()
    denom = (highest_high - lowest_low).replace(0, float("nan"))
    return (((highest_high - close) / denom) * -100).round(2)


def _compute_obv(close: pd.Series, volume: pd.Series) -> pd.Series:
    direction = np.sign(close.diff().fillna(0))
    return (direction * volume).cumsum().astype("int64")


def fetch_and_ingest(symbol: str, period: str = "1y") -> dict:
    """
    Download history for `symbol` from Yahoo Finance and upsert into Supabase.
    Returns a status dict.
    """
    try:
        import yfinance as yf
    except ImportError:
        return {"symbol": symbol, "status": "error", "error": "yfinance not installed"}

    sb = _get_sb()
    try:
        ticker = yf.Ticker(f"{symbol}.NS")
        df = ticker.history(period=period, interval="1d", auto_adjust=True)
        if df.empty:
            return {"symbol": symbol, "status": "no_data", "rows": 0}

        df = df.reset_index()
        df.columns = [str(c).lower().replace(" ", "_") for c in df.columns]
        date_col = "date" if "date" in df.columns else df.columns[0]
        df = df.rename(columns={date_col: "trade_date"})
        df["trade_date"] = pd.to_datetime(df["trade_date"]).dt.strftime("%Y-%m-%d")
        df = df[df["volume"] > 0].dropna(subset=["open", "high", "low", "close"])
        df = df.reset_index(drop=True)

        close  = df["close"]
        high   = df["high"]
        low    = df["low"]
        volume = df["volume"]

        # ── Basic ──────────────────────────────────────────────────────────
        df["prev_close"]     = close.shift(1).round(2)
        df["pct_change"]     = ((close - close.shift(1)) / close.shift(1) * 100).round(4)
        df["gap_pct"]        = ((df["open"] - close.shift(1)) / close.shift(1) * 100).round(4)
        df["week_52_high"]   = high.rolling(min(252, len(df))).max().round(2)
        df["week_52_low"]    = low.rolling(min(252, len(df))).min().round(2)
        df["avg_volume_20d"] = volume.rolling(min(20, len(df))).mean().round(0).astype("Int64")
        df["is_new_52w_high"] = close >= df["week_52_high"]
        df["is_new_52w_low"]  = close <= df["week_52_low"]

        # ── Inside / outside bar ───────────────────────────────────────────
        prev_high = high.shift(1)
        prev_low  = low.shift(1)
        df["is_inside_bar"]  = (high <= prev_high) & (low >= prev_low)
        df["is_outside_bar"] = (high >= prev_high) & (low <= prev_low)

        # ── RSI ────────────────────────────────────────────────────────────
        if len(df) >= 14:
            df["rsi_14"] = _compute_rsi(close, 14)

        # ── EMAs ──────────────────────────────────────────────────────────
        for length, col in [(20, "ema_20"), (50, "ema_50"), (200, "ema_200")]:
            if len(df) >= length:
                df[col] = _compute_ema(close, length)

        # ── ATR ────────────────────────────────────────────────────────────
        if len(df) >= 14:
            df["atr_14"] = _compute_atr(high, low, close, 14)

        # ── MACD ───────────────────────────────────────────────────────────
        if len(df) >= 35:
            df["macd_line"], df["macd_signal"], df["macd_hist"] = _compute_macd(close)

        # ── Bollinger Bands ────────────────────────────────────────────────
        if len(df) >= 20:
            df["bb_upper"], df["bb_middle"], df["bb_lower"], df["bb_width"] = _compute_bollinger(close)

        # ── Stochastic ─────────────────────────────────────────────────────
        if len(df) >= 14:
            df["stoch_k"], df["stoch_d"] = _compute_stochastic(high, low, close)

        # ── ADX ────────────────────────────────────────────────────────────
        if len(df) >= 28:
            df["adx_14"] = _compute_adx(high, low, close)

        # ── CCI ────────────────────────────────────────────────────────────
        if len(df) >= 20:
            df["cci_20"] = _compute_cci(high, low, close)

        # ── Williams %R ────────────────────────────────────────────────────
        if len(df) >= 14:
            df["williams_r"] = _compute_williams_r(high, low, close)

        # ── OBV ────────────────────────────────────────────────────────────
        df["obv"] = _compute_obv(close, volume)

        # Company name
        try:
            info = ticker.fast_info
            company_name = getattr(info, "long_name", None) or symbol
        except Exception:
            company_name = symbol

        # Upsert stock_universe
        sb.table("stock_universe").upsert(
            {"symbol": symbol, "company_name": company_name, "series": "EQ", "is_active": True},
            on_conflict="symbol",
        ).execute()

        # Build rows
        indicator_cols = [
            "trade_date", "open", "high", "low", "close", "volume", "prev_close",
            "pct_change", "gap_pct", "week_52_high", "week_52_low", "avg_volume_20d",
            "is_new_52w_high", "is_new_52w_low", "is_inside_bar", "is_outside_bar",
            "rsi_14", "ema_20", "ema_50", "ema_200", "atr_14",
            "macd_line", "macd_signal", "macd_hist",
            "bb_upper", "bb_middle", "bb_lower", "bb_width",
            "stoch_k", "stoch_d", "adx_14", "cci_20", "williams_r", "obv",
        ]

        bool_cols = {"is_new_52w_high", "is_new_52w_low", "is_inside_bar", "is_outside_bar"}
        int_cols  = {"avg_volume_20d", "volume", "obv"}
        round4    = {"atr_14", "pct_change", "gap_pct", "bb_width", "macd_line", "macd_signal", "macd_hist"}

        rows = []
        for _, row in df.iterrows():
            r: dict = {"symbol": symbol}
            for col in indicator_cols:
                if col not in df.columns:
                    continue
                val = row[col]
                if pd.isna(val):
                    continue
                if col == "trade_date":
                    r[col] = str(val)
                elif col in bool_cols:
                    r[col] = bool(val)
                elif col in int_cols:
                    r[col] = int(float(val))
                elif col in round4:
                    r[col] = round(float(val), 4)
                else:
                    r[col] = round(float(val), 2)
            if "trade_date" in r:
                rows.append(r)

        # Upsert in batches of 200
        for i in range(0, len(rows), 200):
            sb.table("daily_ohlcv").upsert(
                rows[i: i + 200], on_conflict="symbol,trade_date"
            ).execute()

        return {"symbol": symbol, "status": "success", "rows": len(rows)}

    except Exception as e:
        logger.error(f"yfinance ingest failed for {symbol}: {e}")
        return {"symbol": symbol, "status": "error", "error": str(e)}
