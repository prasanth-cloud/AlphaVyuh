"""
Scanner router — TradingView-style stock screener for NSE/BSE data.
Single-day filters are pushed to the DB as WHERE clauses (ADR 005 M3-B).
Multi-day filters (VCP, volume dry-up) run Python-side post-fetch on a
smaller candidate set returned by the DB push-filters.
"""
from __future__ import annotations

import asyncio
import threading
import time
from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.middleware.auth import get_current_user_id
from app.services.plans import get_effective_user_plan
from app.services.rate_limit import plan_cache, scanner_limiter
from app.services.market_context import eod_source_metadata
from app.services.market_dates import get_latest_complete_trade_date
from app.services.supabase import get_admin_client

router = APIRouter(prefix="/api/v1/scanner", tags=["scanner"])

FREE_RESULT_LIMIT  = 200
PRO_RESULT_LIMIT   = 1000
SCAN_ROW_CAP       = 10_000  # safety limit for unfiltered / lightly-filtered queries
DbPrefilterValue = float | int | bool | str | list[str]
DbPrefilterOp = tuple[str, str, DbPrefilterValue]
UNIVERSE_COUNT_CACHE_TTL = 300.0
LATEST_TRADE_DATE_CACHE_TTL = 60.0
_universe_count_cache: dict[tuple[str, ...], tuple[float, int | None]] = {}
_universe_count_cache_lock = threading.Lock()
_latest_trade_date_cache: tuple[float, str] | None = None
_latest_trade_date_cache_lock = threading.Lock()


def _list_filter(value: list[str] | str | None) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [item for item in value if item]
    return [value] if value else []


def _pgrest_number(value: float | int) -> str:
    number = float(value)
    return str(int(number)) if number.is_integer() else str(number)


def _db_or_null_numeric_op(column: str, operator: str, value: float | int) -> DbPrefilterOp:
    return ("or_", column, f"{column}.is.null,{column}.{operator}.{_pgrest_number(value)}")


def _db_prefilter_ops(f: "ScanFilters") -> list[DbPrefilterOp]:
    ops: list[DbPrefilterOp] = [
        ("eq", "stock_universe.is_active", True),
        ("in_", "stock_universe.series", _list_filter(f.series) or ["EQ", "BE"]),
    ]

    sectors = _list_filter(f.sector)
    if len(sectors) == 1:
        ops.append(("eq", "stock_universe.sector", sectors[0]))
    elif len(sectors) > 1:
        ops.append(("in_", "stock_universe.sector", sectors))

    market_cap_categories = _list_filter(f.market_cap_category)
    if len(market_cap_categories) == 1:
        ops.append(("eq", "stock_universe.market_cap_category", market_cap_categories[0]))
    elif len(market_cap_categories) > 1:
        ops.append(("in_", "stock_universe.market_cap_category", market_cap_categories))

    if f.market is not None:
        market = f.market.upper()
        if market == "IN":
            ops.append(("in_", "stock_universe.market", ["NSE", "BSE"]))
        elif market == "US":
            ops.append(("in_", "stock_universe.market", ["NASDAQ", "NYSE"]))
        elif market in {"NSE", "BSE", "NASDAQ", "NYSE"}:
            ops.append(("eq", "stock_universe.market", market))

    if f.market_cap_min is not None:
        ops.append(("gte", "stock_universe.market_cap_cr", f.market_cap_min))
    if f.market_cap_max is not None:
        ops.append(("lte", "stock_universe.market_cap_cr", f.market_cap_max))
    if f.pe_min is not None:
        ops.append(("gte", "stock_universe.pe_ratio", f.pe_min))
    if f.pe_max is not None:
        ops.append(("lte", "stock_universe.pe_ratio", f.pe_max))
    if f.pb_min is not None:
        ops.append(("gte", "stock_universe.pb_ratio", f.pb_min))
    if f.pb_max is not None:
        ops.append(("lte", "stock_universe.pb_ratio", f.pb_max))
    if f.eps_min is not None:
        ops.append(("gte", "stock_universe.eps", f.eps_min))
    if f.eps_max is not None:
        ops.append(("lte", "stock_universe.eps", f.eps_max))
    if f.dividend_yield_min is not None:
        ops.append(("gte", "stock_universe.dividend_yield", f.dividend_yield_min))
    if f.dividend_yield_max is not None:
        ops.append(("lte", "stock_universe.dividend_yield", f.dividend_yield_max))
    if f.debt_to_equity_max is not None:
        ops.append(("lte", "stock_universe.debt_to_equity", f.debt_to_equity_max))
    if f.roe_min is not None:
        ops.append(("gte", "stock_universe.roe", f.roe_min))
    if f.roce_min is not None:
        ops.append(("gte", "stock_universe.roce", f.roce_min))

    if f.rs_score_min is not None:
        ops.append(("gte", "rs_score", f.rs_score_min))
    if f.rs_score_max is not None:
        ops.append(("lte", "rs_score", f.rs_score_max))
    if f.avg_volume_50d_min is not None:
        ops.append(("gte", "avg_volume_50d", f.avg_volume_50d_min))
    if f.avg_volume_50d_max is not None:
        ops.append(("lte", "avg_volume_50d", f.avg_volume_50d_max))
    if f.price_perf_6m_min is not None:
        ops.append(("gte", "price_perf_6m_pct", f.price_perf_6m_min))
    if f.price_perf_6m_max is not None:
        ops.append(("lte", "price_perf_6m_pct", f.price_perf_6m_max))
    if f.ema_200_trending_up is True:
        ops.append(("gt", "ema_200_slope_30d", 0))
    if f.ema_200_slope_30d_min is not None:
        ops.append(("gte", "ema_200_slope_30d", f.ema_200_slope_30d_min))
    if f.ema_200_slope_30d_max is not None:
        ops.append(("lte", "ema_200_slope_30d", f.ema_200_slope_30d_max))
    if f.darvas_box_height_pct_max is not None:
        ops.append(("lte", "darvas_box_height_pct", f.darvas_box_height_pct_max))
    if f.nr7 is True:
        ops.append(("eq", "is_nr7", True))

    if f.volume_ratio_min is not None:
        ops.append(_db_or_null_numeric_op("volume_ratio", "gte", f.volume_ratio_min))
    if f.volume_ratio_max is not None:
        ops.append(_db_or_null_numeric_op("volume_ratio", "lte", f.volume_ratio_max))

    w52h_limit = f.w52h_pct_max if f.w52h_pct_max is not None else f.week_52_high_pct_max
    if w52h_limit is not None:
        limit = abs(float(w52h_limit))
        ops.append(_db_or_null_numeric_op("w52h_pct", "gte", -limit))
        ops.append(_db_or_null_numeric_op("w52h_pct", "lte", limit))
    if f.w52l_pct_min is not None:
        ops.append(_db_or_null_numeric_op("w52l_pct", "gte", f.w52l_pct_min))
    return ops


def _serialize_prefilter_ops(
    ops: list[DbPrefilterOp],
) -> list[dict[str, DbPrefilterValue]]:
    return [
        {"op": op, "column": column, "value": value}
        for op, column, value in ops
    ]


def _push_db_prefilters(q, f: "ScanFilters"):
    """Push non-fallback scanner intelligence filters into PostgREST.

    Only push fields where a missing DB value is already a hard reject in
    _apply_filters. For fallback-computed fields, keep DB-null rows in the
    query so Python can preserve the older/partial row fallback behavior.
    """
    for op, column, value in _db_prefilter_ops(f):
        if op == "or_":
            q = q.or_(str(value))
        else:
            q = getattr(q, op)(column, value)
    return q


def _universe_count_cache_key(series_list: list[str]) -> tuple[str, ...]:
    return tuple(sorted({series for series in series_list if series}))


def _active_universe_size(client, series_list: list[str]) -> int | None:
    cache_key = _universe_count_cache_key(series_list)
    now = time.monotonic()
    with _universe_count_cache_lock:
        cached = _universe_count_cache.get(cache_key)
        if cached and cached[0] > now:
            return cached[1]

    try:
        universe_size = (
            client.table("stock_universe")
            .select("symbol", count="exact")
            .eq("is_active", True)
            .in_("series", list(cache_key) or ["EQ", "BE"])
            .execute()
            .count
        )
    except Exception:
        universe_size = None

    if universe_size is not None:
        with _universe_count_cache_lock:
            _universe_count_cache[cache_key] = (now + UNIVERSE_COUNT_CACHE_TTL, universe_size)
    return universe_size


def _scanner_latest_complete_trade_date(client) -> str | None:
    global _latest_trade_date_cache

    now = time.monotonic()
    with _latest_trade_date_cache_lock:
        if _latest_trade_date_cache and _latest_trade_date_cache[0] > now:
            return _latest_trade_date_cache[1]

    latest_date = get_latest_complete_trade_date(client)
    if latest_date:
        with _latest_trade_date_cache_lock:
            _latest_trade_date_cache = (now + LATEST_TRADE_DATE_CACHE_TTL, str(latest_date))
    return str(latest_date) if latest_date else None


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
    ema50_above_ema150:  bool | None = None
    ema150_above_ema200: bool | None = None
    all_emas_bullish:    bool | None = None   # ema_20 > ema_50 > ema_200
    all_emas_bearish:    bool | None = None
    price_vs_sma50:      str | None = None    # 'above' | 'below'
    price_vs_sma150:     str | None = None
    price_vs_sma200:     str | None = None
    sma50_above_sma150:  bool | None = None
    sma150_above_sma200: bool | None = None
    all_smas_bullish:    bool | None = None   # close > sma_50 > sma_150 > sma_200
    ema_200_trending_up: bool | None = None
    ema_200_slope_30d_min: float | None = None
    ema_200_slope_30d_max: float | None = None
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
    new_52w_high:         bool | None = None    # day high >= week_52_high
    new_52w_low:          bool | None = None    # day low <= week_52_low

    # ── EMA position aliases (new scanner UI: 'above' | 'below' | '') ───
    price_vs_ema20:  str | None = None   # 'above' | 'below'
    price_vs_ema50:  str | None = None
    price_vs_ema150: str | None = None
    price_vs_ema200: str | None = None

    # ── Relative Strength score (1–99) ──────────────────────────────────
    rs_score_min:    float | None = None   # >= X
    rs_score_max:    float | None = None

    # ── Swing setup read-model fields ────────────────────────────────────
    price_perf_6m_min: float | None = None
    price_perf_6m_max: float | None = None
    avg_volume_50d_min: float | None = None
    avg_volume_50d_max: float | None = None
    darvas_box_height_pct_max: float | None = None
    nr7: bool | None = None

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
    preset_id:  str | None = None
    sort_by:    str = "volume_ratio"   # column key (see SORT_KEYS below)
    sort_order: str = "desc"           # "asc" | "desc"
    page:       int = 1
    page_size:  int = 25               # 25 | 50 | 150 | 200 | 0(all)


class SaveScreenRequest(BaseModel):
    name:       str
    filters:    dict
    is_default: bool = False


# ── Valid sort keys ───────────────────────────────────────────────────────────

SORT_KEYS = {
    "symbol", "close", "pct_change", "volume", "volume_ratio",
    "rsi_14", "ema_20", "atr_14", "week_52_high_pct", "gap_pct",
    "atr_pct", "turnover", "adx_14", "stoch_k", "setup_score",
}

PRESETS = [
    {
        "id": "trend_template",
        "name": "Trend Template",
        "description": "Daily trend template using the populated SMA 50/150/200 stack, EMA 200, RSI, and 52-week range context.",
        "color": "#5b63f5",
        "filters": {
            "all_smas_bullish": True,
            "price_vs_ema50": "above",
            "price_vs_ema150": "above",
            "price_vs_sma50": "above",
            "price_vs_sma150": "above",
            "price_vs_sma200": "above",
            "price_vs_ema200": "above",
            "ema50_above_ema150": True,
            "ema150_above_ema200": True,
            "ema_200_trending_up": True,
            "rsi_min": 50,
            "rs_score_min": 70,
            "week_52_high_pct_max": 25.0,
            "w52l_pct_min": 30.0,
            "series": ["EQ"],
        },
    },
    {
        "id": "vcp_breakout",
        "name": "VCP Breakout",
        "description": "Volatility Contraction Pattern candidates within 5% of recent highs, with trend alignment, contraction, and liquidity confirmation.",
        "color": "#0f766e",
        "filters": {
            "vcp_contraction": True,
            "vcp_min_pivots": 2,
            "vcp_max_depth_pct": 15.0,
            "vcp_pivot_proximity_pct": 5.0,
            "all_smas_bullish": True,
            "price_vs_ema50": "above",
            "price_vs_ema150": "above",
            "price_vs_sma50": "above",
            "ema50_above_ema150": True,
            "ema150_above_ema200": True,
            "ema_200_trending_up": True,
            "rs_score_min": 70,
            "week_52_high_pct_max": 10.0,
            "atr_pct_max": 8.0,
            "volume_ratio_min": 1.0,
            "avg_volume_50d_min": 100000.0,
            "series": ["EQ"],
        },
    },
    {
        "id": "stage2_breakout",
        "name": "Stage 2 Breakout",
        "description": "Stage 2 breakout approximation: price above the SMA trend stack, rising EMA 200, near highs, with volume expansion.",
        "color": "#d97706",
        "filters": {
            "all_smas_bullish": True,
            "price_vs_sma50": "above",
            "price_vs_sma150": "above",
            "price_vs_sma200": "above",
            "ema_200_trending_up": True,
            "week_52_high_pct_max": 15.0,
            "volume_ratio_min": 1.5,
            "rsi_min": 50,
            "rs_score_min": 70,
            "avg_volume_50d_min": 100000.0,
            "series": ["EQ"],
        },
    },
    {
        "id": "high_52w_breakout",
        "name": "52W High Breakout",
        "description": "Stocks breaking to a new 52-week high or closing within 2% of the high with above-average volume.",
        "color": "#e5383b",
        "filters": {
            "week_52_high_pct_max": 2.0,
            "new_52w_high": True,
            "pct_change_min": 0.0,
            "volume_ratio_min": 1.5,
            "price_vs_sma50": "above",
            "avg_volume_50d_min": 100000.0,
            "series": ["EQ"],
        },
    },
    {
        "id": "episodic_pivot",
        "name": "Episodic Pivot",
        "description": "Event-style pivot: strong six-month performance, large positive move, volume expansion, and close above the intermediate trend.",
        "color": "#7c6af0",
        "filters": {
            "pct_change_min": 4.0,
            "volume_ratio_min": 2.0,
            "price_perf_6m_min": 20.0,
            "price_vs_sma50": "above",
            "rsi_min": 55,
            "week_52_high_pct_max": 30.0,
            "series": ["EQ"],
        },
    },
    {
        "id": "darvas_box_breakout",
        "name": "Box Breakout",
        "description": "Tight box breakout: 3-week box height under 15%, near 52-week highs, above SMA 50, with volume confirmation and manageable ATR.",
        "color": "#26a65b",
        "filters": {
            "week_52_high_pct_max": 8.0,
            "price_vs_sma50": "above",
            "volume_ratio_min": 1.5,
            "atr_pct_max": 6.0,
            "darvas_box_height_pct_max": 15.0,
            "avg_volume_50d_min": 100000.0,
            "series": ["EQ"],
        },
    },
]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_user_plan(user_id: str) -> str:
    cached = plan_cache.get(user_id)
    if cached:
        return cached
    client = get_admin_client()
    plan = get_effective_user_plan(client, user_id)
    plan_cache.set(user_id, plan)
    return plan


def _safe(val, default=0.0):
    """Cast to float, return default if None/falsy."""
    try:
        return float(val) if val is not None else default
    except (TypeError, ValueError):
        return default


def _clamp_score(value: float) -> int:
    return max(0, min(100, int(round(value))))


def _score_setup(result: dict, preset_id: str | None) -> dict:
    """Return trader-facing prioritization metadata for a scanner match.

    This is intentionally deterministic and explanation-first. It does not
    change whether a row matches a scanner; it only helps a trader decide what
    to review first.
    """
    score = 48.0
    reasons: list[str] = []

    rs_score = result.get("rs_score")
    volume_ratio = result.get("volume_ratio")
    w52h_pct = result.get("week_52_high_pct")
    ema_slope = result.get("ema_200_slope_30d")
    price_perf_6m = result.get("price_perf_6m_pct")
    box_height = result.get("darvas_box_height_pct")
    atr_pct = result.get("atr_pct")
    pct_change = result.get("pct_change")
    data_warnings = result.get("data_warnings") or []

    if rs_score is not None:
        if rs_score >= 85:
            score += 14
            reasons.append("strong relative strength")
        elif rs_score >= 70:
            score += 9
            reasons.append("healthy relative strength")
        elif rs_score < 55:
            score -= 8

    if volume_ratio is not None:
        if volume_ratio >= 2:
            score += 12
            reasons.append("volume expansion")
        elif volume_ratio >= 1.2:
            score += 7
            reasons.append("above-average volume")
        elif volume_ratio < 0.7:
            score -= 5

    if w52h_pct is not None:
        if w52h_pct <= 3:
            score += 12
            reasons.append("near 52-week high")
        elif w52h_pct <= 12:
            score += 7
            reasons.append("within striking distance of highs")
        elif w52h_pct > 30:
            score -= 6

    if ema_slope is not None:
        if ema_slope > 2:
            score += 10
            reasons.append("long-term trend rising")
        elif ema_slope > 0:
            score += 6
        else:
            score -= 12

    if price_perf_6m is not None:
        if price_perf_6m >= 35:
            score += 10
            reasons.append("strong 6-month leadership")
        elif price_perf_6m >= 15:
            score += 6
        elif price_perf_6m < 0:
            score -= 8

    if box_height is not None:
        if box_height <= 10:
            score += 9
            reasons.append("tight consolidation")
        elif box_height <= 15:
            score += 5
        elif box_height > 25:
            score -= 6

    if atr_pct is not None:
        if atr_pct <= 6:
            score += 5
            reasons.append("manageable daily range")
        elif atr_pct > 10:
            score -= 7

    if pct_change is not None and preset_id in {"high_52w_breakout", "episodic_pivot"}:
        if pct_change >= 3:
            score += 10
            reasons.append("fresh price thrust")
        elif pct_change > 0:
            score += 4

    if preset_id == "trend_template":
        score += 4 if result.get("ema_150") is not None else -4
    elif preset_id == "vcp_breakout":
        score += 5 if box_height is not None and box_height <= 15 else 0
    elif preset_id == "stage2_breakout":
        score += 5 if result.get("sma_200") is not None else -3
    elif preset_id == "darvas_box_breakout":
        score += 6 if box_height is not None and box_height <= 15 else 0

    if data_warnings:
        score -= min(18, len(data_warnings) * 6)

    final_score = _clamp_score(score)
    if final_score >= 80:
        grade = "A"
        label = "High confidence"
    elif final_score >= 65:
        grade = "B"
        label = "Worth review"
    elif final_score >= 50:
        grade = "C"
        label = "Needs confirmation"
    else:
        grade = "D"
        label = "Low confidence"

    return {
        "setup_score": final_score,
        "setup_grade": grade,
        "confidence_label": label,
        "confidence_reasons": reasons[:3],
    }


def _apply_filters(rows: list[dict], f: ScanFilters, preset_id: str | None = None) -> list[dict]:
    """
    Enrich each row with computed columns, then apply Python-side filters.
    Returns only matching rows (with computed fields attached).
    """
    results = []

    for row in rows:
        match_reasons: list[str] = []
        data_warnings: list[str] = []
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
        ema150_v   = float(row["ema_150"])       if row.get("ema_150")      is not None else None
        ema200_v   = float(row["ema_200"])       if row.get("ema_200")      is not None else None
        ema200_slope_30d_v = float(row["ema_200_slope_30d"]) if row.get("ema_200_slope_30d") is not None else None
        sma50_v    = float(row["sma_50"])        if row.get("sma_50")       is not None else None
        sma150_v   = float(row["sma_150"])       if row.get("sma_150")      is not None else None
        sma200_v   = float(row["sma_200"])       if row.get("sma_200")      is not None else None
        atr_v      = float(row["atr_14"])        if row.get("atr_14")       is not None else None
        avg_vol50_v = int(row.get("avg_volume_50d") or 0) if row.get("avg_volume_50d") is not None else None
        price_perf_6m_v = float(row["price_perf_6m_pct"]) if row.get("price_perf_6m_pct") is not None else None
        high_3w_v = float(row["high_3w"]) if row.get("high_3w") is not None else None
        low_3w_v = float(row["low_3w"]) if row.get("low_3w") is not None else None
        darvas_box_height_v = float(row["darvas_box_height_pct"]) if row.get("darvas_box_height_pct") is not None else None
        is_nr7_v = bool(row.get("is_nr7")) if row.get("is_nr7") is not None else None
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
        w52h_pct = abs(_db_w52h) if _db_w52h is not None else (round((w52h_v - close) / close * 100, 2) if w52h_v and close else None)
        _db_w52l = float(row["w52l_pct"])     if row.get("w52l_pct")     is not None else None
        w52l_pct = _db_w52l if _db_w52l is not None else (round((close - w52l_v) / w52l_v * 100, 2) if w52l_v and close else None)
        row_new_52w_high = bool(row.get("is_new_52w_high")) or (w52h_v is not None and high >= w52h_v)
        row_new_52w_low = bool(row.get("is_new_52w_low")) or (w52l_v is not None and low <= w52l_v)

        # ── Price & Performance ──────────────────────────────────────────
        if f.price_min       is not None and close < f.price_min:            continue
        if f.price_max       is not None and close > f.price_max:            continue
        if f.pct_change_min  is not None and (pct_change is None or pct_change < f.pct_change_min): continue
        if f.pct_change_max  is not None and (pct_change is None or pct_change > f.pct_change_max): continue
        if pct_change is not None and (f.pct_change_min is not None or f.pct_change_max is not None):
            match_reasons.append(f"Price move {pct_change:+.1f}%")
        if f.gap_pct_min     is not None and (gap_pct is None or gap_pct < f.gap_pct_min):          continue
        if f.gap_pct_max     is not None and (gap_pct is None or gap_pct > f.gap_pct_max):          continue
        if f.high_min        is not None and high < f.high_min:              continue
        if f.low_max         is not None and low  > f.low_max:               continue

        # ── Volume ───────────────────────────────────────────────────────
        if f.volume_min      is not None and volume < f.volume_min:          continue
        if f.volume_max      is not None and volume > f.volume_max:          continue
        if f.volume_ratio_min is not None and (volume_ratio is None or volume_ratio < f.volume_ratio_min): continue
        if f.volume_ratio_max is not None and (volume_ratio is None or volume_ratio > f.volume_ratio_max): continue
        if volume_ratio is not None and (f.volume_ratio_min is not None or f.volume_ratio_max is not None):
            match_reasons.append(f"Volume {volume_ratio:.1f}x 20-day average")
        if f.avg_volume_50d_min is not None:
            if avg_vol50_v is None:
                data_warnings.append("50-day average volume is unavailable.")
                continue
            elif avg_vol50_v < f.avg_volume_50d_min:
                continue
        if f.avg_volume_50d_max is not None:
            if avg_vol50_v is None:
                data_warnings.append("50-day average volume is unavailable.")
                continue
            elif avg_vol50_v > f.avg_volume_50d_max:
                continue
        if f.turnover_min    is not None and turnover < f.turnover_min:      continue
        if f.turnover_max    is not None and turnover > f.turnover_max:      continue

        # ── Momentum ─────────────────────────────────────────────────────
        if f.rsi_min is not None and (rsi_v is None or rsi_v < f.rsi_min):  continue
        if f.rsi_max is not None and (rsi_v is None or rsi_v > f.rsi_max):  continue
        if rsi_v is not None and (f.rsi_min is not None or f.rsi_max is not None):
            match_reasons.append(f"RSI {rsi_v:.0f}")

        # ── Relative Strength score ────────────────────────────────────────
        if f.rs_score_min is not None and (rs_score_v is None or rs_score_v < f.rs_score_min): continue
        if f.rs_score_max is not None and (rs_score_v is None or rs_score_v > f.rs_score_max): continue
        if rs_score_v is not None and (f.rs_score_min is not None or f.rs_score_max is not None):
            match_reasons.append(f"RS score {rs_score_v:.0f}")

        # ── Trend / EMAs ─────────────────────────────────────────────────
        if f.above_ema20  and (ema20_v  is None or close <= ema20_v):  continue
        if f.below_ema20  and (ema20_v  is None or close >= ema20_v):  continue
        if f.above_ema50  and (ema50_v  is None or close <= ema50_v):  continue
        if f.below_ema50  and (ema50_v  is None or close >= ema50_v):  continue
        if f.above_ema200 and (ema200_v is None or close <= ema200_v): continue
        if f.below_ema200 and (ema200_v is None or close >= ema200_v): continue
        if f.ema20_above_ema50  and (ema20_v is None or ema50_v  is None or ema20_v  <= ema50_v):  continue
        if f.ema50_above_ema200 and (ema50_v is None or ema200_v is None or ema50_v  <= ema200_v): continue
        if f.ema50_above_ema150:
            if ema50_v is None or ema150_v is None:
                data_warnings.append("EMA 150 is unavailable until the scanner intelligence migration is applied/backfilled.")
                continue
            elif ema50_v <= ema150_v:
                continue
            else:
                match_reasons.append("EMA 50 above EMA 150")
        if f.ema150_above_ema200:
            if ema150_v is None or ema200_v is None:
                data_warnings.append("EMA 150 is unavailable until the scanner intelligence migration is applied/backfilled.")
                continue
            elif ema150_v <= ema200_v:
                continue
            else:
                match_reasons.append("EMA 150 above EMA 200")
        if f.all_emas_bullish and (
            ema20_v is None or ema50_v is None or ema200_v is None
            or not (ema20_v > ema50_v > ema200_v)
        ): continue
        if f.all_emas_bearish and (
            ema20_v is None or ema50_v is None or ema200_v is None
            or not (ema20_v < ema50_v < ema200_v)
        ): continue
        if f.price_vs_sma50 == "above" and (sma50_v is None or close <= sma50_v): continue
        if f.price_vs_sma50 == "below" and (sma50_v is None or close >= sma50_v): continue
        if f.price_vs_sma150 == "above" and (sma150_v is None or close <= sma150_v): continue
        if f.price_vs_sma150 == "below" and (sma150_v is None or close >= sma150_v): continue
        if f.price_vs_sma200 == "above" and (sma200_v is None or close <= sma200_v): continue
        if f.price_vs_sma200 == "below" and (sma200_v is None or close >= sma200_v): continue
        if f.sma50_above_sma150 and (sma50_v is None or sma150_v is None or sma50_v <= sma150_v): continue
        if f.sma150_above_sma200 and (sma150_v is None or sma200_v is None or sma150_v <= sma200_v): continue
        if f.all_smas_bullish and (
            sma50_v is None or sma150_v is None or sma200_v is None
            or close <= sma50_v
            or not (sma50_v > sma150_v > sma200_v)
        ): continue
        if f.all_smas_bullish:
            match_reasons.append("Price above SMA 50/150/200 trend stack")
        if f.ema_200_trending_up is True:
            if ema200_slope_30d_v is None:
                data_warnings.append("EMA 200 slope is unavailable until the scanner intelligence migration is applied/backfilled.")
                continue
            elif ema200_slope_30d_v <= 0:
                continue
            else:
                match_reasons.append(f"EMA 200 rising over 30 sessions ({ema200_slope_30d_v:.1f}%)")
        if f.ema_200_slope_30d_min is not None:
            if ema200_slope_30d_v is None:
                data_warnings.append("EMA 200 slope is unavailable.")
                continue
            elif ema200_slope_30d_v < f.ema_200_slope_30d_min:
                continue
        if f.ema_200_slope_30d_max is not None:
            if ema200_slope_30d_v is None:
                data_warnings.append("EMA 200 slope is unavailable.")
                continue
            elif ema200_slope_30d_v > f.ema_200_slope_30d_max:
                continue
        if f.ema20_dist_min is not None and (ema20_dist is None or ema20_dist < f.ema20_dist_min): continue
        if f.ema20_dist_max is not None and (ema20_dist is None or ema20_dist > f.ema20_dist_max): continue
        if f.ema50_dist_min is not None and (ema50_dist is None or ema50_dist < f.ema50_dist_min): continue
        if f.ema50_dist_max is not None and (ema50_dist is None or ema50_dist > f.ema50_dist_max): continue

        # ── Volatility ───────────────────────────────────────────────────
        if f.atr_min     is not None and (atr_v    is None or atr_v    < f.atr_min):     continue
        if f.atr_max     is not None and (atr_v    is None or atr_v    > f.atr_max):     continue
        if f.atr_pct_min is not None and (atr_pct_v is None or atr_pct_v < f.atr_pct_min): continue
        if f.atr_pct_max is not None and (atr_pct_v is None or atr_pct_v > f.atr_pct_max): continue
        if atr_pct_v is not None and (f.atr_pct_min is not None or f.atr_pct_max is not None):
            match_reasons.append(f"ATR risk {atr_pct_v:.1f}%")

        # ── 52-Week ───────────────────────────────────────────────────────
        w52h_limit = f.w52h_pct_max if f.w52h_pct_max is not None else f.week_52_high_pct_max
        if w52h_limit is not None and (w52h_pct is None or w52h_pct > w52h_limit): continue
        if f.w52l_pct_min  is not None and (w52l_pct is None or w52l_pct < f.w52l_pct_min): continue
        if f.new_52w_high and not row_new_52w_high: continue
        if f.new_52w_low and not row_new_52w_low: continue
        if w52h_pct is not None and w52h_limit is not None:
            match_reasons.append(f"{w52h_pct:.1f}% from 52W high")
        if w52l_pct is not None and f.w52l_pct_min is not None:
            match_reasons.append(f"{w52l_pct:.1f}% above 52W low")

        # ── Swing setup read-model fields ────────────────────────────────
        if f.price_perf_6m_min is not None:
            if price_perf_6m_v is None:
                data_warnings.append("6-month price performance is unavailable until the scanner intelligence migration is applied/backfilled.")
                continue
            elif price_perf_6m_v < f.price_perf_6m_min:
                continue
        if f.price_perf_6m_max is not None:
            if price_perf_6m_v is None:
                data_warnings.append("6-month price performance is unavailable.")
                continue
            elif price_perf_6m_v > f.price_perf_6m_max:
                continue
        if price_perf_6m_v is not None and (f.price_perf_6m_min is not None or f.price_perf_6m_max is not None):
            match_reasons.append(f"6M performance {price_perf_6m_v:+.1f}%")
        if f.darvas_box_height_pct_max is not None:
            if darvas_box_height_v is None:
                data_warnings.append("3-week box height is unavailable until the scanner intelligence migration is applied/backfilled.")
                continue
            elif darvas_box_height_v > f.darvas_box_height_pct_max:
                continue
            else:
                match_reasons.append(f"3W box height {darvas_box_height_v:.1f}%")
        if f.nr7 is True:
            if is_nr7_v is None:
                data_warnings.append("NR7 range flag is unavailable.")
                continue
            elif not is_nr7_v:
                continue
            else:
                match_reasons.append("NR7 narrow-range day")

        # ── EMA position aliases (price_vs_ema*) ─────────────────────────
        if f.price_vs_ema20 == "above"  and (ema20_v  is None or close <= ema20_v):  continue
        if f.price_vs_ema20 == "below"  and (ema20_v  is None or close >= ema20_v):  continue
        if f.price_vs_ema50 == "above"  and (ema50_v  is None or close <= ema50_v):  continue
        if f.price_vs_ema50 == "below"  and (ema50_v  is None or close >= ema50_v):  continue
        if f.price_vs_ema150 == "above":
            if ema150_v is None:
                data_warnings.append("EMA 150 is unavailable until the scanner intelligence migration is applied/backfilled.")
                continue
            elif close <= ema150_v:
                continue
        if f.price_vs_ema150 == "below":
            if ema150_v is None:
                data_warnings.append("EMA 150 is unavailable until the scanner intelligence migration is applied/backfilled.")
                continue
            elif close >= ema150_v:
                continue
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
        market_cap_category = su.get("market_cap_category")
        if f.market_cap_category is not None:
            market_cap_categories = f.market_cap_category if isinstance(f.market_cap_category, list) else [f.market_cap_category]
            if market_cap_category not in market_cap_categories: continue
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

        result = {
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
            "avg_volume_50d": avg_vol50_v,
            "volume_ratio":   volume_ratio,
            "turnover":       turnover,
            "turnover_cr":    round(turnover / 10_000_000, 2) if turnover else None,
            "rsi_14":         rsi_v,
            "ema_20":         ema20_v,
            "ema_50":         ema50_v,
            "ema_150":        ema150_v,
            "ema_200":        ema200_v,
            "ema_200_slope_30d": ema200_slope_30d_v,
            "sma_50":         sma50_v,
            "sma_150":        sma150_v,
            "sma_200":        sma200_v,
            "ema_20_dist":    ema20_dist,
            "ema_50_dist":    ema50_dist,
            "week_52_high":   w52h_v,
            "week_52_low":    w52l_v,
            "week_52_high_pct": w52h_pct,
            "week_52_low_pct":  w52l_pct,
            "price_perf_6m_pct": price_perf_6m_v,
            "high_3w":        high_3w_v,
            "low_3w":         low_3w_v,
            "darvas_box_height_pct": darvas_box_height_v,
            "atr_14":         atr_v,
            "atr_pct":        atr_pct_v,
            "macd_hist":      float(row["macd_hist"]) if row.get("macd_hist") is not None else None,
            "bb_width":       float(row["bb_width"]) if row.get("bb_width") is not None else None,
            "stoch_k":        float(row["stoch_k"]) if row.get("stoch_k") is not None else None,
            "adx_14":         float(row["adx_14"]) if row.get("adx_14") is not None else None,
            "delivery_pct":   float(row["delivery_pct"]) if row.get("delivery_pct") is not None else None,
            "rs_score":       rs_score_v,
            "is_new_52w_high": row_new_52w_high,
            "is_new_52w_low":  row_new_52w_low,
            "is_inside_bar":   bool(row.get("is_inside_bar")),
            "is_nr7":          is_nr7_v,
            "match_reasons":   match_reasons[:6],
            "data_warnings":   data_warnings[:4],
            # Fundamentals
            "market_cap_category": su.get("market_cap_category"),
            "market_cap_cr":   su.get("market_cap_cr"),
            "pe_ratio":        su.get("pe_ratio"),
            "pb_ratio":        su.get("pb_ratio"),
            "eps":             su.get("eps"),
            "dividend_yield":  su.get("dividend_yield"),
            "debt_to_equity":  su.get("debt_to_equity"),
            "roe":             su.get("roe"),
            "roce":            su.get("roce"),
        }
        result.update(_score_setup(result, preset_id))
        results.append(result)

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

    try:
        chunk_results = await asyncio.gather(*[_fetch_chunk(c) for c in chunks])
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="VCP scanner lookback is temporarily unavailable.",
        )

    by_symbol: dict[str, list[dict]] = {}
    for rpc_rows in chunk_results:
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

async def execute_scan(
    client,
    body: ScanRequest,
    *,
    plan: str = "free",
    trade_date: str | date | None = None,
    enforce_plan_limit: bool = True,
) -> dict:
    """Run the scanner core for UI scans and saved EOD scan alerts."""
    hard_limit = (
        FREE_RESULT_LIMIT if plan == "free" else PRO_RESULT_LIMIT
    ) if enforce_plan_limit else SCAN_ROW_CAP

    if trade_date is not None:
        latest_date = str(trade_date)
    else:
        try:
            latest_date = _scanner_latest_complete_trade_date(client)
        except Exception:
            latest_date = None
    if not latest_date:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="No complete trade date is available for scanner.",
        )

    # Build base query with series filter pushed to DB
    f = body.filters
    series_list = f.series or ["EQ", "BE"]

    base_select = (
        "symbol,open,high,low,close,prev_close,volume,avg_volume_20d,"
        "turnover,rsi_14,ema_20,ema_50,ema_200,week_52_high,week_52_low,atr_14,"
        "pct_change,gap_pct,macd_line,macd_signal,macd_hist,"
        "bb_upper,bb_middle,bb_lower,bb_width,"
        "stoch_k,stoch_d,adx_14,cci_20,williams_r,"
        "delivery_pct,is_new_52w_high,is_new_52w_low,is_inside_bar,is_outside_bar,"
        "rs_score,sma_50,sma_150,sma_200,volume_ratio,w52h_pct,w52l_pct,"
        "stock_universe!daily_ohlcv_symbol_fkey!inner(symbol,company_name,series,sector,is_active,market,currency,market_cap_category,market_cap_cr,pe_ratio,pb_ratio,eps,dividend_yield,debt_to_equity,roe,roce)"
    )
    intelligence_select = (
        "symbol,open,high,low,close,prev_close,volume,avg_volume_20d,avg_volume_50d,"
        "turnover,rsi_14,ema_20,ema_50,ema_150,ema_200,ema_200_slope_30d,"
        "week_52_high,week_52_low,high_3w,low_3w,darvas_box_height_pct,price_perf_6m_pct,is_nr7,atr_14,"
        "pct_change,gap_pct,macd_line,macd_signal,macd_hist,"
        "bb_upper,bb_middle,bb_lower,bb_width,"
        "stoch_k,stoch_d,adx_14,cci_20,williams_r,"
        "delivery_pct,is_new_52w_high,is_new_52w_low,is_inside_bar,is_outside_bar,"
        "rs_score,sma_50,sma_150,sma_200,volume_ratio,w52h_pct,w52l_pct,"
        "stock_universe!daily_ohlcv_symbol_fkey!inner(symbol,company_name,series,sector,is_active,market,currency,market_cap_category,market_cap_cr,pe_ratio,pb_ratio,eps,dividend_yield,debt_to_equity,roe,roce)"
    )

    q = client.table("daily_ohlcv").select(intelligence_select).eq("trade_date", latest_date)

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
    # 52-week high/low flags can be absent for bhavcopy-ingested rows, so let
    # _apply_filters derive them from daily high/low and the rolling 52w bounds.
    if f.is_inside_bar  is True: q = q.eq("is_inside_bar",  True)
    if f.is_outside_bar is True: q = q.eq("is_outside_bar", True)
    if f.macd_hist_positive is True:  q = q.gt("macd_hist", 0)
    if f.macd_hist_positive is False: q = q.lt("macd_hist", 0)
    db_prefilter_ops = _db_prefilter_ops(f)
    q = _push_db_prefilters(q, f)

    used_fallback_query = False
    try:
        rows = q.limit(SCAN_ROW_CAP).execute().data or []
    except Exception:
        used_fallback_query = True
        try:
            rows = (
                client.table("daily_ohlcv")
                .select(base_select)
                .eq("trade_date", latest_date)
                .limit(SCAN_ROW_CAP)
                .execute()
                .data or []
            )
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Scanner query could not complete; try a narrower preset.",
            )

    # Python-side filter for computed columns
    results = _apply_filters(rows, f, body.preset_id)

    # ── Pass 2: VCP two-pass (only when explicitly requested) ────────────────
    if f.vcp_contraction is True and results:
        if plan == "free":
            raise HTTPException(403, "VCP scan requires Pro or Elite plan")
        results = await _run_vcp_pass2(client, results, latest_date, f)

    # Sort
    sort_key = body.sort_by if body.sort_by in SORT_KEYS else "volume_ratio"
    reverse  = body.sort_order != "asc"
    results.sort(key=lambda x: (x.get(sort_key) is not None, x.get(sort_key) or 0), reverse=reverse)

    total = len(results)
    capped = results[:hard_limit]
    universe_size = _active_universe_size(client, series_list)
    query_rows = len(rows)
    query_row_reduction_pct = (
        round((1 - (query_rows / universe_size)) * 100, 1)
        if universe_size and query_rows <= universe_size
        else None
    )
    applied_prefilters = [] if used_fallback_query else _serialize_prefilter_ops(db_prefilter_ops)
    scanner_performance = {
        "query_rows": query_rows,
        "universe_size": universe_size,
        "query_row_reduction_pct": query_row_reduction_pct,
        "db_prefilters_applied": applied_prefilters,
        "fallback_query": used_fallback_query,
    }
    coverage_pct = None
    metadata = eod_source_metadata(
        as_of=latest_date,
        status="healthy",
        coverage_pct=coverage_pct,
        symbols_count=query_rows,
        universe_active=universe_size,
    )
    metadata["scanner_performance"] = scanner_performance
    safe_page_size = body.page_size if body.page_size in {0, 25, 50, 150, 200} else 25
    safe_page = max(body.page, 1)

    if safe_page_size == 0:
        paged = capped
        total_pages = 1
    else:
        start = (safe_page - 1) * safe_page_size
        end = start + safe_page_size
        paged = capped[start:end]
        total_pages = max(1, (len(capped) + safe_page_size - 1) // safe_page_size)

    return {
        "trade_date":    latest_date,
        "total_matches": total,
        "plan_limit":    hard_limit,
        "plan":          plan,
        "is_limited":    plan == "free" and total > hard_limit,
        "page":          safe_page,
        "page_size":     safe_page_size,
        "total_pages":   total_pages,
        "visible_count": len(paged),
        "results":       paged,
        "source_metadata": metadata,
        "mode": metadata["mode"],
        "source": metadata["source_name"],
        "coverage_pct": coverage_pct,
        "universe_size": universe_size,
        "query_rows": query_rows,
        "source_rows": query_rows,
        "query_row_reduction_pct": query_row_reduction_pct,
        "db_prefilters_applied": applied_prefilters,
    }


@router.post("/run")
async def run_scanner(
    body: ScanRequest,
    user_id: str = Depends(get_current_user_id),
):
    if not scanner_limiter.is_allowed(user_id):
        retry_after = scanner_limiter.retry_after(user_id)
        raise HTTPException(
            429,
            f"Too many requests - try again in {retry_after} seconds.",
            headers={"Retry-After": str(retry_after)},
        )

    try:
        client = get_admin_client()
        plan = _get_user_plan(user_id)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Scanner data is temporarily unavailable.",
        )

    return await execute_scan(client, body, plan=plan)


@router.get("/screens")
async def list_screens(user_id: str = Depends(get_current_user_id)):
    try:
        client = get_admin_client()
        r = client.table("saved_screens").select("*").eq("user_id", user_id).order("created_at", desc=True).execute()
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Saved scanner screens are temporarily unavailable.",
        )
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
