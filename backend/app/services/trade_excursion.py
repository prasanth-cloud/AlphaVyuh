"""Broker-backed intraday paths and deterministic MAE/MFE calculations.

The provider adapter is intentionally read-only. Credentials are fetched from
the encrypted broker-credential boundary and are never included in returned
objects, persisted payloads, or log messages.
"""
from __future__ import annotations

import math
import os
from dataclasses import dataclass
from datetime import date, datetime, time, timezone
from io import StringIO
from typing import Any, Literal
from zoneinfo import ZoneInfo

import pandas as pd

from app.brokers.credentials import get_broker_credential
from app.brokers.kite import api as kite_api
from app.brokers.kite.api import KiteApiError

INTRADAY_INTERVALS = ("5minute", "15minute", "30minute", "60minute")
MAX_PATH_BARS = 20_000
INDIA_TZ = ZoneInfo("Asia/Kolkata")


class IntradayPathError(RuntimeError):
    """A safe, user-facing classification for a read-only path failure."""

    def __init__(self, kind: Literal["auth", "config", "provider", "rate"], message: str) -> None:
        self.kind = kind
        super().__init__(message)


@dataclass(frozen=True)
class CapturedIntradayPath:
    symbol: str
    broker: str
    interval: str
    source: str
    from_at: str
    to_at: str
    bars: list[dict[str, Any]]


def _finite_number(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def _parse_provider_time(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        parsed = value
    else:
        raw = str(value or "").strip()
        if not raw:
            return None
        try:
            parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        except ValueError:
            return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=INDIA_TZ)
    return parsed.astimezone(timezone.utc)


def normalize_kite_candles(raw_candles: list[list[Any]] | None) -> list[dict[str, Any]]:
    """Validate and normalize Kite's positional candle arrays."""
    normalized: dict[str, dict[str, Any]] = {}
    for raw in raw_candles or []:
        if not isinstance(raw, (list, tuple)) or len(raw) < 6:
            continue
        parsed_time = _parse_provider_time(raw[0])
        values = [_finite_number(raw[index]) for index in range(1, 5)]
        if parsed_time is None or any(value is None for value in values):
            continue
        opened, high, low, close = (float(value) for value in values if value is not None)
        if min(opened, high, low, close) <= 0 or high < max(opened, close) or low > min(opened, close):
            continue
        volume = _finite_number(raw[5])
        if volume is None or volume < 0:
            volume = 0
        key = parsed_time.isoformat()
        normalized[key] = {
            "time": key,
            "open": round(opened, 4),
            "high": round(high, 4),
            "low": round(low, 4),
            "close": round(close, 4),
            "volume": int(volume),
        }
        if len(normalized) >= MAX_PATH_BARS:
            break
    return [normalized[key] for key in sorted(normalized)]


def _window_bounds(entry_date: str, exit_date: str) -> tuple[date, date, str, str]:
    try:
        start = date.fromisoformat(entry_date[:10])
        end = date.fromisoformat(exit_date[:10])
    except ValueError as exc:
        raise IntradayPathError("provider", "The trade dates are not valid for intraday capture.") from exc
    if start > end:
        raise IntradayPathError("provider", "The trade entry date must be on or before the exit date.")
    start_local = datetime.combine(start, time.min, tzinfo=INDIA_TZ).astimezone(timezone.utc)
    end_local = datetime.combine(end, time.max, tzinfo=INDIA_TZ).astimezone(timezone.utc)
    return start, end, start_local.isoformat(), end_local.isoformat()


def _provider_error(exc: KiteApiError) -> IntradayPathError:
    error_type = str(exc.error_type or "").lower()
    if exc.status in {401, 403} or "token" in error_type or "auth" in error_type:
        return IntradayPathError("auth", "The Zerodha session expired. Reconnect the broker and try again.")
    if exc.status == 429 or "rate" in error_type:
        return IntradayPathError("rate", "Zerodha rate limits prevented intraday capture. Try again shortly.")
    return IntradayPathError("provider", "Zerodha did not return an intraday path for this trade.")


def _resolve_nse_instrument_token(symbol: str) -> int:
    api_key = os.environ.get("KITE_API_KEY", "").strip()
    if not api_key:
        raise IntradayPathError("config", "Zerodha intraday capture is not configured yet.")
    try:
        csv_text = kite_api.get_instruments(exchange="NSE", access_token=None, api_key=api_key)
    except KiteApiError as exc:
        raise _provider_error(exc) from exc
    try:
        instruments = pd.read_csv(StringIO(csv_text))
        match = instruments[
            (instruments["tradingsymbol"].astype(str).str.upper() == symbol.upper())
            & (instruments["exchange"].astype(str).str.upper() == "NSE")
        ]
        if match.empty:
            raise IntradayPathError("provider", "The Zerodha instrument was not found for this symbol.")
        return int(match.iloc[0]["instrument_token"])
    except IntradayPathError:
        raise
    except (KeyError, TypeError, ValueError, IndexError) as exc:
        raise IntradayPathError("provider", "Zerodha returned an invalid instrument directory.") from exc


def capture_zerodha_intraday_path(
    *,
    user_id: str,
    symbol: str,
    entry_date: str,
    exit_date: str,
    interval: str,
) -> CapturedIntradayPath:
    """Fetch one user's read-only Kite path and return normalized bars."""
    if interval not in INTRADAY_INTERVALS:
        raise IntradayPathError("provider", "Choose a supported intraday interval.")
    normalized_symbol = symbol.strip().upper()
    if not normalized_symbol or len(normalized_symbol) > 40:
        raise IntradayPathError("provider", "A valid equity symbol is required for intraday capture.")
    _start, _end, from_at, to_at = _window_bounds(entry_date, exit_date)
    try:
        access_token = get_broker_credential(user_id, "zerodha", "access_token")
    except Exception as exc:
        raise IntradayPathError("auth", "The Zerodha account is not connected. Reconnect and try again.") from exc
    if not access_token:
        raise IntradayPathError("auth", "The Zerodha account is not connected. Reconnect and try again.")

    instrument_token = _resolve_nse_instrument_token(normalized_symbol)
    try:
        raw_candles = kite_api.get_historical_data(
            access_token,
            instrument_token,
            interval,
            f"{entry_date[:10]} 00:00:00",
            f"{exit_date[:10]} 23:59:59",
            api_key=os.environ.get("KITE_API_KEY", "").strip(),
        )
    except KiteApiError as exc:
        raise _provider_error(exc) from exc

    bars = normalize_kite_candles(raw_candles)
    if not bars:
        raise IntradayPathError("provider", "Zerodha returned no valid intraday bars for this trade window.")
    return CapturedIntradayPath(
        symbol=normalized_symbol,
        broker="zerodha",
        interval=interval,
        source="zerodha_kite",
        from_at=from_at,
        to_at=to_at,
        bars=bars,
    )


def calculate_excursion(
    entry: dict[str, Any],
    bars: list[dict[str, Any]],
    *,
    basis: str,
    interval: str | None = None,
    source: str | None = None,
) -> dict[str, Any] | None:
    """Calculate MAE/MFE from normalized bars for long or short trades."""
    entry_price = _finite_number(entry.get("entry_price"))
    if entry_price is None or entry_price <= 0 or not bars:
        return None
    highs = [_finite_number(bar.get("high")) for bar in bars]
    lows = [_finite_number(bar.get("low")) for bar in bars]
    highs = [value for value in highs if value is not None]
    lows = [value for value in lows if value is not None]
    if not highs or not lows:
        return None

    trade_type = str(entry.get("trade_type") or "long").lower()
    if trade_type == "short":
        mae_price = min(0.0, entry_price - max(highs))
        mfe_price = max(0.0, entry_price - min(lows))
    else:
        mae_price = min(0.0, min(lows) - entry_price)
        mfe_price = max(0.0, max(highs) - entry_price)
    risk_price = _finite_number(entry.get("stop_loss"))
    if risk_price is not None:
        risk_price = entry_price - risk_price if trade_type == "long" else risk_price - entry_price
    row: dict[str, Any] = {
        "journal_entry_id": str(entry.get("id")) if entry.get("id") is not None else None,
        "symbol": str(entry.get("symbol") or "").upper(),
        "mae_pct": round(mae_price / entry_price * 100, 2),
        "mfe_pct": round(mfe_price / entry_price * 100, 2),
        "mae_r": round(mae_price / risk_price, 2) if risk_price and risk_price > 0 else None,
        "mfe_r": round(mfe_price / risk_price, 2) if risk_price and risk_price > 0 else None,
        "bars_count": len(bars),
        "basis": basis,
    }
    if interval is not None:
        row["interval"] = interval
    if source is not None:
        row["source"] = source
    return row
