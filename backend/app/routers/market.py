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

from fastapi import APIRouter, Depends, HTTPException, Query
from starlette.responses import StreamingResponse

from app.middleware.auth import get_current_user_id, get_current_user_token
from app.services.kite_stream import KiteStreamError, kite_live_ticker
from app.services.market_data import MarketDataError, MarketIdentity, ProviderNotConfiguredError, _kite_access_token, _kite_api_key, get_market_data_provider
from app.services.market_breadth_snapshot import (
    build_market_breadth_snapshot,
    read_latest_market_breadth_snapshot,
    read_market_breadth_snapshot,
)
from app.services.market_context import eod_source_metadata, fallback_source_metadata
from app.services.market_analytics import load_market_analytics
from app.services.market_dates import get_latest_complete_trade_date
from app.services.sector_taxonomy import NSE_SECTORAL_INDEXES, build_sector_taxonomy_metadata
from app.services.supabase import get_admin_client, get_user_client
from app.services.rate_limit import market_live_limiter

router = APIRouter(prefix="/api/v1/market", tags=["market"])

OVERVIEW_CACHE_TTL_SECONDS = 300
_overview_cache: dict | None = None
_overview_cache_expires_at = 0.0
ANALYTICS_CACHE_TTL_SECONDS = 300
_analytics_cache: dict | None = None
_analytics_cache_expires_at = 0.0
LIVE_MARKET_STATUS_CACHE_TTL_SECONDS = 30
LIVE_SECTOR_INDEX_CACHE_TTL_SECONDS = 30
_live_status_cache: dict | None = None
_live_status_cache_expires_at = 0.0
_live_sector_cache: dict | None = None
_live_sector_cache_expires_at = 0.0

SECTOR_INDEXES = [(index["symbol"], index["label"]) for index in NSE_SECTORAL_INDEXES]


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
        "sector_taxonomy": build_sector_taxonomy_metadata([], active_count=0, hidden_min_active_symbols=1),
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


def _enforce_live_market_limit(user_id: str, scope: str) -> None:
    key = f"{scope}:{user_id}"
    if not market_live_limiter.is_allowed(key):
        retry_after = market_live_limiter.retry_after(key)
        raise HTTPException(
            status_code=429,
            detail=f"Too many live market data requests - try again in {retry_after} seconds.",
            headers={"Retry-After": str(retry_after)},
        )


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
        overview = read_latest_market_breadth_snapshot(sb, indices, quote_source, indices_live)
    except Exception:
        overview = None

    if overview is None:
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
        except Exception:
            overview = None

        if overview is None:
            try:
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


@router.get("/analytics")
async def market_analytics(user_token: str = Depends(get_current_user_token)):
    """Completed-session Market Pulse and relative sector participation context."""
    global _analytics_cache, _analytics_cache_expires_at

    now = monotonic()
    if _analytics_cache and _analytics_cache_expires_at > now:
        cached = deepcopy(_analytics_cache)
        cached["cache_status"] = "hit"
        for field in ("provenance", "source_metadata"):
            if isinstance(cached.get(field), dict):
                cached[field]["cache_status"] = "hit"
        return cached

    try:
        client = get_user_client(user_token)
        latest_date = get_latest_complete_trade_date(client)
        if not latest_date:
            raise HTTPException(
                status_code=503,
                detail="Market Pulse is temporarily unavailable.",
            )
        payload = load_market_analytics(client, latest_date)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=503,
            detail="Market Pulse is temporarily unavailable.",
        )

    _analytics_cache = deepcopy(payload)
    _analytics_cache_expires_at = monotonic() + ANALYTICS_CACHE_TTL_SECONDS
    return payload


@router.get("/live/status")
async def live_market_status(user_id: str = Depends(get_current_user_id)):
    global _live_status_cache, _live_status_cache_expires_at
    now = monotonic()
    if _live_status_cache and _live_status_cache_expires_at > now:
        cached = deepcopy(_live_status_cache)
        cached["cache_status"] = "hit"
        return cached
    _enforce_live_market_limit(user_id, "live-status")
    payload = _kite_market_status()
    payload["cache_status"] = "miss"
    _live_status_cache = deepcopy(payload)
    _live_status_cache_expires_at = monotonic() + LIVE_MARKET_STATUS_CACHE_TTL_SECONDS
    return payload


@router.get("/live/sectors")
async def live_sector_indices(user_id: str = Depends(get_current_user_id)):
    global _live_sector_cache, _live_sector_cache_expires_at
    now = monotonic()
    if _live_sector_cache and _live_sector_cache_expires_at > now:
        cached = deepcopy(_live_sector_cache)
        cached["cache_status"] = "hit"
        return cached
    _enforce_live_market_limit(user_id, "live-sectors")
    sectors, source, is_live = _sector_index_quotes()
    payload = {
        "basis": "live_sector_indices",
        "source": source,
        "is_live": is_live,
        "as_of": datetime.now(timezone.utc).isoformat(),
        "sectors": sectors,
        "cache_status": "miss",
    }
    _live_sector_cache = deepcopy(payload)
    _live_sector_cache_expires_at = monotonic() + LIVE_SECTOR_INDEX_CACHE_TTL_SECONDS
    return payload


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
            subscriber = await kite_live_ticker.subscribe(requested, mode=stream_mode, user_id=user_id)
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
