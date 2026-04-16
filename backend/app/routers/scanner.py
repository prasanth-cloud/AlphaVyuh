"""
Scanner router — TradingView-style stock screener for NSE/BSE data.
All filtering is done in Python post-query to avoid PostgREST URL limits.
"""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.middleware.auth import get_current_user_id
from app.services.supabase import get_admin_client

router = APIRouter(prefix="/api/v1/scanner", tags=["scanner"])

FREE_RESULT_LIMIT  = 50
PRO_RESULT_LIMIT   = 500
FETCH_BATCH        = 2000  # rows pulled from DB before Python-side filtering


# ── Filter model ──────────────────────────────────────────────────────────────

class ScanFilters(BaseModel):
    # ── Price & Performance ──────────────────────────────────────────────
    price_min:       float | None = None
    price_max:       float | None = None
    pct_change_min:  float | None = None   # %
    pct_change_max:  float | None = None
    gap_pct_min:     float | None = None   # (open-prev_close)/prev_close*100
    gap_pct_max:     float | None = None
    high_min:        float | None = None
    low_max:         float | None = None   # day low below X (wide-range stocks)

    # ── Volume ───────────────────────────────────────────────────────────
    volume_min:      float | None = None   # absolute volume
    volume_max:      float | None = None
    volume_ratio_min: float | None = None  # vs 20-day avg
    volume_ratio_max: float | None = None
    turnover_min:    float | None = None   # ₹ Lacs
    turnover_max:    float | None = None

    # ── Momentum (RSI) ───────────────────────────────────────────────────
    rsi_min:         float | None = None
    rsi_max:         float | None = None

    # ── Trend / EMAs ─────────────────────────────────────────────────────
    above_ema20:     bool | None = None    # close > ema_20
    below_ema20:     bool | None = None
    above_ema50:     bool | None = None
    below_ema50:     bool | None = None
    above_ema200:    bool | None = None
    below_ema200:    bool | None = None
    ema20_above_ema50:   bool | None = None   # ema_20 > ema_50
    ema50_above_ema200:  bool | None = None   # ema_50 > ema_200
    all_emas_bullish:    bool | None = None   # ema_20 > ema_50 > ema_200
    all_emas_bearish:    bool | None = None
    ema20_dist_min:  float | None = None   # (close-ema20)/ema20*100 (%)
    ema20_dist_max:  float | None = None
    ema50_dist_min:  float | None = None
    ema50_dist_max:  float | None = None

    # ── Volatility (ATR) ─────────────────────────────────────────────────
    atr_min:         float | None = None
    atr_max:         float | None = None
    atr_pct_min:     float | None = None   # atr/close*100
    atr_pct_max:     float | None = None

    # ── 52-Week Range ────────────────────────────────────────────────────
    w52h_pct_max:    float | None = None   # (high-close)/close*100 ≤ X  (within X% of 52W high)
    w52l_pct_min:    float | None = None   # (close-low)/low*100  ≥ X  (X% above 52W low)
    new_52w_high:    bool | None = None    # close >= week_52_high
    new_52w_low:     bool | None = None    # close <= week_52_low

    # ── Market / Classification ──────────────────────────────────────────
    series:          list[str] | None = None   # ["EQ","BE"]
    sector:          str | None = None          # e.g. "Information Technology"


class ScanRequest(BaseModel):
    filters: ScanFilters = ScanFilters()
    sort_by:    str = "volume_ratio"   # column key (see SORT_KEYS below)
    sort_order: str = "desc"           # "asc" | "desc"


class SaveScreenRequest(BaseModel):
    name:       str
    filters:    dict
    is_default: bool = False


# ── Valid sort keys ───────────────────────────────────────────────────────────

SORT_KEYS = {
    "symbol", "close", "pct_change", "volume", "volume_ratio",
    "rsi_14", "ema_20", "atr_14", "week_52_high_pct", "gap_pct",
    "atr_pct", "turnover",
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_user_plan(user_id: str) -> str:
    client = get_admin_client()
    r = client.table("users").select("plan").eq("id", user_id).single().execute()
    return r.data["plan"] if r.data else "free"


def _safe(val, default=0.0):
    """Cast to float, return default if None/falsy."""
    try:
        return float(val) if val is not None else default
    except (TypeError, ValueError):
        return default


def _apply_filters(rows: list[dict], f: ScanFilters) -> list[dict]:
    """
    Enrich each row with computed columns, then apply Python-side filters.
    Returns only matching rows (with computed fields attached).
    """
    results = []

    for row in rows:
        su = row.get("stock_universe") or {}
        if isinstance(su, list):
            su = su[0] if su else {}

        close      = _safe(row.get("close"))
        prev_close = _safe(row.get("prev_close"))
        open_p     = _safe(row.get("open"))
        high       = _safe(row.get("high"))
        low        = _safe(row.get("low"))
        volume     = int(row.get("volume") or 0)
        avg_vol    = int(row.get("avg_volume_20d") or 0)
        turnover   = _safe(row.get("turnover"))
        rsi        = _safe(row.get("rsi_14"), None)  # type: ignore[arg-type]
        ema20      = _safe(row.get("ema_20"), None)   # type: ignore[arg-type]
        ema50      = _safe(row.get("ema_50"), None)   # type: ignore[arg-type]
        ema200     = _safe(row.get("ema_200"), None)  # type: ignore[arg-type]
        atr        = _safe(row.get("atr_14"), None)   # type: ignore[arg-type]
        w52h       = _safe(row.get("week_52_high"), None)  # type: ignore[arg-type]
        w52l       = _safe(row.get("week_52_low"), None)   # type: ignore[arg-type]

        # None-preserving casts
        rsi_v   = float(row["rsi_14"])   if row.get("rsi_14")   is not None else None
        ema20_v = float(row["ema_20"])   if row.get("ema_20")   is not None else None
        ema50_v = float(row["ema_50"])   if row.get("ema_50")   is not None else None
        ema200_v= float(row["ema_200"])  if row.get("ema_200")  is not None else None
        atr_v   = float(row["atr_14"])   if row.get("atr_14")   is not None else None
        w52h_v  = float(row["week_52_high"]) if row.get("week_52_high") is not None else None
        w52l_v  = float(row["week_52_low"])  if row.get("week_52_low")  is not None else None

        # Computed columns
        pct_change    = round((close - prev_close) / prev_close * 100, 2) if prev_close else None
        volume_ratio  = round(volume / avg_vol, 2) if avg_vol else None
        gap_pct       = round((open_p - prev_close) / prev_close * 100, 2) if prev_close else None
        w52h_pct      = round((w52h_v - close) / close * 100, 2) if w52h_v and close else None
        w52l_pct      = round((close - w52l_v) / w52l_v * 100, 2) if w52l_v and close else None
        atr_pct_v     = round(atr_v / close * 100, 2) if atr_v and close else None
        ema20_dist    = round((close - ema20_v) / ema20_v * 100, 2) if ema20_v else None
        ema50_dist    = round((close - ema50_v) / ema50_v * 100, 2) if ema50_v else None

        # ── Price & Performance ──────────────────────────────────────────
        if f.price_min       is not None and close < f.price_min:            continue
        if f.price_max       is not None and close > f.price_max:            continue
        if f.pct_change_min  is not None and (pct_change is None or pct_change < f.pct_change_min): continue
        if f.pct_change_max  is not None and (pct_change is None or pct_change > f.pct_change_max): continue
        if f.gap_pct_min     is not None and (gap_pct is None or gap_pct < f.gap_pct_min):          continue
        if f.gap_pct_max     is not None and (gap_pct is None or gap_pct > f.gap_pct_max):          continue
        if f.high_min        is not None and high < f.high_min:              continue
        if f.low_max         is not None and low  > f.low_max:               continue

        # ── Volume ───────────────────────────────────────────────────────
        if f.volume_min      is not None and volume < f.volume_min:          continue
        if f.volume_max      is not None and volume > f.volume_max:          continue
        if f.volume_ratio_min is not None and (volume_ratio is None or volume_ratio < f.volume_ratio_min): continue
        if f.volume_ratio_max is not None and (volume_ratio is None or volume_ratio > f.volume_ratio_max): continue
        if f.turnover_min    is not None and turnover < f.turnover_min:      continue
        if f.turnover_max    is not None and turnover > f.turnover_max:      continue

        # ── Momentum ─────────────────────────────────────────────────────
        if f.rsi_min is not None and (rsi_v is None or rsi_v < f.rsi_min):  continue
        if f.rsi_max is not None and (rsi_v is None or rsi_v > f.rsi_max):  continue

        # ── Trend / EMAs ─────────────────────────────────────────────────
        if f.above_ema20  and (ema20_v  is None or close <= ema20_v):  continue
        if f.below_ema20  and (ema20_v  is None or close >= ema20_v):  continue
        if f.above_ema50  and (ema50_v  is None or close <= ema50_v):  continue
        if f.below_ema50  and (ema50_v  is None or close >= ema50_v):  continue
        if f.above_ema200 and (ema200_v is None or close <= ema200_v): continue
        if f.below_ema200 and (ema200_v is None or close >= ema200_v): continue
        if f.ema20_above_ema50  and (ema20_v is None or ema50_v  is None or ema20_v  <= ema50_v):  continue
        if f.ema50_above_ema200 and (ema50_v is None or ema200_v is None or ema50_v  <= ema200_v): continue
        if f.all_emas_bullish and (
            ema20_v is None or ema50_v is None or ema200_v is None
            or not (ema20_v > ema50_v > ema200_v)
        ): continue
        if f.all_emas_bearish and (
            ema20_v is None or ema50_v is None or ema200_v is None
            or not (ema20_v < ema50_v < ema200_v)
        ): continue
        if f.ema20_dist_min is not None and (ema20_dist is None or ema20_dist < f.ema20_dist_min): continue
        if f.ema20_dist_max is not None and (ema20_dist is None or ema20_dist > f.ema20_dist_max): continue
        if f.ema50_dist_min is not None and (ema50_dist is None or ema50_dist < f.ema50_dist_min): continue
        if f.ema50_dist_max is not None and (ema50_dist is None or ema50_dist > f.ema50_dist_max): continue

        # ── Volatility ───────────────────────────────────────────────────
        if f.atr_min     is not None and (atr_v    is None or atr_v    < f.atr_min):     continue
        if f.atr_max     is not None and (atr_v    is None or atr_v    > f.atr_max):     continue
        if f.atr_pct_min is not None and (atr_pct_v is None or atr_pct_v < f.atr_pct_min): continue
        if f.atr_pct_max is not None and (atr_pct_v is None or atr_pct_v > f.atr_pct_max): continue

        # ── 52-Week ───────────────────────────────────────────────────────
        if f.w52h_pct_max  is not None and (w52h_pct is None or w52h_pct > f.w52h_pct_max): continue
        if f.w52l_pct_min  is not None and (w52l_pct is None or w52l_pct < f.w52l_pct_min): continue
        if f.new_52w_high  and (w52h_v is None or close < w52h_v):  continue
        if f.new_52w_low   and (w52l_v is None or close > w52l_v):  continue

        # ── Sector ────────────────────────────────────────────────────────
        if f.sector is not None and su.get("sector") != f.sector: continue

        results.append({
            "symbol":         row["symbol"],
            "company_name":   su.get("company_name") or row["symbol"],
            "series":         su.get("series") or "",
            "sector":         su.get("sector"),
            "close":          close,
            "prev_close":     prev_close,
            "open":           open_p,
            "high":           high,
            "low":            low,
            "pct_change":     pct_change,
            "gap_pct":        gap_pct,
            "volume":         volume,
            "avg_volume_20d": avg_vol,
            "volume_ratio":   volume_ratio,
            "turnover":       turnover,
            "rsi_14":         rsi_v,
            "ema_20":         ema20_v,
            "ema_50":         ema50_v,
            "ema_200":        ema200_v,
            "ema_20_dist":    ema20_dist,
            "ema_50_dist":    ema50_dist,
            "week_52_high":   w52h_v,
            "week_52_low":    w52l_v,
            "week_52_high_pct": w52h_pct,
            "week_52_low_pct":  w52l_pct,
            "atr_14":         atr_v,
            "atr_pct":        atr_pct_v,
        })

    return results


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/run")
async def run_scanner(
    body: ScanRequest,
    user_id: str = Depends(get_current_user_id),
):
    client  = get_admin_client()
    plan = _get_user_plan(user_id)
    hard_limit = FREE_RESULT_LIMIT if plan == "free" else PRO_RESULT_LIMIT

    # Latest trade date
    dr = client.table("daily_ohlcv").select("trade_date").order("trade_date", desc=True).limit(1).execute()
    if not dr.data:
        return {"trade_date": None, "total_matches": 0, "plan_limit": hard_limit, "results": []}
    latest_date = dr.data[0]["trade_date"]

    # Build base query with series filter pushed to DB
    f = body.filters
    series_list = f.series or ["EQ", "BE"]

    q = (
        client.table("daily_ohlcv")
        .select(
            "symbol,open,high,low,close,prev_close,volume,avg_volume_20d,"
            "turnover,rsi_14,ema_20,ema_50,ema_200,week_52_high,week_52_low,atr_14,"
            "stock_universe!inner(symbol,company_name,series,sector,is_active)"
        )
        .eq("trade_date", latest_date)
        .eq("stock_universe.is_active", True)
        .in_("stock_universe.series", series_list)
    )

    # Push simple DB-side filters to reduce rows before Python processing
    if f.price_min  is not None: q = q.gte("close", f.price_min)
    if f.price_max  is not None: q = q.lte("close", f.price_max)
    if f.rsi_min    is not None: q = q.gte("rsi_14", f.rsi_min)
    if f.rsi_max    is not None: q = q.lte("rsi_14", f.rsi_max)
    if f.atr_min    is not None: q = q.gte("atr_14", f.atr_min)
    if f.atr_max    is not None: q = q.lte("atr_14", f.atr_max)
    if f.turnover_min is not None: q = q.gte("turnover", f.turnover_min)
    if f.turnover_max is not None: q = q.lte("turnover", f.turnover_max)

    rows = q.limit(FETCH_BATCH).execute().data or []

    # Python-side filter for computed columns
    results = _apply_filters(rows, f)

    # Sort
    sort_key = body.sort_by if body.sort_by in SORT_KEYS else "volume_ratio"
    reverse  = body.sort_order != "asc"
    results.sort(key=lambda x: (x.get(sort_key) is not None, x.get(sort_key) or 0), reverse=reverse)

    total  = len(results)
    capped = results[:hard_limit]

    return {
        "trade_date":    latest_date,
        "total_matches": total,
        "plan_limit":    hard_limit,
        "plan":          plan,
        "results":       capped,
    }


@router.get("/screens")
async def list_screens(user_id: str = Depends(get_current_user_id)):
    client = get_admin_client()
    r = client.table("saved_screens").select("*").eq("user_id", user_id).order("created_at", desc=True).execute()
    return r.data or []


@router.post("/screens")
async def save_screen(body: SaveScreenRequest, user_id: str = Depends(get_current_user_id)):
    client = get_admin_client()
    plan   = _get_user_plan(user_id)
    if plan == "free":
        cnt = client.table("saved_screens").select("id", count="exact").eq("user_id", user_id).execute()
        if (cnt.count or 0) >= 5:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Free plan limit: 5 saved screens")
    r = client.table("saved_screens").insert({
        "user_id":    user_id,
        "name":       body.name,
        "filters":    body.filters,
        "is_default": body.is_default,
    }).execute()
    return r.data[0]


@router.delete("/screens/{screen_id}")
async def delete_screen(screen_id: UUID, user_id: str = Depends(get_current_user_id)):
    client = get_admin_client()
    ex = client.table("saved_screens").select("id").eq("id", str(screen_id)).eq("user_id", user_id).execute()
    if not ex.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Screen not found")
    client.table("saved_screens").delete().eq("id", str(screen_id)).execute()
    return {"message": "Deleted"}
