from fastapi import APIRouter, Depends, HTTPException, status

from app.middleware.auth import get_current_user_id
from app.services.supabase import get_admin_client

router = APIRouter(prefix="/api/v1", tags=["stocks"])


@router.get("/stocks/{symbol}/quote")
async def get_quote(symbol: str, user_id: str = Depends(get_current_user_id)):
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
async def get_market_summary(user_id: str = Depends(get_current_user_id)):
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
