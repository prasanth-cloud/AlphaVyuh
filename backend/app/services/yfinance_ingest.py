"""
yfinance-based data ingest for NSE stocks.
Fetches OHLCV + indicators and upserts into daily_ohlcv / stock_universe.
"""
from __future__ import annotations

import logging
from typing import Optional

import pandas as pd

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
    "NYKAA", "PAYTM", "POLICYBZR", "DELHIVERY",
    "EASEMYTRIP", "ZOMATO",
]


def _get_sb():
    from app.services.supabase import get_admin_client
    return get_admin_client()


def _compute_rsi(series: pd.Series, length: int = 14) -> pd.Series:
    """Pure pandas RSI — no TA-Lib dependency."""
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
        (low  - prev_close).abs(),
    ], axis=1).max(axis=1)
    return tr.ewm(com=length - 1, min_periods=length).mean().round(4)


def fetch_and_ingest(symbol: str, period: str = "1y") -> dict:
    """
    Download history for `symbol` from Yahoo Finance and upsert into Supabase.
    Returns a status dict.
    """
    try:
        import yfinance as yf  # lazy import — only needed when this function is called
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
        # yfinance >= 0.2 returns 'date' as a Timestamp column
        date_col = "date" if "date" in df.columns else df.columns[0]
        df = df.rename(columns={date_col: "trade_date"})
        df["trade_date"] = pd.to_datetime(df["trade_date"]).dt.strftime("%Y-%m-%d")
        df = df[df["volume"] > 0].dropna(subset=["open", "high", "low", "close"])

        close  = df["close"]
        high   = df["high"]
        low    = df["low"]
        volume = df["volume"]

        df["prev_close"]     = close.shift(1).round(2)
        df["week_52_high"]   = high.rolling(min(252, len(df))).max().round(2)
        df["week_52_low"]    = low.rolling(min(252, len(df))).min().round(2)
        df["avg_volume_20d"] = volume.rolling(min(20, len(df))).mean().round(0).astype("Int64")

        if len(df) >= 14:
            df["rsi_14"] = _compute_rsi(close, 14)
        for length, col in [(20, "ema_20"), (50, "ema_50"), (200, "ema_200")]:
            if len(df) >= length:
                df[col] = _compute_ema(close, length)
        if len(df) >= 14:
            df["atr_14"] = _compute_atr(high, low, close, 14)

        # Company name
        try:
            info = ticker.fast_info
            company_name = getattr(info, "long_name", None) or symbol
        except Exception:
            company_name = symbol

        # Upsert into stock_universe
        sb.table("stock_universe").upsert(
            {"symbol": symbol, "company_name": company_name, "series": "EQ", "is_active": True},
            on_conflict="symbol",
        ).execute()

        # Build rows
        indicator_cols = [
            "trade_date", "open", "high", "low", "close", "volume", "prev_close",
            "week_52_high", "week_52_low", "avg_volume_20d",
            "rsi_14", "ema_20", "ema_50", "ema_200", "atr_14",
        ]
        rows = []
        for _, row in df.iterrows():
            r: dict = {"symbol": symbol}
            for col in indicator_cols:
                if col not in df.columns:
                    continue
                val = row[col]
                if pd.isna(val):
                    continue
                if col == "avg_volume_20d":
                    r[col] = int(val)
                elif col == "trade_date":
                    r[col] = str(val)
                elif col == "volume":
                    r[col] = int(float(val))
                else:
                    r[col] = round(float(val), 4 if col == "atr_14" else 2)
            if "trade_date" in r:
                rows.append(r)

        # Upsert in batches of 200
        for i in range(0, len(rows), 200):
            sb.table("daily_ohlcv").upsert(
                rows[i : i + 200], on_conflict="symbol,trade_date"
            ).execute()

        return {"symbol": symbol, "status": "success", "rows": len(rows)}

    except Exception as e:
        logger.error(f"yfinance ingest failed for {symbol}: {e}")
        return {"symbol": symbol, "status": "error", "error": str(e)}
