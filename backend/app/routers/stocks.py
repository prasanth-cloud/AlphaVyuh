import time

from fastapi import APIRouter, HTTPException, Request, status

import yfinance as yf

from app.services.market_dates import get_latest_complete_trade_date
from app.services.market_breadth_snapshot import read_latest_market_breadth_snapshot
from app.services.market_data import (
    MarketDataError,
    MarketIdentity,
    ProviderNotConfiguredError,
    get_market_data_provider,
    yf_ticker_symbol,
)
from app.services.rate_limit import client_rate_key, public_market_limiter
from app.services.supabase import get_admin_client

router = APIRouter(prefix="/api/v1", tags=["stocks"])

# ── Fundamentals cache (in-memory, 6-hour TTL) ────────────────────────────────
_fund_cache: dict[str, tuple[float, dict]] = {}
_FUND_TTL = 6 * 3600  # seconds
_market_summary_cache: tuple[float, dict] | None = None
_MARKET_SUMMARY_TTL = 5 * 60  # seconds


def _lookup_market(sym: str) -> tuple[str, str]:
    """Return (market, currency) for a symbol. Defaults to NSE/INR when unknown."""
    try:
        r = get_admin_client().table("stock_universe") \
            .select("market,currency").eq("symbol", sym).maybe_single().execute()
        if r and r.data:
            return (r.data.get("market") or "NSE", r.data.get("currency") or "INR")
    except Exception:
        pass
    return ("NSE", "INR")


def _yf_ticker_symbol(sym: str, market: str) -> str:
    """Yahoo Finance uses .NS suffix for NSE stocks, bare symbol for US."""
    return yf_ticker_symbol(sym, market)


def _market_summary_from_snapshot(snapshot: dict) -> dict:
    total = snapshot.get("total_stocks") or snapshot.get("total") or snapshot.get("symbols_count") or 0
    return {
        "trade_date": snapshot.get("trade_date") or snapshot.get("as_of"),
        "advances": snapshot.get("advances") or 0,
        "declines": snapshot.get("declines") or 0,
        "unchanged": snapshot.get("unchanged") or 0,
        "advance_decline_ratio": snapshot.get("advance_decline_ratio"),
        "new_52w_highs": snapshot.get("new_52w_highs") or 0,
        "new_52w_lows": snapshot.get("new_52w_lows") or 0,
        "above_ema20_pct": snapshot.get("above_ema20_pct"),
        "above_ema50_pct": snapshot.get("above_ema50_pct"),
        "above_ema200_pct": snapshot.get("above_ema200_pct"),
        "total_stocks": total,
        "cache_status": snapshot.get("cache_status") or "snapshot",
        "source_metadata": snapshot.get("source_metadata") or snapshot.get("provider"),
    }


def _quote_from_row(row: dict, sym: str) -> dict:
    su = row.get("stock_universe") or {}
    if isinstance(su, list):
        su = su[0] if su else {}

    close = float(row["close"] or 0)
    prev = float(row["prev_close"] or 0)
    vol = int(row["volume"] or 0)
    avg_vol = int(row["avg_volume_20d"] or 0)
    w52h = float(row["week_52_high"]) if row["week_52_high"] is not None else None
    w52l = float(row["week_52_low"]) if row["week_52_low"] is not None else None

    return {
        "symbol": sym,
        "company_name": su.get("company_name"),
        "sector": su.get("sector"),
        "series": su.get("series"),
        "market": su.get("market") or "NSE",
        "currency": su.get("currency") or "INR",
        "trade_date": row["trade_date"],
        "open": float(row["open"] or 0),
        "high": float(row["high"] or 0),
        "low": float(row["low"] or 0),
        "close": close,
        "prev_close": prev,
        "pct_change": round((close - prev) / prev * 100, 2) if prev else None,
        "volume": vol,
        "avg_volume_20d": avg_vol,
        "volume_ratio": round(vol / avg_vol, 2) if avg_vol else None,
        "week_52_high": w52h,
        "week_52_low": w52l,
        "week_52_high_pct": round((w52h - close) / close * 100, 2) if w52h and close else None,
        "week_52_low_pct": round((close - w52l) / w52l * 100, 2) if w52l and close else None,
        "rsi_14": float(row["rsi_14"]) if row["rsi_14"] is not None else None,
        "ema_20": float(row["ema_20"]) if row["ema_20"] is not None else None,
        "ema_50": float(row["ema_50"]) if row["ema_50"] is not None else None,
        "ema_200": float(row["ema_200"]) if row["ema_200"] is not None else None,
        "atr_14": float(row["atr_14"]) if row["atr_14"] is not None else None,
        "turnover": float(row["turnover"]) if row["turnover"] is not None else None,
    }


_QUOTE_SELECT = (
    "symbol, trade_date, open, high, low, close, prev_close, volume, "
    "avg_volume_20d, week_52_high, week_52_low, rsi_14, "
    "ema_20, ema_50, ema_200, atr_14, turnover, "
    "stock_universe!daily_ohlcv_symbol_fkey(company_name, sector, series, market, currency)"
)


@router.get("/stocks/quotes")
async def get_quotes(symbols: str):
    sym_list = [s.strip().upper() for s in symbols.split(",") if s.strip()]
    if not sym_list:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="symbols parameter required")
    if len(sym_list) > 50:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Maximum 50 symbols per request")

    unique_symbols = list(dict.fromkeys(sym_list))
    try:
        client = get_admin_client()
        latest_date = get_latest_complete_trade_date(client)
        if not latest_date:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Quote data is temporarily unavailable.",
            )
        result = (
            client.table("daily_ohlcv")
            .select(_QUOTE_SELECT)
            .eq("trade_date", latest_date)
            .in_("symbol", unique_symbols)
            .execute()
        )
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Quote data is temporarily unavailable.",
        )

    quotes = {
        row["symbol"]: _quote_from_row(row, row["symbol"])
        for row in (result.data or [])
    }
    return quotes


@router.get("/stocks/{symbol}/quote")
async def get_quote(symbol: str):
    sym = symbol.upper()
    try:
        client = get_admin_client()
        result = client.table("daily_ohlcv") \
            .select(
                "symbol, trade_date, open, high, low, close, prev_close, volume, "
                "avg_volume_20d, week_52_high, week_52_low, rsi_14, "
                "ema_20, ema_50, ema_200, atr_14, turnover, "
                "stock_universe!daily_ohlcv_symbol_fkey(company_name, sector, series, market, currency)"
            ) \
            .eq("symbol", sym) \
            .order("trade_date", desc=True) \
            .limit(1) \
            .execute()
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Quote data is temporarily unavailable.",
        )

    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Symbol not found")

    return _quote_from_row(result.data[0], sym)


@router.get("/market/summary")
async def get_market_summary():
    global _market_summary_cache

    now = time.monotonic()
    if _market_summary_cache and _market_summary_cache[0] > now:
        cached = dict(_market_summary_cache[1])
        cached["cache_status"] = "hit"
        return cached

    try:
        client = get_admin_client()
        snapshot = read_latest_market_breadth_snapshot(
            client,
            indices=[],
            quote_source="latest_complete_session",
            indices_live=False,
        )
        if snapshot:
            summary = _market_summary_from_snapshot(snapshot)
            _market_summary_cache = (now + _MARKET_SUMMARY_TTL, dict(summary))
            return summary

        latest_date = get_latest_complete_trade_date(client)
        if not latest_date:
            return {"trade_date": None, "advances": 0, "declines": 0, "unchanged": 0,
                    "new_52w_highs": 0, "new_52w_lows": 0, "total_stocks": 0}

        # Fetch all rows for latest date (paginate in 1000-row chunks)
        all_rows = []
        offset = 0
        while True:
            chunk = client.table("daily_ohlcv") \
                .select("close, prev_close, week_52_high, week_52_low, ema_20, ema_50, ema_200") \
                .eq("trade_date", latest_date) \
                .range(offset, offset + 999) \
                .execute()
            if not chunk.data:
                break
            all_rows.extend(chunk.data)
            if len(chunk.data) < 1000:
                break
            offset += 1000
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Market summary is temporarily unavailable.",
        )

    advances = declines = unchanged = 0
    new_highs = new_lows = 0
    above_ema20 = above_ema50 = above_ema200 = 0
    valid_ema20 = valid_ema50 = valid_ema200 = 0

    for row in all_rows:
        close = float(row["close"] or 0)
        prev = float(row["prev_close"] or 0)
        w52h = float(row["week_52_high"]) if row["week_52_high"] is not None else None
        w52l = float(row["week_52_low"]) if row["week_52_low"] is not None else None
        ema20 = float(row["ema_20"]) if row["ema_20"] is not None else None
        ema50 = float(row["ema_50"]) if row["ema_50"] is not None else None
        ema200 = float(row["ema_200"]) if row["ema_200"] is not None else None

        if prev:
            if close > prev:
                advances += 1
            elif close < prev:
                declines += 1
            else:
                unchanged += 1

        if w52h and close >= w52h:
            new_highs += 1
        if w52l and close <= w52l:
            new_lows += 1

        if ema20 is not None:
            valid_ema20 += 1
            if close > ema20:
                above_ema20 += 1
        if ema50 is not None:
            valid_ema50 += 1
            if close > ema50:
                above_ema50 += 1
        if ema200 is not None:
            valid_ema200 += 1
            if close > ema200:
                above_ema200 += 1

    total = len(all_rows)
    ad_ratio = round(advances / declines, 2) if declines else None

    summary = {
        "trade_date": latest_date,
        "advances": advances,
        "declines": declines,
        "unchanged": unchanged,
        "advance_decline_ratio": ad_ratio,
        "new_52w_highs": new_highs,
        "new_52w_lows": new_lows,
        "above_ema20_pct": round(above_ema20 / valid_ema20 * 100, 1) if valid_ema20 else None,
        "above_ema50_pct": round(above_ema50 / valid_ema50 * 100, 1) if valid_ema50 else None,
        "above_ema200_pct": round(above_ema200 / valid_ema200 * 100, 1) if valid_ema200 else None,
        "total_stocks": total,
    }
    _market_summary_cache = (now + _MARKET_SUMMARY_TTL, dict(summary))
    return summary


@router.get("/market/movers")
async def get_market_movers():
    """Top 5 gainers, top 5 losers, top 5 volume surges for the latest trading date."""
    try:
        client = get_admin_client()

        latest_date = get_latest_complete_trade_date(client)
        if not latest_date:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Market movers are temporarily unavailable.",
            )

        # Fetch all rows with needed columns, paginated
        all_rows: list[dict] = []
        offset = 0
        while True:
            chunk = client.table("daily_ohlcv") \
                .select("symbol, close, prev_close, volume, avg_volume_20d, stock_universe!daily_ohlcv_symbol_fkey(company_name, series)") \
                .eq("trade_date", latest_date) \
                .range(offset, offset + 999) \
                .execute()
            if not chunk.data:
                break
            all_rows.extend(chunk.data)
            if len(chunk.data) < 1000:
                break
            offset += 1000
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Market movers are temporarily unavailable.",
        )

    enriched = []
    for row in all_rows:
        close = float(row["close"] or 0)
        prev  = float(row["prev_close"] or 0)
        vol   = int(row["volume"] or 0)
        avg_v = int(row["avg_volume_20d"] or 0)
        if not prev or not close:
            continue
        su = row.get("stock_universe") or {}
        if isinstance(su, list):
            su = su[0] if su else {}
        # Only EQ series (no SME/BE noise)
        if su.get("series") not in ("EQ", None):
            continue
        enriched.append({
            "symbol": row["symbol"],
            "company_name": su.get("company_name", row["symbol"]),
            "close": close,
            "pct_change": round((close - prev) / prev * 100, 2),
            "volume_ratio": round(vol / avg_v, 2) if avg_v else None,
        })

    # Gainers: top 5 by pct_change, min price ₹10
    gainers = sorted(
        [r for r in enriched if r["pct_change"] > 0 and r["close"] >= 10],
        key=lambda x: x["pct_change"], reverse=True
    )[:5]

    # Losers: bottom 5 by pct_change
    losers = sorted(
        [r for r in enriched if r["pct_change"] < 0 and r["close"] >= 10],
        key=lambda x: x["pct_change"]
    )[:5]

    # Volume surge: top 5 by volume_ratio
    surges = sorted(
        [r for r in enriched if r["volume_ratio"] is not None and r["volume_ratio"] >= 2],
        key=lambda x: x["volume_ratio"] or 0, reverse=True
    )[:5]

    return {
        "trade_date": latest_date,
        "gainers": gainers,
        "losers": losers,
        "volume_surge": surges,
    }


@router.get("/market/markets")
async def list_markets():
    """Returns available markets with stock counts."""
    client = get_admin_client()
    from collections import Counter
    r = client.table("stock_universe").select("market").eq("is_active", True).execute()
    counts = Counter(x.get("market") or "NSE" for x in (r.data or []))
    markets = [
        {"key": "IN",     "label": "India (NSE + BSE)", "currency": "INR", "count": counts.get("NSE", 0) + counts.get("BSE", 0)},
        {"key": "US",     "label": "United States",     "currency": "USD", "count": counts.get("NASDAQ", 0) + counts.get("NYSE", 0)},
        {"key": "NSE",    "label": "NSE (India)",       "currency": "INR", "count": counts.get("NSE", 0)},
        {"key": "NASDAQ", "label": "NASDAQ",            "currency": "USD", "count": counts.get("NASDAQ", 0)},
        {"key": "NYSE",   "label": "NYSE",              "currency": "USD", "count": counts.get("NYSE", 0)},
    ]
    return {"markets": [m for m in markets if m["count"] > 0 or m["key"] in ("IN", "US")]}


@router.get("/market/sectors")
async def list_sectors():
    """Returns distinct sector names that have at least 3 stocks."""
    try:
        client = get_admin_client()
        res = client.table("stock_universe").select("sector").not_.is_("sector", "null").eq("is_active", True).execute()
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Sector list is temporarily unavailable.",
        )
    from collections import Counter
    counts = Counter(r["sector"] for r in (res.data or []) if r.get("sector"))
    sectors = sorted(s for s, c in counts.items() if c >= 3)
    return {"sectors": sectors}


@router.get("/market/sector-breadth")
async def get_sector_breadth():
    """Advance/decline ratio and above-EMA200 % broken down by sector."""
    try:
        client = get_admin_client()

        latest_date = get_latest_complete_trade_date(client)
        if not latest_date:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Sector breadth is temporarily unavailable.",
            )

        # Pull all rows with sector (paginated)
        all_rows: list[dict] = []
        offset = 0
        while True:
            chunk = (
                client.table("daily_ohlcv")
                .select("close,prev_close,ema_200,stock_universe!daily_ohlcv_symbol_fkey!inner(sector)")
                .eq("trade_date", latest_date)
                .not_.is_("stock_universe.sector", "null")
                .range(offset, offset + 999)
                .execute()
            )
            if not chunk.data:
                break
            all_rows.extend(chunk.data)
            if len(chunk.data) < 1000:
                break
            offset += 1000
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Sector breadth is temporarily unavailable.",
        )

    # Aggregate per sector
    sectors: dict[str, dict] = {}
    for row in all_rows:
        su = row.get("stock_universe") or {}
        if isinstance(su, list):
            su = su[0] if su else {}
        sector = su.get("sector")
        if not sector:
            continue
        close = float(row["close"] or 0)
        prev = float(row["prev_close"] or 0)
        ema200 = float(row["ema_200"]) if row["ema_200"] is not None else None

        if sector not in sectors:
            sectors[sector] = {"advances": 0, "declines": 0, "unchanged": 0, "above_ema200": 0, "total": 0}
        s = sectors[sector]
        s["total"] += 1
        if prev:
            if close > prev * 1.001:
                s["advances"] += 1
            elif close < prev * 0.999:
                s["declines"] += 1
            else:
                s["unchanged"] += 1
        if ema200 and close > ema200:
            s["above_ema200"] += 1

    result = []
    for name, s in sorted(sectors.items(), key=lambda x: -x[1]["total"]):
        total = s["total"]
        adv = s["advances"]
        dec = s["declines"]
        result.append({
            "sector": name,
            "total": total,
            "advances": adv,
            "declines": dec,
            "unchanged": s["unchanged"],
            "ad_ratio": round(adv / dec, 2) if dec else None,
            "above_ema200_pct": round(s["above_ema200"] / total * 100, 1) if total else None,
        })

    return {"trade_date": latest_date, "sectors": result}


@router.get("/stocks/{symbol}/fundamentals")
async def get_fundamentals(symbol: str):
    """Basic fundamentals from Yahoo Finance: PE, market cap, P/B, dividend yield, EPS etc."""
    sym = symbol.upper()
    now = time.time()
    # Return cached data if fresh
    if sym in _fund_cache:
        cached_at, cached_data = _fund_cache[sym]
        if now - cached_at < _FUND_TTL:
            return cached_data
    try:
        market, currency = _lookup_market(sym)
        ticker = yf.Ticker(_yf_ticker_symbol(sym, market))
        info = ticker.info

        def _f(key, digits=2):
            v = info.get(key)
            return round(float(v), digits) if v is not None else None

        market_cap = info.get("marketCap")
        if market_cap:
            if currency == "USD":
                if market_cap >= 1e12:
                    mc_str = f"${market_cap / 1e12:.2f}T"
                elif market_cap >= 1e9:
                    mc_str = f"${market_cap / 1e9:.1f}B"
                else:
                    mc_str = f"${market_cap / 1e6:.0f}M"
            else:
                if market_cap >= 1e12:
                    mc_str = f"₹{market_cap / 1e7 / 100:.0f}K Cr"
                elif market_cap >= 1e9:
                    mc_str = f"₹{market_cap / 1e7:.0f} Cr"
                else:
                    mc_str = f"₹{market_cap / 1e5:.0f} L"
        else:
            mc_str = None

        result = {
            "symbol": sym,
            "market": market,
            "currency": currency,
            "trailing_pe": _f("trailingPE"),
            "forward_pe": _f("forwardPE"),
            "price_to_book": _f("priceToBook"),
            "dividend_yield": round(info["dividendYield"] * 100, 2) if info.get("dividendYield") else None,
            "trailing_eps": _f("trailingEps"),
            "forward_eps": _f("forwardEps"),
            "earnings_growth": round(info["earningsGrowth"] * 100, 1) if info.get("earningsGrowth") else None,
            "revenue_growth": round(info["revenueGrowth"] * 100, 1) if info.get("revenueGrowth") else None,
            "return_on_equity": round(info["returnOnEquity"] * 100, 1) if info.get("returnOnEquity") else None,
            "debt_to_equity": _f("debtToEquity"),
            "market_cap": market_cap,
            "market_cap_str": mc_str,
            "shares_outstanding": info.get("sharesOutstanding"),
        }
        _fund_cache[sym] = (time.time(), result)
        return result
    except Exception:
        if sym in _fund_cache:
            _, cached_data = _fund_cache[sym]
            return {**cached_data, "data_status": "stale"}
        market, currency = _lookup_market(sym)
        return {
            "symbol": sym,
            "market": market,
            "currency": currency,
            "trailing_pe": None,
            "forward_pe": None,
            "price_to_book": None,
            "dividend_yield": None,
            "trailing_eps": None,
            "forward_eps": None,
            "earnings_growth": None,
            "revenue_growth": None,
            "return_on_equity": None,
            "debt_to_equity": None,
            "market_cap": None,
            "market_cap_str": None,
            "shares_outstanding": None,
            "data_status": "unavailable",
            "message": "Fundamentals are temporarily unavailable; trading workflow can continue with chart and plan data.",
        }


def _enforce_public_market_limit(request: Request, scope: str) -> None:
    key = client_rate_key(request, scope)
    if not public_market_limiter.is_allowed(key):
        retry_after = public_market_limiter.retry_after(key)
        raise HTTPException(
            status_code=429,
            detail=f"Too many live market data requests - try again in {retry_after} seconds.",
            headers={"Retry-After": str(retry_after)},
        )


@router.get("/stocks/{symbol}/quote-live")
async def get_quote_live(symbol: str, request: Request):
    """Live quote from the configured market data provider."""
    _enforce_public_market_limit(request, "quote-live")
    try:
        sym = symbol.upper()
        market, currency = _lookup_market(sym)
        return get_market_data_provider().live_quote(sym, MarketIdentity(market=market, currency=currency))
    except ProviderNotConfiguredError as e:
        raise HTTPException(status_code=501, detail=str(e))
    except MarketDataError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Market data provider error: {e}")
