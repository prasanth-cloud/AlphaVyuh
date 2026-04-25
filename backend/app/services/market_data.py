from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any, Protocol

import yfinance as yf


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
        return PlaceholderLicensedProvider("kite")
    if provider in {"truedata", "true_data"}:
        return PlaceholderLicensedProvider("truedata")
    if provider in {"globaldatafeeds", "global_datafeeds", "gdf"}:
        return PlaceholderLicensedProvider("globaldatafeeds")
    raise ProviderNotConfiguredError(f"Unknown MARKET_DATA_PROVIDER: {provider}")
