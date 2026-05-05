from __future__ import annotations

import asyncio
import logging
import os
import threading
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from app.services.market_data import (
    MarketDataError,
    MarketIdentity,
    ProviderNotConfiguredError,
    _kite_access_token,
    _kite_api_key,
    KiteMarketDataProvider,
)

logger = logging.getLogger(__name__)


class KiteStreamError(RuntimeError):
    pass


@dataclass(frozen=True)
class _Subscriber:
    loop: asyncio.AbstractEventLoop
    queue: asyncio.Queue[dict[str, Any]]
    symbols: frozenset[str]


class KiteLiveTicker:
    """Shared KiteTicker connection with per-request fan-out queues.

    Kite allows a small number of websocket connections per API key. Keeping one
    process-wide connection avoids opening a broker socket for every browser tab.
    The frontend receives sanitized ticks over an authenticated HTTP stream.
    """

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._ticker: Any | None = None
        self._connected = False
        self._connecting = False
        self._subscribers: set[_Subscriber] = set()
        self._token_to_symbol: dict[int, str] = {}
        self._symbol_to_token: dict[str, int] = {}
        self._latest: dict[str, dict[str, Any]] = {}
        self._last_error: str | None = None
        self._provider = KiteMarketDataProvider()

    def status(self) -> dict[str, Any]:
        with self._lock:
            return {
                "provider": "kite",
                "connected": self._connected,
                "connecting": self._connecting,
                "subscribed_symbols": sorted(self._symbol_to_token.keys()),
                "subscriber_count": len(self._subscribers),
                "last_error": self._last_error,
            }

    def snapshot(self, symbols: list[str]) -> list[dict[str, Any]]:
        requested = {s.upper() for s in symbols}
        with self._lock:
            return [tick for symbol, tick in self._latest.items() if symbol in requested]

    async def subscribe(self, symbols: list[str], mode: str = "quote") -> _Subscriber:
        clean_symbols = sorted({s.strip().upper() for s in symbols if s.strip()})[:200]
        if not clean_symbols:
            raise KiteStreamError("At least one symbol is required")

        tokens = self._resolve_tokens(clean_symbols)
        if not tokens:
            raise KiteStreamError("No Kite instrument tokens found for requested symbols")

        subscriber = _Subscriber(
            loop=asyncio.get_running_loop(),
            queue=asyncio.Queue(maxsize=128),
            symbols=frozenset(clean_symbols),
        )
        with self._lock:
            self._subscribers.add(subscriber)

        self._ensure_ticker()
        self._subscribe_tokens(tokens, mode=mode)

        initial = self.snapshot(clean_symbols)
        if initial:
            await subscriber.queue.put({"type": "snapshot", "ticks": initial})

        return subscriber

    def unsubscribe(self, subscriber: _Subscriber) -> None:
        with self._lock:
            self._subscribers.discard(subscriber)

    def _resolve_tokens(self, symbols: list[str]) -> list[int]:
        tokens: list[int] = []
        with self._lock:
            unresolved = [symbol for symbol in symbols if symbol not in self._symbol_to_token]
            for symbol in symbols:
                token = self._symbol_to_token.get(symbol)
                if token is not None:
                    tokens.append(token)

        for symbol in unresolved:
            try:
                inst = self._provider._instrument(symbol, MarketIdentity())
                token = int(inst["instrument_token"])
            except (MarketDataError, ProviderNotConfiguredError, Exception) as exc:
                logger.warning("Kite stream instrument lookup failed for %s: %s", symbol, exc)
                continue
            with self._lock:
                self._symbol_to_token[symbol] = token
                self._token_to_symbol[token] = symbol
            tokens.append(token)

        return sorted(set(tokens))

    def _ensure_ticker(self) -> None:
        with self._lock:
            if self._ticker or self._connecting or self._connected:
                return
            self._connecting = True

        api_key = _kite_api_key() or os.getenv("KITE_API_KEY", "").strip()
        if not api_key:
            with self._lock:
                self._connecting = False
                self._last_error = "KITE_API_KEY is not configured"
            raise KiteStreamError("KITE_API_KEY is not configured")

        try:
            from kiteconnect import KiteTicker
        except Exception as exc:
            with self._lock:
                self._connecting = False
                self._last_error = "kiteconnect package is not installed"
            raise KiteStreamError("kiteconnect package is not installed") from exc

        access_token = _kite_access_token()
        ticker = KiteTicker(api_key, access_token)
        ticker.on_ticks = self._on_ticks
        ticker.on_connect = self._on_connect
        ticker.on_close = self._on_close
        ticker.on_error = self._on_error
        ticker.on_noreconnect = self._on_noreconnect

        with self._lock:
            self._ticker = ticker

        try:
            ticker.connect(threaded=True)
        except Exception as exc:
            with self._lock:
                self._ticker = None
                self._connecting = False
                self._connected = False
                self._last_error = str(exc)
            raise KiteStreamError(f"Kite websocket failed to start: {exc}") from exc

    def _subscribe_tokens(self, tokens: list[int], mode: str) -> None:
        if not tokens:
            return
        with self._lock:
            ticker = self._ticker
            connected = self._connected
        if not ticker or not connected:
            return

        try:
            ticker.subscribe(tokens)
            selected_mode = {
                "ltp": ticker.MODE_LTP,
                "full": ticker.MODE_FULL,
            }.get(mode, ticker.MODE_QUOTE)
            ticker.set_mode(selected_mode, tokens)
        except Exception as exc:
            logger.warning("Kite stream subscribe failed: %s", exc)
            with self._lock:
                self._last_error = str(exc)

    def _on_connect(self, ws: Any, _response: Any) -> None:
        with self._lock:
            self._connected = True
            self._connecting = False
            self._last_error = None
            tokens = sorted(set(self._symbol_to_token.values()))
        if tokens:
            self._subscribe_tokens(tokens, mode="quote")

    def _on_close(self, _ws: Any, code: int, reason: str) -> None:
        with self._lock:
            self._connected = False
            self._connecting = False
            self._last_error = f"closed {code}: {reason}"
        logger.warning("Kite websocket closed: %s %s", code, reason)

    def _on_error(self, _ws: Any, code: int, reason: str) -> None:
        with self._lock:
            self._last_error = f"{code}: {reason}"
        logger.warning("Kite websocket error: %s %s", code, reason)

    def _on_noreconnect(self, _ws: Any) -> None:
        with self._lock:
            self._connected = False
            self._connecting = False
            self._last_error = "Kite websocket reconnect attempts exhausted"

    def _on_ticks(self, _ws: Any, ticks: list[dict[str, Any]]) -> None:
        now = datetime.now(timezone.utc).isoformat()
        outbound: list[dict[str, Any]] = []
        with self._lock:
            for raw in ticks:
                token = int(raw.get("instrument_token") or 0)
                symbol = self._token_to_symbol.get(token)
                if not symbol:
                    continue
                tick = self._normalize_tick(symbol, raw, now)
                self._latest[symbol] = tick
                outbound.append(tick)
            subscribers = list(self._subscribers)

        if not outbound:
            return

        for subscriber in subscribers:
            scoped = [tick for tick in outbound if tick["symbol"] in subscriber.symbols]
            if not scoped:
                continue
            self._enqueue(subscriber, {"type": "tick", "ticks": scoped})

    def _enqueue(self, subscriber: _Subscriber, payload: dict[str, Any]) -> None:
        def put() -> None:
            if subscriber.queue.full():
                try:
                    subscriber.queue.get_nowait()
                except asyncio.QueueEmpty:
                    pass
            subscriber.queue.put_nowait(payload)

        subscriber.loop.call_soon_threadsafe(put)

    @staticmethod
    def _normalize_tick(symbol: str, raw: dict[str, Any], timestamp: str) -> dict[str, Any]:
        ohlc = raw.get("ohlc") or {}
        last_price = raw.get("last_price")
        prev_close = ohlc.get("close") or raw.get("close")
        pct_change = raw.get("change")
        if pct_change is None and last_price is not None and prev_close:
            pct_change = (float(last_price) - float(prev_close)) / float(prev_close) * 100

        return {
            "symbol": symbol,
            "instrument_token": raw.get("instrument_token"),
            "close": round(float(last_price), 2) if last_price is not None else None,
            "open": round(float(ohlc["open"]), 2) if ohlc.get("open") is not None else None,
            "high": round(float(ohlc["high"]), 2) if ohlc.get("high") is not None else None,
            "low": round(float(ohlc["low"]), 2) if ohlc.get("low") is not None else None,
            "prev_close": round(float(prev_close), 2) if prev_close is not None else None,
            "pct_change": round(float(pct_change), 2) if pct_change is not None else None,
            "volume": int(raw.get("volume_traded") or raw.get("volume") or 0),
            "source": "kite_ws",
            "as_of": timestamp,
        }


kite_live_ticker = KiteLiveTicker()
