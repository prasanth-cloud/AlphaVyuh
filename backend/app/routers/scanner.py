"""
Scanner router — TradingView-style stock screener for NSE/BSE data.
Single-day filters are pushed to the DB as WHERE clauses (ADR 005 M3-B).
Multi-day filters (VCP, volume dry-up) run Python-side post-fetch on a
smaller candidate set returned by the DB push-filters.
"""
from __future__ import annotations

import asyncio
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.middleware.auth import get_current_user_id
from app.services.rate_limit import plan_cache, scanner_limiter
from app.services.supabase import get_admin_client

router = APIRouter(prefix="/api/v1/scanner", tags=["scanner"])

FREE_RESULT_LIMIT  = 25
PRO_RESULT_LIMIT   = 500
SCAN_ROW_CAP       = 10_000  # safety limit for unfiltered / lightly-filtered queries


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
    w52h_pct_max:         float | None = None   # (high-close)/close*100 ≤ X  (within X% of 52W high)
    week_52_high_pct_max: float | None = None   # alias for w52h_pct_max (new scanner UI)
    w52l_pct_min:         float | None = None   # (close-low)/low*100  ≥ X  (X% above 52W low)
    new_52w_high:         bool | None = None    # close >= week_52_high
    new_52w_low:          bool | None = None    # close <= week_52_low

    # ── EMA position aliases (new scanner UI: 'above' | 'below' | '') ───
    price_vs_ema20:  str | None = None   # 'above' | 'below'
    price_vs_ema50:  str | None = None
    price_vs_ema200: str | None = None

    # ── Relative Strength (Minervini RS score, 1–99) ─────────────────────
    rs_score_min:    float | None = None   # >= X (70+ is Minervini threshold)
    rs_score_max:    float | None = None

    # ── MACD ─────────────────────────────────────────────────────────────
    macd_signal:        str | None = None   # "bullish_cross"|"bearish_cross"|"above_signal"|"below_signal"
    macd_hist_positive: bool | None = None

    # ── Bollinger Bands ───────────────────────────────────────────────────
    bb_position:  str | None = None   # "above_upper"|"below_lower"|"inside"|"near_upper"|"near_lower"
    bb_width_min: float | None = None
    bb_width_max: float | None = None

    # ── Stochastic ────────────────────────────────────────────────────────
    stoch_k_min: float | None = None
    stoch_k_max: float | None = None
    stoch_d_min: float | None = None
    stoch_d_max: float | None = None

    # ── ADX ───────────────────────────────────────────────────────────────
    adx_min: float | None = None
    adx_max: float | None = None

    # ── CCI ───────────────────────────────────────────────────────────────
    cci_min: float | None = None
    cci_max: float | None = None

    # ── Williams %R ───────────────────────────────────────────────────────
    williams_r_min: float | None = None
    williams_r_max: float | None = None

    # ── Candle patterns ───────────────────────────────────────────────────
    is_inside_bar:       bool | None = None
    is_outside_bar:      bool | None = None
    bullish_engulfing:   bool | None = None
    bearish_engulfing:   bool | None = None
    hammer:              bool | None = None
    shooting_star:       bool | None = None
    doji:                bool | None = None

    # ── Delivery / OBV ───────────────────────────────────────────────────
    delivery_pct_min: float | None = None
    delivery_pct_max: float | None = None

    # ── EMA 50/200 cross aliases ──────────────────────────────────────────
    ema20_vs_ema50:   str | None = None   # "golden" | "death"
    ema50_vs_ema200:  str | None = None   # "golden" | "death"

    # ── Turnover in crores alias ──────────────────────────────────────────
    turnover_min_cr: float | None = None  # crores (1 cr = 10M INR)

    # ── Market / Classification ──────────────────────────────────────────
    series:          list[str] | None = None   # ["EQ","BE"]
    sector:          list[str] | str | None = None   # e.g. "Information Technology" or list
    market:          str | None = None          # "IN" (NSE+BSE), "US" (NASDAQ+NYSE) or specific exchange
    market_cap_category: list[str] | str | None = None

    # ── Fundamentals ─────────────────────────────────────────────────────
    market_cap_min:       float | None = None   # ₹ Crores
    market_cap_max:       float | None = None
    pe_min:               float | None = None
    pe_max:               float | None = None
    pb_min:               float | None = None
    pb_max:               float | None = None
    eps_min:              float | None = None
    eps_max:              float | None = None
    dividend_yield_min:   float | None = None
    dividend_yield_max:   float | None = None
    debt_to_equity_max:   float | None = None
    roe_min:              float | None = None
    roce_min:             float | None = None

    # ── Setup patterns (multi-day, two-pass) ─────────────────────────────
    vcp_contraction:          bool | None = None   # True → enable VCP two-pass
    vcp_min_pivots:           int  | None = None   # contracting bases required (default 2)
    vcp_max_depth_pct:        float| None = None   # final base max depth % (default 15.0)
    vcp_pivot_proximity_pct:  float| None = None   # max |close - pivot_high| / pivot_high % (default 10.0)


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
    "atr_pct", "turnover", "adx_14", "stoch_k",
}

PRESETS = [
    {
        "id": "sepa",
        "name": "SEPA",
        "description": "Minervini Stage 2: EMA stack bullish, RS Score ≥ 70, within 25% of 52W high, 30%+ above 52W low",
        "color": "#56D7C1",
        "filters": {"all_emas_bullish": True, "rs_score_min": 70, "w52h_pct_max": 25, "w52l_pct_min": 30, "series": ["EQ"]},
    },
    {
        "id": "momentum",
        "name": "Momentum",
        "description": "Strong stocks above EMAs with rising volume",
        "color": "#5b63f5",
        "filters": {"rsi_min": 55, "rsi_max": 80, "volume_ratio_min": 1.5,
                    "price_vs_ema20": "above", "price_vs_ema50": "above",
                    "pct_change_min": 1.0, "series": ["EQ"]},
    },
    {
        "id": "breakout",
        "name": "Breakout",
        "description": "Price breaking higher with volume surge",
        "color": "#26a65b",
        "filters": {"volume_ratio_min": 2.0, "pct_change_min": 2.0,
                    "price_vs_ema20": "above", "week_52_high_pct_max": 5.0, "series": ["EQ"]},
    },
    {
        "id": "near_52w_high",
        "name": "Near 52W High",
        "description": "Within 5% of yearly high",
        "color": "#d97706",
        "filters": {"week_52_high_pct_max": 5.0, "price_vs_ema20": "above", "series": ["EQ"]},
    },
    {
        "id": "oversold_bounce",
        "name": "Oversold Bounce",
        "description": "RSI oversold, price above 200 EMA",
        "color": "#e5383b",
        "filters": {"rsi_min": 20, "rsi_max": 38, "price_vs_ema200": "above", "series": ["EQ"]},
    },
    {
        "id": "new_highs",
        "name": "New 52W Highs",
        "description": "Fresh yearly highs today",
        "color": "#7c6af0",
        "filters": {"new_52w_high": True, "volume_ratio_min": 1.2, "series": ["EQ"]},
    },
    {
        "id": "high_volume",
        "name": "High Volume",
        "description": "Unusual volume — 3× average or more",
        "color": "#0f766e",
        "filters": {"volume_ratio_min": 3.0, "series": ["EQ"]},
    },
    {
        "id": "golden_cross",
        "name": "Golden Cross",
        "description": "EMA 20 above EMA 50 with bullish trend",
        "color": "#b45309",
        "filters": {"ema20_vs_ema50": "golden", "price_vs_ema200": "above", "series": ["EQ"]},
    },
    {
        "id": "strong_trend",
        "name": "Strong Trend",
        "description": "All 3 EMAs aligned bullish",
        "color": "#0369a1",
        "filters": {"all_emas_bullish": True, "rsi_min": 50, "series": ["EQ"]},
    },
]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_user_plan(user_id: str) -> str:
    cached = plan_cache.get(user_id)
    if cached:
        return cached
    client = get_admin_client()
    r = client.table("users").select("plan").eq("id", user_id).single().execute()
    plan = r.data["plan"] if r.data else "free"
    plan_cache.set(user_id, plan)
    return plan


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
        rsi_v      = float(row["rsi_14"])       if row.get("rsi_14")       is not None else None
        ema20_v    = float(row["ema_20"])        if row.get("ema_20")       is not None else None
        ema50_v    = float(row["ema_50"])        if row.get("ema_50")       is not None else None
        ema200_v   = float(row["ema_200"])       if row.get("ema_200")      is not None else None
        atr_v      = float(row["atr_14"])        if row.get("atr_14")       is not None else None
        w52h_v     = float(row["week_52_high"])  if row.get("week_52_high") is not None else None
        w52l_v     = float(row["week_52_low"])   if row.get("week_52_low")  is not None else None
        rs_score_v = float(row["rs_score"])      if row.get("rs_score")     is not None else None

        # Computed columns — prefer precomputed DB values when populated (M3-A columns)
        pct_change   = round((close - prev_close) / prev_close * 100, 2) if prev_close else None
        gap_pct      = round((open_p - prev_close) / prev_close * 100, 2) if prev_close else None
        atr_pct_v    = round(atr_v / close * 100, 2) if atr_v and close else None
        ema20_dist   = round((close - ema20_v) / ema20_v * 100, 2) if ema20_v else None
        ema50_dist   = round((close - ema50_v) / ema50_v * 100, 2) if ema50_v else None
        # Use DB-precomputed ratio when available; fall back to on-the-fly compute
        _db_vr   = float(row["volume_ratio"]) if row.get("volume_ratio") is not None else None
        volume_ratio = _db_vr if _db_vr is not None else (round(volume / avg_vol, 2) if avg_vol else None)
        _db_w52h = float(row["w52h_pct"])     if row.get("w52h_pct")     is not None else None
        w52h_pct = _db_w52h if _db_w52h is not None else (round((w52h_v - close) / close * 100, 2) if w52h_v and close else None)
        _db_w52l = float(row["w52l_pct"])     if row.get("w52l_pct")     is not None else None
        w52l_pct = _db_w52l if _db_w52l is not None else (round((close - w52l_v) / w52l_v * 100, 2) if w52l_v and close else None)

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

        # ── Relative Strength score ────────────────────────────────────────
        if f.rs_score_min is not None and (rs_score_v is None or rs_score_v < f.rs_score_min): continue
        if f.rs_score_max is not None and (rs_score_v is None or rs_score_v > f.rs_score_max): continue

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
        w52h_limit = f.w52h_pct_max if f.w52h_pct_max is not None else f.week_52_high_pct_max
        if w52h_limit is not None and (w52h_pct is None or w52h_pct > w52h_limit): continue
        if f.w52l_pct_min  is not None and (w52l_pct is None or w52l_pct < f.w52l_pct_min): continue
        if f.new_52w_high  and (w52h_v is None or close < w52h_v):  continue
        if f.new_52w_low   and (w52l_v is None or close > w52l_v):  continue

        # ── EMA position aliases (price_vs_ema*) ─────────────────────────
        if f.price_vs_ema20 == "above"  and (ema20_v  is None or close <= ema20_v):  continue
        if f.price_vs_ema20 == "below"  and (ema20_v  is None or close >= ema20_v):  continue
        if f.price_vs_ema50 == "above"  and (ema50_v  is None or close <= ema50_v):  continue
        if f.price_vs_ema50 == "below"  and (ema50_v  is None or close >= ema50_v):  continue
        if f.price_vs_ema200 == "above" and (ema200_v is None or close <= ema200_v): continue
        if f.price_vs_ema200 == "below" and (ema200_v is None or close >= ema200_v): continue

        # ── MACD ─────────────────────────────────────────────────────────
        macd_hist_v  = float(row["macd_hist"])   if row.get("macd_hist")   is not None else None
        macd_line_v  = float(row["macd_line"])   if row.get("macd_line")   is not None else None
        macd_sig_v   = float(row["macd_signal"]) if row.get("macd_signal") is not None else None
        if f.macd_hist_positive is True  and (macd_hist_v is None or macd_hist_v <= 0): continue
        if f.macd_hist_positive is False and (macd_hist_v is None or macd_hist_v >= 0): continue
        if f.macd_signal == "above_signal"  and (macd_line_v is None or macd_sig_v is None or macd_line_v <= macd_sig_v): continue
        if f.macd_signal == "below_signal"  and (macd_line_v is None or macd_sig_v is None or macd_line_v >= macd_sig_v): continue
        # bullish/bearish cross requires yesterday's data — skip for now (needs prev row)

        # ── Bollinger Bands ───────────────────────────────────────────────
        bb_upper_v  = float(row["bb_upper"]) if row.get("bb_upper")  is not None else None
        bb_lower_v  = float(row["bb_lower"]) if row.get("bb_lower")  is not None else None
        bb_mid_v    = float(row["bb_middle"]) if row.get("bb_middle") is not None else None
        bb_width_v  = float(row["bb_width"]) if row.get("bb_width")  is not None else None
        if f.bb_width_min is not None and (bb_width_v is None or bb_width_v < f.bb_width_min): continue
        if f.bb_width_max is not None and (bb_width_v is None or bb_width_v > f.bb_width_max): continue
        if f.bb_position == "above_upper"  and (bb_upper_v is None or close <= bb_upper_v): continue
        if f.bb_position == "below_lower"  and (bb_lower_v is None or close >= bb_lower_v): continue
        if f.bb_position == "inside"       and bb_upper_v is not None and bb_lower_v is not None:
            if close >= bb_upper_v or close <= bb_lower_v: continue
        if f.bb_position == "near_upper"   and (bb_upper_v is None or bb_mid_v is None or close <= bb_mid_v or close > bb_upper_v * 1.02): continue
        if f.bb_position == "near_lower"   and (bb_lower_v is None or bb_mid_v is None or close >= bb_mid_v or close < bb_lower_v * 0.98): continue

        # ── Stochastic ────────────────────────────────────────────────────
        stoch_k_v = float(row["stoch_k"]) if row.get("stoch_k") is not None else None
        stoch_d_v = float(row["stoch_d"]) if row.get("stoch_d") is not None else None
        if f.stoch_k_min is not None and (stoch_k_v is None or stoch_k_v < f.stoch_k_min): continue
        if f.stoch_k_max is not None and (stoch_k_v is None or stoch_k_v > f.stoch_k_max): continue
        if f.stoch_d_min is not None and (stoch_d_v is None or stoch_d_v < f.stoch_d_min): continue
        if f.stoch_d_max is not None and (stoch_d_v is None or stoch_d_v > f.stoch_d_max): continue

        # ── ADX ───────────────────────────────────────────────────────────
        adx_v = float(row["adx_14"]) if row.get("adx_14") is not None else None
        if f.adx_min is not None and (adx_v is None or adx_v < f.adx_min): continue
        if f.adx_max is not None and (adx_v is None or adx_v > f.adx_max): continue

        # ── CCI ───────────────────────────────────────────────────────────
        cci_v = float(row["cci_20"]) if row.get("cci_20") is not None else None
        if f.cci_min is not None and (cci_v is None or cci_v < f.cci_min): continue
        if f.cci_max is not None and (cci_v is None or cci_v > f.cci_max): continue

        # ── Williams %R ───────────────────────────────────────────────────
        wr_v = float(row["williams_r"]) if row.get("williams_r") is not None else None
        if f.williams_r_min is not None and (wr_v is None or wr_v < f.williams_r_min): continue
        if f.williams_r_max is not None and (wr_v is None or wr_v > f.williams_r_max): continue

        # ── Candle patterns (from precomputed flags) ──────────────────────
        if f.is_inside_bar  is True  and not row.get("is_inside_bar"):  continue
        if f.is_outside_bar is True  and not row.get("is_outside_bar"): continue
        # Compute on-the-fly patterns from OHLC
        body_size   = abs(close - open_p)
        total_range = high - low if high != low else 0.001
        lower_wick  = min(open_p, close) - low
        upper_wick  = high - max(open_p, close)
        if f.doji            is True and body_size >= 0.1 * total_range:  continue
        if f.hammer          is True and not (lower_wick > 2 * body_size and upper_wick < body_size * 0.5 and body_size > 0): continue
        if f.shooting_star   is True and not (upper_wick > 2 * body_size and lower_wick < body_size * 0.5 and body_size > 0): continue

        # ── Delivery pct ─────────────────────────────────────────────────
        del_pct_v = float(row["delivery_pct"]) if row.get("delivery_pct") is not None else None
        if f.delivery_pct_min is not None and (del_pct_v is None or del_pct_v < f.delivery_pct_min): continue
        if f.delivery_pct_max is not None and (del_pct_v is None or del_pct_v > f.delivery_pct_max): continue

        # ── EMA cross aliases ─────────────────────────────────────────────
        if f.ema20_vs_ema50 == "golden" and (ema20_v is None or ema50_v is None or ema20_v <= ema50_v): continue
        if f.ema20_vs_ema50 == "death"  and (ema20_v is None or ema50_v is None or ema20_v >= ema50_v): continue
        if f.ema50_vs_ema200 == "golden" and (ema50_v is None or ema200_v is None or ema50_v <= ema200_v): continue
        if f.ema50_vs_ema200 == "death"  and (ema50_v is None or ema200_v is None or ema50_v >= ema200_v): continue

        # ── Fundamentals (from stock_universe) ───────────────────────────
        mc   = su.get("market_cap_cr")
        pe   = su.get("pe_ratio")
        pb   = su.get("pb_ratio")
        eps_ = su.get("eps")
        dy   = su.get("dividend_yield")
        dte  = su.get("debt_to_equity")
        roe_ = su.get("roe")
        roce_= su.get("roce")
        if f.market_cap_min     is not None and (mc   is None or mc   < f.market_cap_min):     continue
        if f.market_cap_max     is not None and (mc   is None or mc   > f.market_cap_max):     continue
        if f.pe_min             is not None and (pe   is None or pe   < f.pe_min):             continue
        if f.pe_max             is not None and (pe   is None or pe   > f.pe_max):             continue
        if f.pb_min             is not None and (pb   is None or pb   < f.pb_min):             continue
        if f.pb_max             is not None and (pb   is None or pb   > f.pb_max):             continue
        if f.eps_min            is not None and (eps_ is None or eps_ < f.eps_min):            continue
        if f.eps_max            is not None and (eps_ is None or eps_ > f.eps_max):            continue
        if f.dividend_yield_min is not None and (dy   is None or dy   < f.dividend_yield_min): continue
        if f.dividend_yield_max is not None and (dy   is None or dy   > f.dividend_yield_max): continue
        if f.debt_to_equity_max is not None and (dte  is None or dte  > f.debt_to_equity_max): continue
        if f.roe_min            is not None and (roe_ is None or roe_ < f.roe_min):            continue
        if f.roce_min           is not None and (roce_ is None or roce_ < f.roce_min):          continue

        # ── Series / active stock filter ──────────────────────────────────
        effective_series = f.series if f.series else ["EQ", "BE"]
        if su.get("series") not in effective_series: continue
        if not su.get("is_active", True): continue

        # ── Sector ────────────────────────────────────────────────────────
        if f.sector is not None:
            sectors = f.sector if isinstance(f.sector, list) else [f.sector]
            if su.get("sector") not in sectors: continue

        # ── Market (IN / US / specific exchange) ─────────────────────────
        if f.market is not None:
            mkt = (su.get("market") or "NSE").upper()
            m = f.market.upper()
            if m == "IN" and mkt not in ("NSE", "BSE"): continue
            elif m == "US" and mkt not in ("NASDAQ", "NYSE"): continue
            elif m in ("NSE", "BSE", "NASDAQ", "NYSE") and mkt != m: continue

        # Use stored pct_change if available, else computed
        final_pct = float(row["pct_change"]) if row.get("pct_change") is not None else pct_change

        results.append({
            "symbol":         row["symbol"],
            "company_name":   su.get("company_name") or row["symbol"],
            "series":         su.get("series") or "",
            "sector":         su.get("sector"),
            "market":         su.get("market") or "NSE",
            "currency":       su.get("currency") or "INR",
            "close":          close,
            "prev_close":     prev_close,
            "open":           open_p,
            "high":           high,
            "low":            low,
            "pct_change":     final_pct,
            "gap_pct":        gap_pct,
            "volume":         volume,
            "avg_volume_20d": avg_vol,
            "volume_ratio":   volume_ratio,
            "turnover":       turnover,
            "turnover_cr":    round(turnover / 10_000_000, 2) if turnover else None,
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
            "macd_hist":      float(row["macd_hist"]) if row.get("macd_hist") is not None else None,
            "bb_width":       float(row["bb_width"]) if row.get("bb_width") is not None else None,
            "stoch_k":        float(row["stoch_k"]) if row.get("stoch_k") is not None else None,
            "adx_14":         float(row["adx_14"]) if row.get("adx_14") is not None else None,
            "delivery_pct":   float(row["delivery_pct"]) if row.get("delivery_pct") is not None else None,
            "rs_score":       rs_score_v,
            "is_new_52w_high": bool(row.get("is_new_52w_high")),
            "is_inside_bar":   bool(row.get("is_inside_bar")),
            # Fundamentals
            "market_cap_cr":   su.get("market_cap_cr"),
            "pe_ratio":        su.get("pe_ratio"),
            "pb_ratio":        su.get("pb_ratio"),
            "eps":             su.get("eps"),
            "dividend_yield":  su.get("dividend_yield"),
            "debt_to_equity":  su.get("debt_to_equity"),
            "roe":             su.get("roe"),
            "roce":            su.get("roce"),
        })

    return results


VCP_RPC_CHUNK = 500   # max symbols per get_vcp_lookback RPC call (avoids statement timeout)
VCP_CONCURRENCY = 4  # simultaneous chunk fetches — keeps Supabase connection pool healthy


async def _run_vcp_pass2(
    client,
    pass1_results: list[dict],
    latest_date: str,
    f: "ScanFilters",
) -> list[dict]:
    """
    Pass 2 of VCP detection: fetch LOOKBACK_DAYS of OHLCV per candidate via the
    get_vcp_lookback Postgres CTE, then run detect_vcp() on each.

    Chunks run concurrently (asyncio.gather, cap=VCP_CONCURRENCY) rather than
    sequentially, cutting wall time from sum(chunk_times) to
    ~ceil(n_chunks/VCP_CONCURRENCY) × max(chunk_time). The sync supabase-py
    client is wrapped in asyncio.to_thread so the event loop is not blocked.
    """
    from app.scanners.vcp import detect_vcp, LOOKBACK_DAYS

    min_pivots          = f.vcp_min_pivots          or 2
    max_depth_pct       = f.vcp_max_depth_pct       or 15.0
    pivot_proximity_pct = f.vcp_pivot_proximity_pct or 10.0

    candidate_symbols = [r["symbol"] for r in pass1_results if r.get("symbol")]
    if not candidate_symbols:
        return []

    chunks = [
        candidate_symbols[i : i + VCP_RPC_CHUNK]
        for i in range(0, len(candidate_symbols), VCP_RPC_CHUNK)
    ]

    sem = asyncio.Semaphore(VCP_CONCURRENCY)

    async def _fetch_chunk(chunk: list[str]) -> list[dict]:
        async with sem:
            return await asyncio.to_thread(
                lambda: (
                    client.rpc(
                        "get_vcp_lookback",
                        {
                            "p_symbols":  chunk,
                            "p_ref_date": latest_date,
                            "p_lookback": LOOKBACK_DAYS,
                        },
                    )
                    .execute()
                    .data or []
                )
            )

    chunk_results = await asyncio.gather(*[_fetch_chunk(c) for c in chunks], return_exceptions=True)

    by_symbol: dict[str, list[dict]] = {}
    for rpc_rows in chunk_results:
        if isinstance(rpc_rows, BaseException):
            continue  # one chunk failure → skip, not a full abort
        for row in rpc_rows:
            if row.get("symbol") and row.get("history"):
                by_symbol[row["symbol"]] = row["history"]

    return [
        r for r in pass1_results
        if detect_vcp(
            by_symbol.get(r["symbol"], []),
            min_pivots=min_pivots,
            max_depth_pct=max_depth_pct,
            pivot_proximity_pct=pivot_proximity_pct,
        )
    ]


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/run")
async def run_scanner(
    body: ScanRequest,
    user_id: str = Depends(get_current_user_id),
):
    if not scanner_limiter.is_allowed(user_id):
        raise HTTPException(429, "Too many requests — max 30 scans per minute")

    client  = get_admin_client()
    plan = _get_user_plan(user_id)
    hard_limit = FREE_RESULT_LIMIT if plan == "free" else PRO_RESULT_LIMIT

    # Find last complete trading day (partial ingests have <200 rows; full days 2000+)
    from collections import Counter
    dr = client.table("daily_ohlcv").select("trade_date").order("trade_date", desc=True).limit(5000).execute()
    if not dr.data:
        return {"trade_date": None, "total_matches": 0, "plan_limit": hard_limit, "results": []}
    date_counts = Counter(r["trade_date"] for r in dr.data)
    latest_date = next(
        (d for d in sorted(date_counts, reverse=True) if date_counts[d] >= 1000),
        dr.data[0]["trade_date"],
    )

    # Build base query with series filter pushed to DB
    f = body.filters
    series_list = f.series or ["EQ", "BE"]

    q = (
        client.table("daily_ohlcv")
        .select(
            "symbol,open,high,low,close,prev_close,volume,avg_volume_20d,"
            "turnover,rsi_14,ema_20,ema_50,ema_200,week_52_high,week_52_low,atr_14,"
            "pct_change,gap_pct,macd_line,macd_signal,macd_hist,"
            "bb_upper,bb_middle,bb_lower,bb_width,"
            "stoch_k,stoch_d,adx_14,cci_20,williams_r,"
            "delivery_pct,is_new_52w_high,is_new_52w_low,is_inside_bar,is_outside_bar,"
            "rs_score,sma_50,sma_150,sma_200,volume_ratio,w52h_pct,w52l_pct,"
            "stock_universe!daily_ohlcv_symbol_fkey!inner(symbol,company_name,series,sector,is_active,market,currency,market_cap_cr,pe_ratio,pb_ratio,eps,dividend_yield,debt_to_equity,roe,roce)"
        )
        .eq("trade_date", latest_date)
    )

    # ── Push all single-day filters to DB (ADR 005 M3-B) ─────────────────────
    # Precomputed columns already in schema before M3-A:
    if f.price_min        is not None: q = q.gte("close",       f.price_min)
    if f.price_max        is not None: q = q.lte("close",       f.price_max)
    if f.high_min         is not None: q = q.gte("high",        f.high_min)
    if f.low_max          is not None: q = q.lte("low",         f.low_max)
    if f.volume_min       is not None: q = q.gte("volume",      f.volume_min)
    if f.volume_max       is not None: q = q.lte("volume",      f.volume_max)
    if f.rsi_min          is not None: q = q.gte("rsi_14",      f.rsi_min)
    if f.rsi_max          is not None: q = q.lte("rsi_14",      f.rsi_max)
    if f.atr_min          is not None: q = q.gte("atr_14",      f.atr_min)
    if f.atr_max          is not None: q = q.lte("atr_14",      f.atr_max)
    if f.turnover_min     is not None: q = q.gte("turnover",    f.turnover_min)
    if f.turnover_max     is not None: q = q.lte("turnover",    f.turnover_max)
    if f.turnover_min_cr  is not None: q = q.gte("turnover",    f.turnover_min_cr * 10_000_000)
    if f.pct_change_min   is not None: q = q.gte("pct_change",  f.pct_change_min)
    if f.pct_change_max   is not None: q = q.lte("pct_change",  f.pct_change_max)
    if f.gap_pct_min      is not None: q = q.gte("gap_pct",     f.gap_pct_min)
    if f.gap_pct_max      is not None: q = q.lte("gap_pct",     f.gap_pct_max)
    if f.adx_min          is not None: q = q.gte("adx_14",      f.adx_min)
    if f.adx_max          is not None: q = q.lte("adx_14",      f.adx_max)
    if f.stoch_k_min      is not None: q = q.gte("stoch_k",     f.stoch_k_min)
    if f.stoch_k_max      is not None: q = q.lte("stoch_k",     f.stoch_k_max)
    if f.stoch_d_min      is not None: q = q.gte("stoch_d",     f.stoch_d_min)
    if f.stoch_d_max      is not None: q = q.lte("stoch_d",     f.stoch_d_max)
    if f.cci_min          is not None: q = q.gte("cci_20",      f.cci_min)
    if f.cci_max          is not None: q = q.lte("cci_20",      f.cci_max)
    if f.williams_r_min   is not None: q = q.gte("williams_r",  f.williams_r_min)
    if f.williams_r_max   is not None: q = q.lte("williams_r",  f.williams_r_max)
    if f.bb_width_min     is not None: q = q.gte("bb_width",    f.bb_width_min)
    if f.bb_width_max     is not None: q = q.lte("bb_width",    f.bb_width_max)
    if f.delivery_pct_min is not None: q = q.gte("delivery_pct", f.delivery_pct_min)
    if f.delivery_pct_max is not None: q = q.lte("delivery_pct", f.delivery_pct_max)
    if f.new_52w_high is True:  q = q.eq("is_new_52w_high", True)
    if f.new_52w_low  is True:  q = q.eq("is_new_52w_low",  True)
    if f.is_inside_bar  is True: q = q.eq("is_inside_bar",  True)
    if f.is_outside_bar is True: q = q.eq("is_outside_bar", True)
    if f.macd_hist_positive is True:  q = q.gt("macd_hist", 0)
    if f.macd_hist_positive is False: q = q.lt("macd_hist", 0)
    # M3-A columns: DB push deferred to ingest-job PR — all values currently NULL in production.
    # Postgres treats NULL >= X as NULL (falsy), so pushing now would return 0 results.
    # Python fallback in _apply_filters handles rs_score/volume_ratio/w52h_pct/w52l_pct
    # until the ingest job populates these columns.

    rows = q.limit(SCAN_ROW_CAP).execute().data or []

    # Python-side filter for computed columns
    results = _apply_filters(rows, f)

    # ── Pass 2: VCP two-pass (only when explicitly requested) ────────────────
    if f.vcp_contraction is True and results:
        if plan == "free":
            raise HTTPException(403, "VCP scan requires Pro or Elite plan")
        results = await _run_vcp_pass2(client, results, latest_date, f)

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
        "is_limited":    plan == "free" and total > hard_limit,
        "results":       capped,
    }


@router.get("/screens")
async def list_screens(user_id: str = Depends(get_current_user_id)):
    client = get_admin_client()
    r = client.table("saved_screens").select("*").eq("user_id", user_id).order("created_at", desc=True).execute()
    return {"screens": r.data or []}


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


@router.get("/presets")
async def get_presets():
    """Return all built-in scan presets — public, no auth needed."""
    return PRESETS
