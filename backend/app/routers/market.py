"""
Market overview router — breadth, sector, movers for the dashboard.
"""
from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from time import monotonic

from fastapi import APIRouter, Depends

from app.middleware.auth import get_current_user_id
from app.services.market_data import MarketDataError, MarketIdentity, ProviderNotConfiguredError, get_market_data_provider
from app.services.market_dates import get_latest_complete_trade_date
from app.services.supabase import get_admin_client

router = APIRouter(prefix="/api/v1/market", tags=["market"])

OVERVIEW_CACHE_TTL_SECONDS = 60
_overview_cache: dict | None = None
_overview_cache_expires_at = 0.0


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
    provider = get_market_data_provider()
    indexes = [
        ("NIFTY", "NIFTY 50", MarketIdentity(market="NSE", currency="INR")),
        ("BANKNIFTY", "BANK NIFTY", MarketIdentity(market="NSE", currency="INR")),
        ("VIX", "India VIX", MarketIdentity(market="NSE", currency="INR")),
    ]
    quotes: list[dict] = []
    live = True
    for symbol, label, identity in indexes:
        try:
            q = provider.live_quote(symbol, identity)
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
