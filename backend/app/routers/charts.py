from __future__ import annotations

from datetime import date, timedelta
from typing import Any
from uuid import UUID

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from app.middleware.auth import get_current_user_id
from app.services import indicators as ta
from app.services.market_data import MarketDataError, MarketIdentity, ProviderNotConfiguredError, get_market_data_provider
from app.services.supabase import get_admin_client

router = APIRouter(prefix="/api/v1/charts", tags=["charts"])


# ── Models ────────────────────────────────────────────────────────────────────

class DrawingCreate(BaseModel):
    tool_type: str
    points: list[Any]
    style: dict[str, Any] = {}
    timeframe: str = "D"


class DrawingUpdate(BaseModel):
    tool_type: str
    points: list[Any]
    style: dict[str, Any] = {}
    timeframe: str = "D"


class LayoutSave(BaseModel):
    timeframe: str = "D"
    indicators: list[str] = []
    drawing_tools: list[Any] = []


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_user_plan(user_id: str) -> str:
    sb = get_admin_client()
    r = sb.table("users").select("plan").eq("id", user_id).single().execute()
    return r.data.get("plan", "free") if r.data else "free"


def _fetch_ohlcv(symbol: str, limit: int = 500) -> pd.DataFrame:
    """Fetch up to `limit` most recent daily bars for a symbol, oldest first."""
    sb = get_admin_client()
    r = (
        sb.table("daily_ohlcv")
        .select("trade_date,open,high,low,close,volume,prev_close,turnover,rsi_14,ema_20,ema_50,ema_200,atr_14,avg_volume_20d,week_52_high,week_52_low")
        .eq("symbol", symbol.upper())
        .order("trade_date", desc=True)
        .limit(limit)
        .execute()
    )
    if not r.data:
        return pd.DataFrame()
    df = pd.DataFrame(r.data)
    df["trade_date"] = pd.to_datetime(df["trade_date"]).dt.date
    df = df.sort_values("trade_date").reset_index(drop=True)
    return df


def _lookup_market_identity(symbol: str) -> MarketIdentity:
    try:
        r = (
            get_admin_client()
            .table("stock_universe")
            .select("market,currency")
            .eq("symbol", symbol.upper())
            .maybe_single()
            .execute()
        )
        if r and r.data:
            return MarketIdentity(
                market=r.data.get("market") or "NSE",
                currency=r.data.get("currency") or "INR",
            )
    except Exception:
        pass
    return MarketIdentity()


def _default_layout(symbol: str) -> dict[str, Any]:
    return {
        "symbol": symbol.upper(),
        "timeframe": "D",
        "indicators": [],
        "drawing_tools": [],
    }


def _aggregate_to_timeframe(df: pd.DataFrame, timeframe: str) -> pd.DataFrame:
    """
    Aggregate daily OHLCV into weekly (W) or monthly (M) bars.
    Returns same column structure as _fetch_ohlcv but with fewer rows.
    """
    if timeframe not in ("W", "M") or df.empty:
        return df

    df = df.copy()
    df["trade_date"] = pd.to_datetime(df["trade_date"])
    for col in ["open", "high", "low", "close", "volume"]:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    freq = "W-FRI" if timeframe == "W" else "ME"
    grouped = df.set_index("trade_date").resample(freq)

    agg = pd.DataFrame({
        "open":   grouped["open"].first(),
        "high":   grouped["high"].max(),
        "low":    grouped["low"].min(),
        "close":  grouped["close"].last(),
        "volume": grouped["volume"].sum(),
    }).dropna(subset=["close"])

    agg.index = agg.index.date  # type: ignore[assignment]
    agg = agg.reset_index().rename(columns={"index": "trade_date"})
    # Prev close = prior bar's close
    agg["prev_close"] = agg["close"].shift(1)
    return agg


def _compute_indicators(df: pd.DataFrame, requested: list[str]) -> dict[str, list[dict]]:
    """Compute requested indicators on df. Returns last 365 rows per indicator."""
    result: dict[str, list[dict]] = {}
    close = df["close"].astype(float)
    high = df["high"].astype(float)
    low = df["low"].astype(float)
    volume = df["volume"].astype(float)
    dates = df["trade_date"]
    tail = 365

    def _to_list(s: pd.Series, key: str = "value") -> list[dict]:
        out = []
        for dt, val in zip(dates.iloc[-tail:], s.iloc[-tail:]):
            if pd.notna(val):
                out.append({"time": str(dt), key: round(float(val), 4)})
        return out

    for ind in [i.lower().strip() for i in requested]:
        if ind == "ema20":
            result["ema20"] = _to_list(ta.ema(close, 20))

        elif ind == "ema50":
            result["ema50"] = _to_list(ta.ema(close, 50))

        elif ind == "ema200":
            result["ema200"] = _to_list(ta.ema(close, 200))

        elif ind == "rsi":
            result["rsi"] = _to_list(ta.rsi(close, 14))

        elif ind == "macd":
            macd_line, signal_line, histogram = ta.macd(close, 12, 26, 9)
            out = []
            for dt, m, s, h in zip(
                dates.iloc[-tail:],
                macd_line.iloc[-tail:],
                signal_line.iloc[-tail:],
                histogram.iloc[-tail:],
            ):
                if pd.notna(m):
                    out.append({
                        "time": str(dt),
                        "macd": round(float(m), 4),
                        "signal": round(float(s), 4) if pd.notna(s) else None,
                        "histogram": round(float(h), 4) if pd.notna(h) else None,
                    })
            result["macd"] = out

        elif ind == "bb":
            upper, mid, lower = ta.bbands(close, 20, 2.0)
            out = []
            for dt, u, m, l in zip(
                dates.iloc[-tail:],
                upper.iloc[-tail:],
                mid.iloc[-tail:],
                lower.iloc[-tail:],
            ):
                if pd.notna(u):
                    out.append({
                        "time": str(dt),
                        "upper": round(float(u), 4),
                        "mid": round(float(m), 4) if pd.notna(m) else None,
                        "lower": round(float(l), 4) if pd.notna(l) else None,
                    })
            result["bb"] = out

        elif ind == "vwap":
            typical = (high + low + close) / 3
            vwap_s = (typical * volume).rolling(20, min_periods=1).sum() / volume.rolling(20, min_periods=1).sum()
            result["vwap"] = _to_list(vwap_s)

        elif ind == "stoch":
            k, d = ta.stochastic(high, low, close, k_period=14, d_period=3, smooth_k=3)
            out = []
            for dt, kv, dv in zip(dates.iloc[-tail:], k.iloc[-tail:], d.iloc[-tail:]):
                if pd.notna(kv):
                    out.append({
                        "time": str(dt),
                        "k": round(float(kv), 2),
                        "d": round(float(dv), 2) if pd.notna(dv) else None,
                    })
            result["stoch"] = out

        elif ind == "atr":
            atr_s = ta.atr(high, low, close, 14)
            result["atr"] = _to_list(atr_s)

        elif ind == "ichimoku":
            t_sen, k_sen, s_a, s_b, chikou = ta.ichimoku(high, low, close)
            out = []
            for i, dt in enumerate(dates.iloc[-tail:]):
                idx = len(dates) - tail + i
                def _v(s, pos=idx): return round(float(s.iloc[pos]), 4) if pos < len(s) and pd.notna(s.iloc[pos]) else None
                out.append({
                    "time": str(dt),
                    "tenkan": _v(t_sen),
                    "kijun":  _v(k_sen),
                    "senkou_a": _v(s_a),
                    "senkou_b": _v(s_b),
                    "chikou": _v(chikou),
                })
            result["ichimoku"] = out

    return result


# ── Candles endpoint ──────────────────────────────────────────────────────────

@router.get("/{symbol}/candles")
async def get_candles(
    symbol: str,
    timeframe: str = Query("D"),
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
    limit: int = Query(365, ge=1, le=3000),
):
    sym = symbol.upper()
    sb = get_admin_client()

    # Fetch metadata
    uni = sb.table("stock_universe").select("company_name,sector,series").eq("symbol", sym).maybe_single().execute()
    meta = uni.data or {}

    # For W/M we need more raw daily bars to aggregate into enough candles
    tf = timeframe.upper()
    raw_limit = limit if tf == "D" else (limit * 7 if tf == "W" else limit * 31)
    raw_limit = min(raw_limit, 3000)

    td = date.today()
    fd = date.fromisoformat(from_date) if from_date else (td - timedelta(days=365 * 12))
    td2 = date.fromisoformat(to_date) if to_date else td

    q = (
        sb.table("daily_ohlcv")
        .select("trade_date,open,high,low,close,volume,prev_close,avg_volume_20d,rsi_14,ema_20,ema_50,ema_200,atr_14,week_52_high,week_52_low")
        .eq("symbol", sym)
        .gte("trade_date", str(fd))
        .lte("trade_date", str(td2))
        .order("trade_date", desc=False)
        .limit(raw_limit)
        .execute()
    )

    if not q.data:
        raise HTTPException(status_code=404, detail=f"No candle data found for {sym}")

    # Build daily df then aggregate if needed
    daily_df = pd.DataFrame(q.data)
    daily_df["trade_date"] = pd.to_datetime(daily_df["trade_date"]).dt.date
    for col in ["open", "high", "low", "close", "volume"]:
        daily_df[col] = pd.to_numeric(daily_df[col], errors="coerce")

    if tf in ("W", "M"):
        agg_df = _aggregate_to_timeframe(daily_df, tf)
        # Trim to requested limit
        agg_df = agg_df.tail(limit).reset_index(drop=True)
        candles = [
            {
                "time": str(row["trade_date"]),
                "open":   round(float(row["open"]),   2),
                "high":   round(float(row["high"]),   2),
                "low":    round(float(row["low"]),    2),
                "close":  round(float(row["close"]),  2),
                "volume": int(row["volume"]) if pd.notna(row["volume"]) else 0,
            }
            for _, row in agg_df.iterrows()
        ]
        last = agg_df.iloc[-1]
        prev_close = float(last["prev_close"]) if pd.notna(last.get("prev_close")) else None
        close_val = float(last["close"])
        vol = int(last["volume"]) if pd.notna(last["volume"]) else 0
        # Latest row indicators come from most recent daily row
        last_daily = daily_df.iloc[-1]
        def _f(col): return float(last_daily[col]) if last_daily.get(col) is not None and pd.notna(last_daily[col]) else None
        avg_vol = _f("avg_volume_20d")
        latest = {
            "close": close_val,
            "pct_change": round((close_val - prev_close) / prev_close * 100, 2) if prev_close and prev_close > 0 else None,
            "volume": vol, "volume_ratio": round(vol / avg_vol, 2) if avg_vol else None,
            "rsi_14": _f("rsi_14"), "ema_20": _f("ema_20"), "ema_50": _f("ema_50"), "ema_200": _f("ema_200"),
            "atr_14": _f("atr_14"), "week_52_high": _f("week_52_high"), "week_52_low": _f("week_52_low"),
            "open": float(last["open"]), "high": float(last["high"]), "low": float(last["low"]),
            "prev_close": prev_close,
        }
    else:
        # Daily — original logic
        rows = q.data
        candles = [
            {
                "time": str(row["trade_date"]),
                "open":   float(row["open"]),
                "high":   float(row["high"]),
                "low":    float(row["low"]),
                "close":  float(row["close"]),
                "volume": int(row["volume"]) if row["volume"] else 0,
                "ema_20":  float(row["ema_20"])  if row.get("ema_20")  is not None else None,
                "ema_50":  float(row["ema_50"])  if row.get("ema_50")  is not None else None,
                "ema_200": float(row["ema_200"]) if row.get("ema_200") is not None else None,
            }
            for row in rows
        ]
        latest_row = rows[-1]
        prev_close = float(latest_row["prev_close"]) if latest_row.get("prev_close") else None
        close_val  = float(latest_row["close"])
        avg_vol    = float(latest_row["avg_volume_20d"]) if latest_row.get("avg_volume_20d") else None
        vol        = int(latest_row["volume"]) if latest_row.get("volume") else 0
        def _f(col): return float(latest_row[col]) if latest_row.get(col) is not None else None  # type: ignore[misc]
        latest = {
            "close": close_val,
            "pct_change": round((close_val - prev_close) / prev_close * 100, 2) if prev_close and prev_close > 0 else None,
            "volume": vol, "volume_ratio": round(vol / avg_vol, 2) if avg_vol else None,
            "rsi_14": _f("rsi_14"), "ema_20": _f("ema_20"), "ema_50": _f("ema_50"), "ema_200": _f("ema_200"),
            "atr_14": _f("atr_14"), "week_52_high": _f("week_52_high"), "week_52_low": _f("week_52_low"),
            "open": float(latest_row["open"]), "high": float(latest_row["high"]),
            "low": float(latest_row["low"]), "prev_close": prev_close,
        }

    return {
        "symbol": sym,
        "company_name": meta.get("company_name"),
        "sector": meta.get("sector"),
        "timeframe": tf,
        "candles": candles,
        "latest": latest,
    }


# ── Live candles via configured market data provider ─────────────────────────

@router.get("/{symbol}/candles-live")
async def get_candles_live(
    symbol: str,
    timeframe: str = Query("D"),
    limit: int = Query(500, ge=1, le=1000),
):
    """OHLCV from the configured market data provider."""
    sym = symbol.upper()
    tf = timeframe.upper()
    try:
        return get_market_data_provider().live_candles(sym, tf, limit, _lookup_market_identity(sym))
    except ProviderNotConfiguredError as e:
        raise HTTPException(status_code=501, detail=str(e))
    except MarketDataError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Market data provider error: {e}")


# ── Indicators endpoint ───────────────────────────────────────────────────────

@router.get("/{symbol}/indicators")
async def get_indicators(
    symbol: str,
    timeframe: str = Query("D"),
    indicators: str = Query("ema20,ema50,ema200,rsi"),
):
    sym = symbol.upper()
    tf = timeframe.upper()
    # Fetch more daily rows for W/M so aggregation has enough history
    raw_limit = 500 if tf == "D" else (500 * 7 if tf == "W" else 500 * 31)
    df = _fetch_ohlcv(sym, limit=min(raw_limit, 1000))
    if df.empty:
        raise HTTPException(status_code=404, detail=f"No data for {sym}")

    if tf in ("W", "M"):
        df = _aggregate_to_timeframe(df, tf)

    requested = [i.strip() for i in indicators.split(",") if i.strip()]
    result = _compute_indicators(df, requested)

    return {"symbol": sym, "indicators": result}


# ── Search endpoint ───────────────────────────────────────────────────────────

@router.get("/search")
async def search_symbols(
    q: str = Query(..., min_length=1),
):
    sb = get_admin_client()
    # Two queries: symbol prefix match first, then company name contains
    sym_r = (
        sb.table("stock_universe")
        .select("symbol,company_name,sector,series")
        .ilike("symbol", f"{q.upper()}%")
        .order("symbol")
        .limit(10)
        .execute()
    )
    name_r = (
        sb.table("stock_universe")
        .select("symbol,company_name,sector,series")
        .ilike("company_name", f"%{q}%")
        .order("symbol")
        .limit(10)
        .execute()
    )

    seen: set[str] = set()
    results = []
    for row in (sym_r.data or []) + (name_r.data or []):
        if row["symbol"] not in seen:
            seen.add(row["symbol"])
            results.append(row)
        if len(results) >= 10:
            break

    return {"results": results}


# ── Drawings endpoints ────────────────────────────────────────────────────────

@router.get("/{symbol}/drawings")
async def get_drawings(
    symbol: str,
    timeframe: str = Query("D"),
    user_id: str = Depends(get_current_user_id),
):
    sb = get_admin_client()
    r = (
        sb.table("drawings")
        .select("*")
        .eq("user_id", user_id)
        .eq("symbol", symbol.upper())
        .eq("timeframe", timeframe)
        .order("created_at")
        .execute()
    )
    return r.data or []


@router.post("/{symbol}/drawings", status_code=status.HTTP_201_CREATED)
async def create_drawing(
    symbol: str,
    body: DrawingCreate,
    user_id: str = Depends(get_current_user_id),
):
    sb = get_admin_client()
    r = (
        sb.table("drawings")
        .insert({
            "user_id": user_id,
            "symbol": symbol.upper(),
            "timeframe": body.timeframe,
            "tool_type": body.tool_type,
            "points": body.points,
            "style": body.style,
        })
        .execute()
    )
    if not r.data:
        raise HTTPException(status_code=500, detail="Failed to save drawing")
    return r.data[0]


@router.patch("/{symbol}/drawings/{drawing_id}")
async def update_drawing(
    symbol: str,
    drawing_id: str,
    body: DrawingUpdate,
    user_id: str = Depends(get_current_user_id),
):
    sb = get_admin_client()
    existing = (
        sb.table("drawings")
        .select("id,user_id")
        .eq("id", drawing_id)
        .eq("user_id", user_id)
        .eq("symbol", symbol.upper())
        .maybe_single()
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Drawing not found")

    result = (
        sb.table("drawings")
        .update({
            "tool_type": body.tool_type,
            "points": body.points,
            "style": body.style,
            "timeframe": body.timeframe,
        })
        .eq("id", drawing_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to update drawing")
    return result.data[0]


@router.delete("/{symbol}/drawings/{drawing_id}")
async def delete_drawing(
    symbol: str,
    drawing_id: str,
    user_id: str = Depends(get_current_user_id),
):
    sb = get_admin_client()
    # Verify ownership
    existing = (
        sb.table("drawings")
        .select("id,user_id")
        .eq("id", drawing_id)
        .eq("user_id", user_id)
        .maybe_single()
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Drawing not found")
    sb.table("drawings").delete().eq("id", drawing_id).execute()
    return {"message": "Deleted"}


# ── Layout endpoints ──────────────────────────────────────────────────────────

@router.get("/{symbol}/layout")
async def get_layout(
    symbol: str,
    user_id: str = Depends(get_current_user_id),
):
    sb = get_admin_client()
    try:
        r = (
            sb.table("chart_layouts")
            .select("*")
            .eq("user_id", user_id)
            .eq("symbol", symbol.upper())
            .maybe_single()
            .execute()
        )
    except Exception:
        return _default_layout(symbol)
    return (r.data if r else None) or _default_layout(symbol)


@router.post("/{symbol}/layout")
async def save_layout(
    symbol: str,
    body: LayoutSave,
    user_id: str = Depends(get_current_user_id),
):
    sb = get_admin_client()
    payload = {
        "user_id": user_id,
        "symbol": symbol.upper(),
        "timeframe": body.timeframe,
        "indicators": body.indicators,
        "drawing_tools": body.drawing_tools,
        "updated_at": "now()",
    }
    r = (
        sb.table("chart_layouts")
        .upsert(payload, on_conflict="user_id,symbol")
        .execute()
    )
    if not r.data:
        raise HTTPException(status_code=500, detail="Failed to save layout")
    return r.data[0]
