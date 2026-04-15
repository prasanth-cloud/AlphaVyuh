from __future__ import annotations

from datetime import date, timedelta
from typing import Any
from uuid import UUID

import pandas as pd
import pandas_ta as ta
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from app.middleware.auth import get_current_user_id
from app.services.supabase import get_admin_client

router = APIRouter(prefix="/api/v1/charts", tags=["charts"])


# ── Models ────────────────────────────────────────────────────────────────────

class DrawingCreate(BaseModel):
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
    # Compute derived fields
    df["pct_change"] = df.apply(
        lambda row: round((row["close"] - row["prev_close"]) / row["prev_close"] * 100, 2)
        if row.get("prev_close") and row["prev_close"] > 0 else None,
        axis=1,
    )
    df["volume_ratio"] = df.apply(
        lambda row: round(row["volume"] / row["avg_volume_20d"], 2)
        if row.get("avg_volume_20d") and row["avg_volume_20d"] > 0 else None,
        axis=1,
    )
    return df


def _compute_indicators(df: pd.DataFrame, requested: list[str]) -> dict[str, list[dict]]:
    """Compute requested indicators on df. Returns last 365 rows per indicator."""
    result: dict[str, list[dict]] = {}
    close = df["close"].astype(float)
    high = df["high"].astype(float)
    low = df["low"].astype(float)
    volume = df["volume"].astype(float)
    dates = df["trade_date"]

    # Use last 365 rows for output
    tail = 365

    def _series_to_list(s: pd.Series, key: str = "value") -> list[dict]:
        out = []
        s_tail = s.iloc[-tail:]
        d_tail = dates.iloc[-tail:]
        for dt, val in zip(d_tail, s_tail):
            if pd.notna(val):
                out.append({"time": str(dt), key: round(float(val), 4)})
        return out

    for ind in requested:
        ind = ind.lower().strip()

        if ind == "ema20":
            s = ta.ema(close, length=20)
            result["ema20"] = _series_to_list(s) if s is not None else []

        elif ind == "ema50":
            s = ta.ema(close, length=50)
            result["ema50"] = _series_to_list(s) if s is not None else []

        elif ind == "ema200":
            s = ta.ema(close, length=200)
            result["ema200"] = _series_to_list(s) if s is not None else []

        elif ind == "rsi":
            s = ta.rsi(close, length=14)
            result["rsi"] = _series_to_list(s) if s is not None else []

        elif ind == "macd":
            m = ta.macd(close, fast=12, slow=26, signal=9)
            if m is not None and not m.empty:
                out = []
                m_tail = m.iloc[-tail:]
                d_tail = dates.iloc[-tail:]
                mc = m.columns.tolist()
                macd_col = next((c for c in mc if c.startswith("MACD_") and not c.startswith("MACDs") and not c.startswith("MACDh")), None)
                sig_col = next((c for c in mc if c.startswith("MACDs_")), None)
                hist_col = next((c for c in mc if c.startswith("MACDh_")), None)
                for dt, (_, row) in zip(d_tail, m_tail.iterrows()):
                    if macd_col and pd.notna(row.get(macd_col)):
                        out.append({
                            "time": str(dt),
                            "macd": round(float(row[macd_col]), 4) if macd_col else None,
                            "signal": round(float(row[sig_col]), 4) if sig_col and pd.notna(row.get(sig_col)) else None,
                            "histogram": round(float(row[hist_col]), 4) if hist_col and pd.notna(row.get(hist_col)) else None,
                        })
                result["macd"] = out
            else:
                result["macd"] = []

        elif ind == "bb":
            b = ta.bbands(close, length=20, std=2)
            if b is not None and not b.empty:
                out = []
                b_tail = b.iloc[-tail:]
                d_tail = dates.iloc[-tail:]
                bc = b.columns.tolist()
                upper_col = next((c for c in bc if c.startswith("BBU_")), None)
                mid_col = next((c for c in bc if c.startswith("BBM_")), None)
                lower_col = next((c for c in bc if c.startswith("BBL_")), None)
                for dt, (_, row) in zip(d_tail, b_tail.iterrows()):
                    if upper_col and pd.notna(row.get(upper_col)):
                        out.append({
                            "time": str(dt),
                            "upper": round(float(row[upper_col]), 4) if upper_col else None,
                            "mid": round(float(row[mid_col]), 4) if mid_col and pd.notna(row.get(mid_col)) else None,
                            "lower": round(float(row[lower_col]), 4) if lower_col and pd.notna(row.get(lower_col)) else None,
                        })
                result["bb"] = out
            else:
                result["bb"] = []

        elif ind == "vwap":
            # 20-day rolling VWAP approximation
            typical = (high + low + close) / 3
            tp_vol = typical * volume
            rolling_tp_vol = tp_vol.rolling(window=20, min_periods=1).sum()
            rolling_vol = volume.rolling(window=20, min_periods=1).sum()
            vwap_s = rolling_tp_vol / rolling_vol
            result["vwap"] = _series_to_list(vwap_s)

    return result


# ── Candles endpoint ──────────────────────────────────────────────────────────

@router.get("/{symbol}/candles")
async def get_candles(
    symbol: str,
    timeframe: str = Query("D"),
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
    limit: int = Query(365, ge=1, le=1000),
    user_id: str = Depends(get_current_user_id),
):
    sym = symbol.upper()
    sb = get_admin_client()

    # Fetch from stock_universe for metadata
    uni = sb.table("stock_universe").select("company_name,sector,series").eq("symbol", sym).maybe_single().execute()
    meta = uni.data or {}

    # Date range
    td = date.today()
    fd = date.fromisoformat(from_date) if from_date else (td - timedelta(days=365 * 2))
    td2 = date.fromisoformat(to_date) if to_date else td

    q = (
        sb.table("daily_ohlcv")
        .select("trade_date,open,high,low,close,volume,prev_close,turnover,rsi_14,ema_20,ema_50,ema_200,atr_14,avg_volume_20d,week_52_high,week_52_low")
        .eq("symbol", sym)
        .gte("trade_date", str(fd))
        .lte("trade_date", str(td2))
        .order("trade_date", desc=False)
        .limit(limit)
        .execute()
    )

    if not q.data:
        raise HTTPException(status_code=404, detail=f"No candle data found for {sym}")

    candles = [
        {
            "time": str(row["trade_date"]),
            "open": float(row["open"]),
            "high": float(row["high"]),
            "low": float(row["low"]),
            "close": float(row["close"]),
            "volume": int(row["volume"]) if row["volume"] else 0,
        }
        for row in q.data
    ]

    latest_row = q.data[-1]
    prev_close = float(latest_row["prev_close"]) if latest_row.get("prev_close") else None
    close_val = float(latest_row["close"])
    avg_vol = float(latest_row["avg_volume_20d"]) if latest_row.get("avg_volume_20d") else None
    vol = int(latest_row["volume"]) if latest_row.get("volume") else 0

    latest = {
        "close": close_val,
        "pct_change": round((close_val - prev_close) / prev_close * 100, 2) if prev_close and prev_close > 0 else None,
        "volume": vol,
        "volume_ratio": round(vol / avg_vol, 2) if avg_vol and avg_vol > 0 else None,
        "rsi_14": float(latest_row["rsi_14"]) if latest_row.get("rsi_14") is not None else None,
        "ema_20": float(latest_row["ema_20"]) if latest_row.get("ema_20") is not None else None,
        "ema_50": float(latest_row["ema_50"]) if latest_row.get("ema_50") is not None else None,
        "ema_200": float(latest_row["ema_200"]) if latest_row.get("ema_200") is not None else None,
        "atr_14": float(latest_row["atr_14"]) if latest_row.get("atr_14") is not None else None,
        "week_52_high": float(latest_row["week_52_high"]) if latest_row.get("week_52_high") is not None else None,
        "week_52_low": float(latest_row["week_52_low"]) if latest_row.get("week_52_low") is not None else None,
        "open": float(latest_row["open"]),
        "high": float(latest_row["high"]),
        "low": float(latest_row["low"]),
        "prev_close": prev_close,
    }

    return {
        "symbol": sym,
        "company_name": meta.get("company_name"),
        "sector": meta.get("sector"),
        "timeframe": timeframe,
        "candles": candles,
        "latest": latest,
    }


# ── Indicators endpoint ───────────────────────────────────────────────────────

@router.get("/{symbol}/indicators")
async def get_indicators(
    symbol: str,
    timeframe: str = Query("D"),
    indicators: str = Query("ema20,ema50,ema200,rsi"),
    user_id: str = Depends(get_current_user_id),
):
    sym = symbol.upper()
    df = _fetch_ohlcv(sym, limit=500)
    if df.empty:
        raise HTTPException(status_code=404, detail=f"No data for {sym}")

    requested = [i.strip() for i in indicators.split(",") if i.strip()]
    result = _compute_indicators(df, requested)

    return {"symbol": sym, "indicators": result}


# ── Search endpoint ───────────────────────────────────────────────────────────

@router.get("/search")
async def search_symbols(
    q: str = Query(..., min_length=1),
    user_id: str = Depends(get_current_user_id),
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
    r = (
        sb.table("chart_layouts")
        .select("*")
        .eq("user_id", user_id)
        .eq("symbol", symbol.upper())
        .maybe_single()
        .execute()
    )
    return r.data or {"symbol": symbol.upper(), "timeframe": "D", "indicators": [], "drawing_tools": []}


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
