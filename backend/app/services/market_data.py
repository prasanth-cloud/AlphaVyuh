from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import date, timedelta
from functools import lru_cache
from io import StringIO
from typing import Any, Protocol

import pandas as pd
import yfinance as yf

from app.brokers.kite import api as kite_api
from app.brokers.kite.api import KiteApiError


class MarketDataError(RuntimeError):
    """Raised when the configured market data provider cannot serve a request."""


class ProviderNotConfiguredError(MarketDataError):
    """Raised when a provider is selected but credentials/integration are missing."""


@dataclass(frozen=True)
class MarketIdentity:
    market: str = "NSE"
    currency: str = "INR"


class MarketDataProvider(Protocol):
    name: str

    def live_candles(self, symbol: str, timeframe: str, limit: int, identity: MarketIdentity) -> dict[str, Any]:
        ...

    def live_quote(self, symbol: str, identity: MarketIdentity) -> dict[str, Any]:
        ...


def yf_ticker_symbol(symbol: str, market: str) -> str:
    index_map = {
        "NIFTY": "^NSEI",
        "NIFTY50": "^NSEI",
        "NIFTY_50": "^NSEI",
        "BANKNIFTY": "^NSEBANK",
        "NIFTYBANK": "^NSEBANK",
        "NIFTY_BANK": "^NSEBANK",
        "VIX": "^INDIAVIX",
        "INDIAVIX": "^INDIAVIX",
        "INDIA_VIX": "^INDIAVIX",
    }
    sym = symbol.upper().replace(" ", "_").replace("-", "_")
    if sym in index_map:
        return index_map[sym]
    return symbol if market in ("NASDAQ", "NYSE") else f"{symbol}.NS"


class YahooMarketDataProvider:
    name = "yahoo_finance"

    def live_candles(self, symbol: str, timeframe: str, limit: int, identity: MarketIdentity) -> dict[str, Any]:
        sym = symbol.upper()
        tf = timeframe.upper()
        period_map = {"D": "2y", "W": "5y", "M": "max"}
        interval_map = {"D": "1d", "W": "1wk", "M": "1mo"}

        ticker = yf.Ticker(yf_ticker_symbol(sym, identity.market))
        hist = ticker.history(
            period=period_map.get(tf, "2y"),
            interval=interval_map.get(tf, "1d"),
            auto_adjust=True,
        )
        if hist.empty:
            raise MarketDataError(f"No data from Yahoo Finance for {sym}")

        hist = hist.tail(limit).reset_index()
        hist.columns = [c.replace(" ", "_").lower() for c in hist.columns]

        candles: list[dict[str, Any]] = []
        for _, row in hist.iterrows():
            dt = row["date"] if "date" in row else row["datetime"]
            if hasattr(dt, "date"):
                dt = dt.date()
            candles.append({
                "time": str(dt),
                "open": round(float(row["open"]), 2),
                "high": round(float(row["high"]), 2),
                "low": round(float(row["low"]), 2),
                "close": round(float(row["close"]), 2),
                "volume": int(row.get("volume", 0)),
            })

        if not candles:
            raise MarketDataError(f"No candles for {sym}")

        last = candles[-1]
        prev_close = candles[-2]["close"] if len(candles) >= 2 else last["close"]
        pct = round((last["close"] - prev_close) / prev_close * 100, 2) if prev_close else None
        info = ticker.fast_info

        return {
            "symbol": sym,
            "company_name": sym,
            "sector": None,
            "market": identity.market,
            "currency": identity.currency,
            "timeframe": tf,
            "source": self.name,
            "candles": candles,
            "latest": {
                "close": last["close"],
                "open": last["open"],
                "high": last["high"],
                "low": last["low"],
                "volume": last["volume"],
                "prev_close": prev_close,
                "pct_change": pct,
                "week_52_high": round(float(info.year_high), 2) if info.year_high else None,
                "week_52_low": round(float(info.year_low), 2) if info.year_low else None,
                "rsi_14": None,
                "ema_20": None,
                "ema_50": None,
                "ema_200": None,
                "atr_14": None,
                "volume_ratio": None,
            },
        }

    def live_quote(self, symbol: str, identity: MarketIdentity) -> dict[str, Any]:
        sym = symbol.upper()
        ticker = yf.Ticker(yf_ticker_symbol(sym, identity.market))
        info = ticker.fast_info
        hist = ticker.history(period="2d", interval="1d")

        if hist.empty:
            raise MarketDataError(f"No live data for {sym}")

        latest = hist.iloc[-1]
        prev = hist.iloc[-2] if len(hist) >= 2 else hist.iloc[-1]

        close = float(latest["Close"])
        prev_close = float(prev["Close"])
        pct_change = round((close - prev_close) / prev_close * 100, 2) if prev_close else None

        return {
            "symbol": sym,
            "market": identity.market,
            "currency": identity.currency,
            "close": round(close, 2),
            "open": round(float(latest["Open"]), 2),
            "high": round(float(latest["High"]), 2),
            "low": round(float(latest["Low"]), 2),
            "volume": int(latest["Volume"]),
            "prev_close": round(prev_close, 2),
            "pct_change": pct_change,
            "week_52_high": round(float(info.year_high), 2) if info.year_high else None,
            "week_52_low": round(float(info.year_low), 2) if info.year_low else None,
            "source": self.name,
        }


def _kite_access_token() -> str:
    token = os.getenv("KITE_ACCESS_TOKEN", "").strip()
    if not token:
        raise ProviderNotConfiguredError(
            "Kite market data requires KITE_ACCESS_TOKEN. Generate it through the Zerodha login flow; it expires daily."
        )
    return token


def _kite_api_key() -> str | None:
    return os.getenv("KITE_API_KEY", "").strip() or None


@lru_cache(maxsize=8)
def _kite_instruments(exchange: str) -> pd.DataFrame:
    csv_text = kite_api.get_instruments(exchange=exchange, access_token=None, api_key=_kite_api_key())
    return pd.read_csv(StringIO(csv_text))


def _kite_exchange(identity: MarketIdentity) -> str:
    market = identity.market.upper()
    return "BSE" if market == "BSE" else "NSE"


def _kite_interval(timeframe: str) -> str:
    tf = timeframe.upper()
    if tf in {"D", "W", "M"}:
        return "day"
    intraday = {
        "1": "minute",
        "1M": "minute",
        "3": "3minute",
        "3M": "3minute",
        "5": "5minute",
        "5M": "5minute",
        "10": "10minute",
        "10M": "10minute",
        "15": "15minute",
        "15M": "15minute",
        "30": "30minute",
        "30M": "30minute",
        "60": "60minute",
        "60M": "60minute",
        "1H": "60minute",
    }
    if tf in intraday:
        return intraday[tf]
    raise MarketDataError(f"Unsupported Kite timeframe: {timeframe}")


def _kite_history_window(timeframe: str, limit: int) -> tuple[str, str]:
    today = date.today()
    tf = timeframe.upper()
    if tf == "M":
        start = today - timedelta(days=max(limit * 35, 365))
    elif tf == "W":
        start = today - timedelta(days=max(limit * 8, 365))
    elif tf == "D":
        start = today - timedelta(days=max(limit * 2, 365))
    else:
        start = today - timedelta(days=30)
    return f"{start.isoformat()} 00:00:00", f"{today.isoformat()} 23:59:59"


def _aggregate_kite_daily(candles: list[dict[str, Any]], timeframe: str, limit: int) -> list[dict[str, Any]]:
    if timeframe.upper() not in {"W", "M"} or not candles:
        return candles[-limit:]

    df = pd.DataFrame(candles)
    df["time"] = pd.to_datetime(df["time"])
    freq = "W-FRI" if timeframe.upper() == "W" else "ME"
    grouped = df.set_index("time").resample(freq)
    out = pd.DataFrame({
        "open": grouped["open"].first(),
        "high": grouped["high"].max(),
        "low": grouped["low"].min(),
        "close": grouped["close"].last(),
        "volume": grouped["volume"].sum(),
    }).dropna(subset=["close"]).tail(limit)
    out.index = out.index.date
    return [
        {
            "time": str(idx),
            "open": round(float(row["open"]), 2),
            "high": round(float(row["high"]), 2),
            "low": round(float(row["low"]), 2),
            "close": round(float(row["close"]), 2),
            "volume": int(row["volume"]) if pd.notna(row["volume"]) else 0,
        }
        for idx, row in out.iterrows()
    ]


class KiteMarketDataProvider:
    name = "kite"

    def _instrument(self, symbol: str, identity: MarketIdentity) -> dict[str, Any]:
        exchange = _kite_exchange(identity)
        instruments = _kite_instruments(exchange)
        sym = symbol.upper()
        kite_symbol = {
            "NIFTY": "NIFTY 50",
            "NIFTY50": "NIFTY 50",
            "NIFTY_50": "NIFTY 50",
            "BANKNIFTY": "NIFTY BANK",
            "NIFTYBANK": "NIFTY BANK",
            "NIFTY_BANK": "NIFTY BANK",
            "VIX": "INDIA VIX",
            "INDIAVIX": "INDIA VIX",
            "INDIA_VIX": "INDIA VIX",
        }.get(sym, sym)
        match = instruments[
            (instruments["tradingsymbol"].astype(str).str.upper() == kite_symbol)
            & (instruments["exchange"].astype(str).str.upper() == exchange)
        ]
        if match.empty:
            raise MarketDataError(f"Kite instrument not found for {exchange}:{sym}")
        row = match.iloc[0]
        return {
            "exchange": exchange,
            "tradingsymbol": str(row["tradingsymbol"]),
            "instrument_token": int(row["instrument_token"]),
            "name": str(row.get("name") or row["tradingsymbol"]),
        }

    def live_candles(self, symbol: str, timeframe: str, limit: int, identity: MarketIdentity) -> dict[str, Any]:
        sym = symbol.upper()
        inst = self._instrument(sym, identity)
        from_date, to_date = _kite_history_window(timeframe, limit)
        try:
            raw = kite_api.get_historical_data(
                _kite_access_token(),
                inst["instrument_token"],
                _kite_interval(timeframe),
                from_date,
                to_date,
                api_key=_kite_api_key(),
            )
            quote_key = f"{inst['exchange']}:{inst['tradingsymbol']}"
            quote = kite_api.get_quote_ohlc([quote_key], _kite_access_token(), api_key=_kite_api_key()).get(quote_key)
        except KiteApiError as exc:
            raise MarketDataError(f"Kite API error: {exc.message}") from exc

        daily_candles = [
            {
                "time": str(item[0])[:10],
                "open": round(float(item[1]), 2),
                "high": round(float(item[2]), 2),
                "low": round(float(item[3]), 2),
                "close": round(float(item[4]), 2),
                "volume": int(item[5]) if len(item) > 5 and item[5] is not None else 0,
            }
            for item in raw
        ]
        candles = _aggregate_kite_daily(daily_candles, timeframe, limit)
        if not candles:
            raise MarketDataError(f"No Kite candles for {sym}")

        last = candles[-1]
        prev_close = candles[-2]["close"] if len(candles) >= 2 else None
        ohlc = (quote or {}).get("ohlc") or {}
        ltp = (quote or {}).get("last_price")
        close = round(float(ltp), 2) if ltp is not None else last["close"]
        prev = float(ohlc.get("close") or prev_close or last["close"])

        return {
            "symbol": sym,
            "company_name": inst["name"],
            "sector": None,
            "market": inst["exchange"],
            "currency": identity.currency,
            "timeframe": timeframe.upper(),
            "source": self.name,
            "candles": candles,
            "latest": {
                "close": close,
                "open": round(float(ohlc.get("open") or last["open"]), 2),
                "high": round(float(ohlc.get("high") or last["high"]), 2),
                "low": round(float(ohlc.get("low") or last["low"]), 2),
                "volume": last["volume"],
                "prev_close": prev,
                "pct_change": round((close - prev) / prev * 100, 2) if prev else None,
                "week_52_high": None,
                "week_52_low": None,
                "rsi_14": None,
                "ema_20": None,
                "ema_50": None,
                "ema_200": None,
                "atr_14": None,
                "volume_ratio": None,
            },
        }

    def live_quote(self, symbol: str, identity: MarketIdentity) -> dict[str, Any]:
        sym = symbol.upper()
        inst = self._instrument(sym, identity)
        quote_key = f"{inst['exchange']}:{inst['tradingsymbol']}"
        try:
            quote = kite_api.get_quote_ohlc([quote_key], _kite_access_token(), api_key=_kite_api_key()).get(quote_key)
        except KiteApiError as exc:
            raise MarketDataError(f"Kite API error: {exc.message}") from exc
        if not quote:
            raise MarketDataError(f"No Kite quote for {quote_key}")
        ohlc = quote.get("ohlc") or {}
        close = round(float(quote["last_price"]), 2)
        prev = round(float(ohlc.get("close") or close), 2)
        return {
            "symbol": sym,
            "market": inst["exchange"],
            "currency": identity.currency,
            "close": close,
            "open": round(float(ohlc.get("open") or close), 2),
            "high": round(float(ohlc.get("high") or close), 2),
            "low": round(float(ohlc.get("low") or close), 2),
            "volume": 0,
            "prev_close": prev,
            "pct_change": round((close - prev) / prev * 100, 2) if prev else None,
            "week_52_high": None,
            "week_52_low": None,
            "source": self.name,
        }


class PlaceholderLicensedProvider:
    def __init__(self, name: str) -> None:
        self.name = name

    def live_candles(self, symbol: str, timeframe: str, limit: int, identity: MarketIdentity) -> dict[str, Any]:
        raise ProviderNotConfiguredError(
            f"{self.name} is selected but credentials/client integration are not configured yet"
        )

    def live_quote(self, symbol: str, identity: MarketIdentity) -> dict[str, Any]:
        raise ProviderNotConfiguredError(
            f"{self.name} is selected but credentials/client integration are not configured yet"
        )


class MockMarketDataProvider:
    name = "mock"

    def live_candles(self, symbol: str, timeframe: str, limit: int, identity: MarketIdentity) -> dict[str, Any]:
        sym = symbol.upper()
        count = min(limit, 240)
        base = 1327.8 if sym == "RELIANCE" else 2847.0 if sym == "DEEPAKNTR" else 14220.0 if sym == "DIXON" else 4956.0
        candles: list[dict[str, Any]] = []
        price = base * 0.78
        for i in range(count):
            trend = (base - price) / max(1, count - i)
            wave = base * 0.008
            open_price = price
            close = price + trend + (wave if i % 4 in (1, 2) else -wave * 0.45)
            high = max(open_price, close) * 1.01
            low = min(open_price, close) * 0.99
            price = close
            candles.append({
                "time": f"2026-04-{(i % 24) + 1:02d}" if count <= 24 else f"2025-09-{(i % 28) + 1:02d}",
                "open": round(open_price, 2),
                "high": round(high, 2),
                "low": round(low, 2),
                "close": round(close, 2),
                "volume": 900000 + i * 7500,
            })
        last = candles[-1]
        prev_close = candles[-2]["close"] if len(candles) >= 2 else last["close"]
        return {
            "symbol": sym,
            "company_name": sym,
            "sector": None,
            "market": identity.market,
            "currency": identity.currency,
            "timeframe": timeframe.upper(),
            "source": self.name,
            "candles": candles,
            "latest": {
                "close": last["close"],
                "open": last["open"],
                "high": last["high"],
                "low": last["low"],
                "volume": last["volume"],
                "prev_close": prev_close,
                "pct_change": round((last["close"] - prev_close) / prev_close * 100, 2) if prev_close else None,
                "week_52_high": round(base * 1.12, 2),
                "week_52_low": round(base * 0.72, 2),
                "rsi_14": 62,
                "ema_20": round(last["close"] * 0.985, 2),
                "ema_50": round(last["close"] * 0.96, 2),
                "ema_200": round(last["close"] * 0.9, 2),
                "atr_14": round(last["close"] * 0.024, 2),
                "volume_ratio": 1.6,
            },
        }

    def live_quote(self, symbol: str, identity: MarketIdentity) -> dict[str, Any]:
        data = self.live_candles(symbol, "D", 24, identity)
        latest = data["latest"]
        return {
            "symbol": data["symbol"],
            "market": identity.market,
            "currency": identity.currency,
            "close": latest["close"],
            "open": latest["open"],
            "high": latest["high"],
            "low": latest["low"],
            "volume": latest["volume"],
            "prev_close": latest["prev_close"],
            "pct_change": latest["pct_change"],
            "week_52_high": latest["week_52_high"],
            "week_52_low": latest["week_52_low"],
            "source": self.name,
        }


def get_market_data_provider() -> MarketDataProvider:
    provider = os.getenv("MARKET_DATA_PROVIDER", "yahoo").strip().lower()
    if provider == "mock":
        return MockMarketDataProvider()
    if provider in {"yahoo", "yfinance", "yahoo_finance"}:
        return YahooMarketDataProvider()
    if provider in {"kite", "zerodha"}:
        return KiteMarketDataProvider()
    if provider in {"truedata", "true_data"}:
        return PlaceholderLicensedProvider("truedata")
    if provider in {"globaldatafeeds", "global_datafeeds", "gdf"}:
        return PlaceholderLicensedProvider("globaldatafeeds")
    raise ProviderNotConfiguredError(f"Unknown MARKET_DATA_PROVIDER: {provider}")
