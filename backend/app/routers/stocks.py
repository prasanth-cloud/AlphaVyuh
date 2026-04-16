from fastapi import APIRouter, HTTPException, status

import yfinance as yf

from app.services.supabase import get_admin_client

router = APIRouter(prefix="/api/v1", tags=["stocks"])


@router.get("/stocks/{symbol}/quote")
async def get_quote(symbol: str):
    client = get_admin_client()
    sym = symbol.upper()

    result = client.table("daily_ohlcv") \
        .select(
            "symbol, trade_date, open, high, low, close, prev_close, volume, "
            "avg_volume_20d, week_52_high, week_52_low, rsi_14, "
            "ema_20, ema_50, ema_200, atr_14, turnover, "
            "stock_universe(company_name, sector, series)"
        ) \
        .eq("symbol", sym) \
        .order("trade_date", desc=True) \
        .limit(1) \
        .execute()

    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Symbol not found")

    row = result.data[0]
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


@router.get("/market/summary")
async def get_market_summary():
    client = get_admin_client()

    date_res = client.table("daily_ohlcv").select("trade_date").order("trade_date", desc=True).limit(1).execute()
    if not date_res.data:
        return {"trade_date": None, "advances": 0, "declines": 0, "unchanged": 0,
                "new_52w_highs": 0, "new_52w_lows": 0, "total_stocks": 0}

    latest_date = date_res.data[0]["trade_date"]

    # Fetch all rows for latest date (paginate in 1000-row chunks)
    all_rows = []
    offset = 0
    while True:
        chunk = client.table("daily_ohlcv") \
            .select("close, prev_close, week_52_high, week_52_low, ema_20, ema_200") \
            .eq("trade_date", latest_date) \
            .range(offset, offset + 999) \
            .execute()
        if not chunk.data:
            break
        all_rows.extend(chunk.data)
        if len(chunk.data) < 1000:
            break
        offset += 1000

    advances = declines = unchanged = 0
    new_highs = new_lows = above_ema20 = above_ema200 = valid_ema20 = valid_ema200 = 0

    for row in all_rows:
        close = float(row["close"] or 0)
        prev = float(row["prev_close"] or 0)
        w52h = float(row["week_52_high"]) if row["week_52_high"] is not None else None
        w52l = float(row["week_52_low"]) if row["week_52_low"] is not None else None
        ema20 = float(row["ema_20"]) if row["ema_20"] is not None else None
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
        if ema200 is not None:
            valid_ema200 += 1
            if close > ema200:
                above_ema200 += 1

    total = len(all_rows)
    ad_ratio = round(advances / declines, 2) if declines else None

    return {
        "trade_date": latest_date,
        "advances": advances,
        "declines": declines,
        "unchanged": unchanged,
        "advance_decline_ratio": ad_ratio,
        "new_52w_highs": new_highs,
        "new_52w_lows": new_lows,
        "above_ema20_pct": round(above_ema20 / valid_ema20 * 100, 1) if valid_ema20 else None,
        "above_ema200_pct": round(above_ema200 / valid_ema200 * 100, 1) if valid_ema200 else None,
        "total_stocks": total,
    }


@router.get("/market/movers")
async def get_market_movers():
    """Top 5 gainers, top 5 losers, top 5 volume surges for the latest trading date."""
    client = get_admin_client()

    date_res = client.table("daily_ohlcv").select("trade_date").order("trade_date", desc=True).limit(1).execute()
    if not date_res.data:
        return {"trade_date": None, "gainers": [], "losers": [], "volume_surge": []}

    latest_date = date_res.data[0]["trade_date"]

    # Fetch all rows with needed columns, paginated
    all_rows: list[dict] = []
    offset = 0
    while True:
        chunk = client.table("daily_ohlcv") \
            .select("symbol, close, prev_close, volume, avg_volume_20d, stock_universe(company_name, series)") \
            .eq("trade_date", latest_date) \
            .range(offset, offset + 999) \
            .execute()
        if not chunk.data:
            break
        all_rows.extend(chunk.data)
        if len(chunk.data) < 1000:
            break
        offset += 1000

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


@router.get("/market/sectors")
async def list_sectors():
    """Returns distinct sector names that have at least 3 stocks."""
    client = get_admin_client()
    res = client.table("stock_universe").select("sector").not_.is_("sector", "null").eq("is_active", True).execute()
    from collections import Counter
    counts = Counter(r["sector"] for r in (res.data or []) if r.get("sector"))
    sectors = sorted(s for s, c in counts.items() if c >= 3)
    return {"sectors": sectors}


@router.get("/market/sector-breadth")
async def get_sector_breadth():
    """Advance/decline ratio and above-EMA200 % broken down by sector."""
    client = get_admin_client()

    date_res = client.table("daily_ohlcv").select("trade_date").order("trade_date", desc=True).limit(1).execute()
    if not date_res.data:
        return {"sectors": []}
    latest_date = date_res.data[0]["trade_date"]

    # Pull all rows with sector (paginated)
    all_rows: list[dict] = []
    offset = 0
    while True:
        chunk = (
            client.table("daily_ohlcv")
            .select("close,prev_close,ema_200,stock_universe!inner(sector)")
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


@router.get("/stocks/{symbol}/quote-live")
async def get_quote_live(symbol: str):
    """Live quote from Yahoo Finance (NSE stocks with .NS suffix).
    Returns current price, day change, 52W range, volume — real-time 15-min delayed."""
    try:
        ticker = yf.Ticker(f"{symbol.upper()}.NS")
        info = ticker.fast_info
        hist = ticker.history(period="2d", interval="1d")

        if hist.empty:
            raise HTTPException(status_code=404, detail=f"No live data for {symbol}")

        latest = hist.iloc[-1]
        prev   = hist.iloc[-2] if len(hist) >= 2 else hist.iloc[-1]

        close     = float(latest["Close"])
        prev_close = float(prev["Close"])
        pct_change = round((close - prev_close) / prev_close * 100, 2) if prev_close else None

        return {
            "symbol": symbol.upper(),
            "close":      round(close, 2),
            "open":       round(float(latest["Open"]), 2),
            "high":       round(float(latest["High"]), 2),
            "low":        round(float(latest["Low"]), 2),
            "volume":     int(latest["Volume"]),
            "prev_close": round(prev_close, 2),
            "pct_change": pct_change,
            "week_52_high": round(float(info.year_high), 2) if info.year_high else None,
            "week_52_low":  round(float(info.year_low), 2)  if info.year_low  else None,
            "source": "yahoo_finance",
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Yahoo Finance error: {e}")
