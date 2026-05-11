"""
Market overview router — breadth, sector, movers for the dashboard.
"""
from __future__ import annotations

import asyncio
from copy import deepcopy
from datetime import datetime, timezone
import json
import os
from time import monotonic

from fastapi import APIRouter, Depends, Query
from starlette.responses import StreamingResponse

from app.middleware.auth import get_current_user_id
from app.services.kite_stream import KiteStreamError, kite_live_ticker
from app.services.market_data import MarketDataError, MarketIdentity, ProviderNotConfiguredError, _kite_access_token, _kite_api_key, get_market_data_provider
from app.services.market_breadth_snapshot import build_market_breadth_snapshot, read_market_breadth_snapshot
from app.services.market_context import eod_source_metadata, fallback_source_metadata
from app.services.market_dates import get_latest_complete_trade_date
from app.services.supabase import get_admin_client

router = APIRouter(prefix="/api/v1/market", tags=["market"])

OVERVIEW_CACHE_TTL_SECONDS = 300
_overview_cache: dict | None = None
_overview_cache_expires_at = 0.0

SECTOR_INDEXES = [
    ("NIFTY IT", "IT"),
    ("NIFTY BANK", "Banks"),
    ("NIFTY PHARMA", "Pharma"),
    ("NIFTY AUTO", "Auto"),
    ("NIFTY FMCG", "FMCG"),
    ("NIFTY METAL", "Metal"),
    ("NIFTY REALTY", "Realty"),
    ("NIFTY ENERGY", "Energy"),
    ("NIFTY PSU BANK", "PSU banks"),
    ("NIFTY PVT BANK", "Private banks"),
    ("NIFTY FIN SERVICE", "Financial services"),
    ("NIFTY OIL AND GAS", "Oil and gas"),
]


def _sse(event: str, payload: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(payload, separators=(',', ':'))}\n\n"


def _finite_float(value, default=None):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    if number != number or number in (float("inf"), float("-inf")):
        return default
    return number


def _empty_overview(latest_date, indices: list[dict], quote_source: str, indices_live: bool) -> dict:
    metadata = eod_source_metadata(
        as_of=latest_date,
        status="unknown" if latest_date is None else "healthy",
        symbols_count=0,
        cache_status="miss",
    )
    return {
        "trade_date": latest_date,
        "advances": 0,
        "declines": 0,
        "unchanged": 0,
        "total": 0,
        "advance_decline_ratio": 0,
        "new_52w_highs": 0,
        "new_52w_lows": 0,
        "above_ema20_count": 0,
        "above_ema20_pct": 0,
        "above_ema50_count": 0,
        "above_ema50_pct": 0,
        "above_ema200_count": 0,
        "above_ema200_pct": 0,
        "market_phase": "Pending",
        "market_phase_desc": "Market breadth will appear after the latest complete trading day is available.",
        "sector_breadth": [],
        "sector_breadth_basis": "latest_complete_session",
        "sector_breadth_source": "daily_ohlcv",
        "top_sectors": [],
        "top_gainers": [],
        "top_losers": [],
        "most_active": [],
        "indices": indices,
        "market_data_source": quote_source,
        "is_live": indices_live,
        "as_of": latest_date,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "cache_status": "miss",
        "provider": metadata,
        "source_metadata": metadata,
    }


def _unavailable_overview(latest_date, indices: list[dict], quote_source: str, indices_live: bool) -> dict:
    overview = _empty_overview(latest_date, indices, quote_source, indices_live)
    overview["mode"] = "unavailable"
    overview["message"] = "Market summary is temporarily unavailable; dashboard will use the latest known shell data."
    metadata = fallback_source_metadata(overview["message"], as_of=latest_date)
    overview["provider"] = metadata
    overview["source_metadata"] = metadata
    return overview


def _index_quotes() -> tuple[list[dict], str, bool]:
    indexes = [
        ("NIFTY", "NIFTY 50"),
        ("BANKNIFTY", "BANK NIFTY"),
        ("VIX", "India VIX"),
    ]
    live_ticks = {tick["symbol"]: tick for tick in kite_live_ticker.snapshot([symbol for symbol, _ in indexes])}
    quotes = []
    for symbol, label in indexes:
        tick = live_ticks.get(symbol)
        quotes.append({
            "symbol": symbol,
            "label": label,
            "close": _finite_float((tick or {}).get("close")),
            "pct_change": _finite_float((tick or {}).get("pct_change")),
            "prev_close": _finite_float((tick or {}).get("prev_close")),
            "source": (tick or {}).get("source") or "latest_complete_session",
        })
    return quotes, "kite_ws" if live_ticks else "latest_complete_session", bool(live_ticks)


def _sector_index_quotes() -> tuple[list[dict], str, bool]:
    provider = get_market_data_provider()
    quotes: list[dict] = []
    live = True
    for symbol, label in SECTOR_INDEXES:
        try:
            q = provider.live_quote(symbol, MarketIdentity(market="NSE", currency="INR"))
            quotes.append({
                "symbol": symbol,
                "label": label,
                "close": _finite_float(q.get("close")),
                "pct_change": _finite_float(q.get("pct_change")),
                "prev_close": _finite_float(q.get("prev_close")),
                "source": q.get("source") or provider.name,
            })
        except (ProviderNotConfiguredError, MarketDataError, Exception) as exc:
            live = False
            quotes.append({
                "symbol": symbol,
                "label": label,
                "close": None,
                "pct_change": None,
                "prev_close": None,
                "source": provider.name,
                "error": str(exc),
            })
    return quotes, provider.name, live


def _kite_market_status() -> dict:
    api_key = _kite_api_key()
    access_token_configured = bool(os.getenv("KITE_ACCESS_TOKEN", "").strip())
    token_valid = False
    profile_error = None
    if api_key and access_token_configured:
        try:
            from app.brokers.kite import api as kite_api
            profile = kite_api.get_profile(_kite_access_token(), api_key=api_key)
            token_valid = bool(profile.get("user_id"))
        except Exception as exc:
            profile_error = str(exc)

    stream_status = kite_live_ticker.status()
    return {
        "provider": "kite",
        "api_key_configured": bool(api_key),
        "access_token_configured": access_token_configured,
        "access_token_valid": token_valid,
        "token_refresh": "daily_manual",
        "stream_connected": bool(stream_status.get("connected")),
        "stream_connecting": bool(stream_status.get("connecting")),
        "subscriber_count": stream_status.get("subscriber_count", 0),
        "subscribed_symbols": stream_status.get("subscribed_symbols", []),
        "last_error": stream_status.get("last_error") or profile_error,
    }


@router.get("/overview")
async def market_overview(user_id: str = Depends(get_current_user_id)):
    global _overview_cache, _overview_cache_expires_at

    now = monotonic()
    if _overview_cache and _overview_cache_expires_at > now:
        cached = deepcopy(_overview_cache)
        cached["cache_status"] = "hit"
        return cached

    indices, quote_source, indices_live = _index_quotes()

    try:
        sb = get_admin_client()
    except Exception:
        overview = _unavailable_overview(None, indices, quote_source, indices_live)
        _overview_cache = deepcopy(overview)
        _overview_cache_expires_at = monotonic() + OVERVIEW_CACHE_TTL_SECONDS
        return overview

    try:
        latest_date = get_latest_complete_trade_date(sb)
    except Exception:
        overview = _unavailable_overview(None, indices, quote_source, indices_live)
        _overview_cache = deepcopy(overview)
        _overview_cache_expires_at = monotonic() + OVERVIEW_CACHE_TTL_SECONDS
        return overview
    if not latest_date:
        overview = _empty_overview(None, indices, quote_source, indices_live)
        _overview_cache = deepcopy(overview)
        _overview_cache_expires_at = monotonic() + OVERVIEW_CACHE_TTL_SECONDS
        return overview

    try:
        overview = read_market_breadth_snapshot(sb, latest_date, indices, quote_source, indices_live)
        if overview is None:
            overview = build_market_breadth_snapshot(
                sb,
                latest_date,
                indices=indices,
                quote_source=quote_source,
                indices_live=indices_live,
                cache_status="miss",
            )
    except Exception:
        overview = _unavailable_overview(latest_date, indices, quote_source, indices_live)
    _overview_cache = deepcopy(overview)
    _overview_cache_expires_at = monotonic() + OVERVIEW_CACHE_TTL_SECONDS
    return overview


@router.get("/live/status")
async def live_market_status(user_id: str = Depends(get_current_user_id)):
    return _kite_market_status()


@router.get("/live/sectors")
async def live_sector_indices(user_id: str = Depends(get_current_user_id)):
    sectors, source, is_live = _sector_index_quotes()
    return {
        "basis": "live_sector_indices",
        "source": source,
        "is_live": is_live,
        "as_of": datetime.now(timezone.utc).isoformat(),
        "sectors": sectors,
    }


@router.get("/live/stream")
async def live_market_stream(
    symbols: str = Query(..., min_length=1, description="Comma-separated NSE symbols"),
    mode: str | None = Query(None, pattern="^(ltp|quote|full)$"),
    user_id: str = Depends(get_current_user_id),
):
    requested = [symbol.strip().upper() for symbol in symbols.split(",") if symbol.strip()]
    stream_mode = mode or os.getenv("KITE_STREAM_MODE", "quote").strip().lower() or "quote"
    if stream_mode not in {"ltp", "quote", "full"}:
        stream_mode = "quote"

    async def events():
        subscriber = None
        try:
            subscriber = await kite_live_ticker.subscribe(requested, mode=stream_mode)
            yield _sse("ready", {"provider": "kite_ws", "symbols": requested, "mode": stream_mode})
            while True:
                try:
                    payload = await asyncio.wait_for(subscriber.queue.get(), timeout=15)
                    yield _sse(payload.get("type", "tick"), payload)
                except asyncio.TimeoutError:
                    yield _sse("heartbeat", {"provider": "kite_ws", "ts": datetime.now(timezone.utc).isoformat()})
        except KiteStreamError as exc:
            yield _sse("error", {"provider": "kite_ws", "message": str(exc)})
        finally:
            if subscriber is not None:
                kite_live_ticker.unsubscribe(subscriber)

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
