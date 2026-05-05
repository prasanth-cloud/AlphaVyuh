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
from app.services.market_dates import get_latest_complete_trade_date
from app.services.supabase import get_admin_client

router = APIRouter(prefix="/api/v1/market", tags=["market"])

OVERVIEW_CACHE_TTL_SECONDS = 60
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
    }


def _unavailable_overview(latest_date, indices: list[dict], quote_source: str, indices_live: bool) -> dict:
    overview = _empty_overview(latest_date, indices, quote_source, indices_live)
    overview["mode"] = "unavailable"
    overview["message"] = "Market summary is temporarily unavailable; dashboard will use the latest known shell data."
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

    # Fetch all NSE EQ rows for latest date
    try:
        rows = (
            sb.table("daily_ohlcv")
            .select(
                "symbol,close,prev_close,open,high,low,volume,avg_volume_20d,"
                "week_52_high,week_52_low,rsi_14,ema_20,ema_50,ema_200,atr_14,"
                "stock_universe!daily_ohlcv_symbol_fkey!inner(symbol,company_name,series,sector,market,is_active)"
            )
            .eq("trade_date", latest_date)
            .limit(3000)
            .execute()
            .data or []
        )
    except Exception:
        overview = _unavailable_overview(latest_date, indices, quote_source, indices_live)
        _overview_cache = deepcopy(overview)
        _overview_cache_expires_at = monotonic() + OVERVIEW_CACHE_TTL_SECONDS
        return overview

    # Filter NSE EQ active only (avoid double-counting BSE cross-listings)
    rows = [
        r for r in rows
        if (r.get("stock_universe") or {}).get("series") == "EQ"
        and (r.get("stock_universe") or {}).get("market") == "NSE"
        and (r.get("stock_universe") or {}).get("is_active", True)
    ]

    def _f(v, default=0.0):
        try:
            return float(v) if v is not None else default
        except (TypeError, ValueError):
            return default

    # Compute metrics per row
    enriched = []
    for r in rows:
        su = r.get("stock_universe") or {}
        close = _f(r.get("close"))
        prev_close = _f(r.get("prev_close"))
        volume = int(r.get("volume") or 0)
        avg_vol = int(r.get("avg_volume_20d") or 0)

        pct = round((close - prev_close) / prev_close * 100, 2) if prev_close else 0.0

        vol_ratio = round(volume / avg_vol, 2) if avg_vol else None
        w52h = _f(r.get("week_52_high"), None)
        w52l = _f(r.get("week_52_low"), None)
        w52h_pct = round((w52h - close) / close * 100, 2) if w52h and close else None
        is_new_52w_high = bool(w52h and close and close >= w52h * 0.995)
        is_new_52w_low  = bool(w52l and close and close <= w52l * 1.005)

        enriched.append({
            "symbol": r["symbol"],
            "company_name": su.get("company_name") or r["symbol"],
            "sector": su.get("sector"),
            "close": close,
            "pct_change": pct,
            "volume": volume,
            "avg_volume_20d": avg_vol,
            "volume_ratio": vol_ratio,
            "ema_20": _f(r.get("ema_20"), None),
            "ema_50": _f(r.get("ema_50"), None),
            "ema_200": _f(r.get("ema_200"), None),
            "week_52_high": w52h,
            "week_52_high_pct": w52h_pct,
            "is_new_52w_high": is_new_52w_high,
            "is_new_52w_low": is_new_52w_low,
        })

    total = len(enriched)
    if total == 0:
        overview = _empty_overview(latest_date, indices, quote_source, indices_live)
        _overview_cache = deepcopy(overview)
        _overview_cache_expires_at = monotonic() + OVERVIEW_CACHE_TTL_SECONDS
        return overview

    # Breadth counts
    advances = sum(1 for r in enriched if r["pct_change"] > 0.05)
    declines  = sum(1 for r in enriched if r["pct_change"] < -0.05)
    unchanged = total - advances - declines
    new_highs = sum(1 for r in enriched if r["is_new_52w_high"])
    new_lows  = sum(1 for r in enriched if r["is_new_52w_low"])
    # fallback if flag not populated: use 52w_high_pct
    if new_highs == 0:
        new_highs = sum(1 for r in enriched if r.get("week_52_high_pct") is not None and r["week_52_high_pct"] <= 0.5)

    ad_ratio = round(advances / declines, 2) if declines else float(advances)

    # EMA breadth. Use valid indicator counts as the denominator so a partial
    # ingest cannot display 0% just because some EMA columns are still empty.
    valid_ema20 = sum(1 for r in enriched if r["ema_20"])
    valid_ema50 = sum(1 for r in enriched if r["ema_50"])
    valid_ema200 = sum(1 for r in enriched if r["ema_200"])
    above_ema20 = sum(1 for r in enriched if r["ema_20"] and r["close"] > r["ema_20"])
    above_ema50 = sum(1 for r in enriched if r["ema_50"] and r["close"] > r["ema_50"])
    above_ema200 = sum(1 for r in enriched if r["ema_200"] and r["close"] > r["ema_200"])

    def pct(n, denominator=total): return round(n / denominator * 100, 1) if denominator else 0

    above_ema200_pct = pct(above_ema200, valid_ema200)
    above_ema20_pct = pct(above_ema20, valid_ema20)
    above_ema50_pct = pct(above_ema50, valid_ema50)

    # Market phase
    if above_ema200_pct >= 60:
        phase = "Bullish"
        phase_desc = f"Strong breadth — {above_ema20_pct}% of stocks above 20 EMA"
    elif above_ema200_pct <= 40:
        phase = "Bearish"
        phase_desc = f"Weak breadth — only {above_ema200_pct}% of stocks above 200 EMA"
    else:
        phase = "Neutral"
        phase_desc = f"Mixed market — {above_ema200_pct}% of stocks above 200 EMA"

    # Sector breadth
    from collections import defaultdict
    sector_map: dict = defaultdict(lambda: {"total": 0, "advances": 0, "declines": 0, "pct_sum": 0.0})
    for r in enriched:
        sec = r["sector"] or "Unknown"
        sector_map[sec]["total"] += 1
        if r["pct_change"] > 0.05:
            sector_map[sec]["advances"] += 1
        elif r["pct_change"] < -0.05:
            sector_map[sec]["declines"] += 1
        sector_map[sec]["pct_sum"] += r["pct_change"]

    sector_breadth = []
    for sec, d in sector_map.items():
        if d["total"] < 3:
            continue
        sector_breadth.append({
            "sector": sec,
            "total": d["total"],
            "advances": d["advances"],
            "declines": d["declines"],
            "avg_pct_change": round(d["pct_sum"] / d["total"], 2),
            "breadth_pct": round(d["advances"] / d["total"] * 100, 1),
        })
    sector_breadth.sort(key=lambda x: x["breadth_pct"], reverse=True)

    # Top movers
    with_pct = [r for r in enriched if r["pct_change"] is not None]
    top_gainers = sorted(with_pct, key=lambda x: x["pct_change"], reverse=True)[:5]
    top_losers  = sorted(with_pct, key=lambda x: x["pct_change"])[:5]
    with_vol = [r for r in enriched if r["volume_ratio"] is not None]
    most_active = sorted(with_vol, key=lambda x: x["volume_ratio"] or 0, reverse=True)[:5]

    def _mover(r):
        return {
            "symbol": r["symbol"],
            "company_name": r["company_name"],
            "close": r["close"],
            "pct_change": r["pct_change"],
            "volume_ratio": r["volume_ratio"],
        }

    overview = {
        "trade_date": latest_date,
        "advances": advances,
        "declines": declines,
        "unchanged": unchanged,
        "total": total,
        "advance_decline_ratio": ad_ratio,
        "new_52w_highs": new_highs,
        "new_52w_lows": new_lows,
        "above_ema20_count": above_ema20,
        "above_ema20_pct": above_ema20_pct,
        "above_ema50_count": above_ema50,
        "above_ema50_pct": above_ema50_pct,
        "above_ema200_count": above_ema200,
        "above_ema200_pct": above_ema200_pct,
        "market_phase": phase,
        "market_phase_desc": phase_desc,
        "sector_breadth": sector_breadth[:12],
        "sector_breadth_basis": "latest_complete_session",
        "sector_breadth_source": "daily_ohlcv",
        "top_sectors": sector_breadth[:5],
        "top_gainers": [_mover(r) for r in top_gainers],
        "top_losers":  [_mover(r) for r in top_losers],
        "most_active": [_mover(r) for r in most_active],
        "indices": indices,
        "market_data_source": quote_source,
        "is_live": indices_live,
        "as_of": latest_date,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "cache_status": "miss",
    }
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
