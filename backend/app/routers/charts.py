from __future__ import annotations

from datetime import date, timedelta
from typing import Any
from uuid import UUID, uuid4

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel

from app.middleware.auth import get_current_user_id
from app.services import indicators as ta
from app.services.market_data import MarketDataError, MarketIdentity, ProviderNotConfiguredError, get_market_data_provider
from app.services.market_context import eod_source_metadata, fallback_source_metadata, live_source_metadata
from app.services.plans import get_effective_user_plan
from app.services.rate_limit import client_rate_key, public_market_limiter
from app.services.supabase import get_admin_client

router = APIRouter(prefix="/api/v1/charts", tags=["charts"])

SUPPORTED_EOD_TIMEFRAMES = {"D", "W", "M"}
INTRADAY_UNAVAILABLE_DETAIL = "Intraday candle data is not available in beta mode."


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


class WorkspaceSave(BaseModel):
    timeframe: str = "D"
    indicators: list[Any] = []
    drawings: list[Any] = []


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_user_plan(user_id: str) -> str:
    sb = get_admin_client()
    return get_effective_user_plan(sb, user_id)


def _fetch_ohlcv(symbol: str, limit: int = 500) -> pd.DataFrame:
    """Fetch up to `limit` most recent daily bars for a symbol, oldest first."""
    sb = get_admin_client()
    rows = _fetch_candle_rows(sb, symbol.upper(), limit=limit, desc=True)
    if not rows:
        return pd.DataFrame()
    df = pd.DataFrame(rows)
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


def _resolve_chart_symbol(client, symbol: str) -> tuple[str, dict[str, Any], dict[str, Any] | None]:
    requested = symbol.upper()
    try:
        exact = (
            client.table("stock_universe")
            .select("symbol,company_name,sector,series")
            .eq("symbol", requested)
            .maybe_single()
            .execute()
        )
        if exact and exact.data:
            return requested, exact.data, None
    except Exception:
        return requested, {}, None

    try:
        alias = (
            client.table("symbol_aliases")
            .select("alias_symbol,current_symbol,alias_type,notes")
            .eq("alias_symbol", requested)
            .maybe_single()
            .execute()
        )
        if alias and alias.data:
            current = str(alias.data.get("current_symbol") or requested).upper()
            meta = (
                client.table("stock_universe")
                .select("symbol,company_name,sector,series")
                .eq("symbol", current)
                .maybe_single()
                .execute()
            )
            return current, (meta.data if meta else None) or {"symbol": current}, alias.data
    except Exception:
        pass

    return requested, {}, None


def _default_layout(symbol: str) -> dict[str, Any]:
    return {
        "symbol": symbol.upper(),
        "timeframe": "D",
        "indicators": [],
        "drawing_tools": [],
    }


def _normalize_eod_timeframe(timeframe: str) -> str:
    tf = (timeframe or "D").upper()
    if tf not in SUPPORTED_EOD_TIMEFRAMES:
        raise HTTPException(status_code=422, detail=INTRADAY_UNAVAILABLE_DETAIL)
    return tf


def _chart_coverage_metadata(
    candles: list[dict[str, Any]],
    *,
    requested_from: date | str | None,
    requested_to: date | str | None,
    requested_limit: int,
    timeframe: str,
    source_name: str,
    as_of: str | None,
) -> dict[str, Any]:
    first = candles[0]["time"] if candles else None
    last = candles[-1]["time"] if candles else None
    requested_from_s = str(requested_from) if requested_from else None
    requested_to_s = str(requested_to) if requested_to else None

    def _days_between(start: str | None, end: str | None) -> int | None:
        if not start or not end:
            return None
        try:
            return max(0, (date.fromisoformat(end) - date.fromisoformat(start)).days)
        except ValueError:
            return None

    requested_days = _days_between(requested_from_s, requested_to_s)
    covered_days = _days_between(first, last)
    coverage_pct = (
        round((covered_days / requested_days) * 100, 1)
        if requested_days and covered_days is not None
        else None
    )

    partial_reason: str | None = None
    if not candles:
        partial_reason = "no_candles"
    elif requested_from_s and first:
        try:
            requested_start = date.fromisoformat(requested_from_s)
            first_dt = date.fromisoformat(first)
            tolerance_days = 10 if timeframe == "D" else 35
            if first_dt > requested_start + timedelta(days=tolerance_days):
                partial_reason = "history_starts_after_requested_window"
        except ValueError:
            partial_reason = None
    if not partial_reason and requested_to_s and last:
        try:
            requested_end = date.fromisoformat(requested_to_s)
            last_dt = date.fromisoformat(last)
            if last_dt < requested_end - timedelta(days=10):
                partial_reason = "history_ends_before_requested_window"
        except ValueError:
            partial_reason = None
    if not partial_reason and requested_days and covered_days is not None and requested_days >= 45 and covered_days < requested_days * 0.75:
        partial_reason = "returned_range_shorter_than_requested"

    return {
        "requested_from": requested_from_s,
        "requested_to": requested_to_s,
        "available_from": first,
        "available_to": last,
        "returned_candles": len(candles),
        "requested_limit": requested_limit,
        "timeframe": timeframe,
        "requested_days": requested_days,
        "covered_days": covered_days,
        "coverage_pct": coverage_pct,
        "partial": partial_reason is not None,
        "partial_reason": partial_reason,
        "source_name": source_name,
        "as_of": as_of,
    }


def _default_workspace(symbol: str, timeframe: str = "D") -> dict[str, Any]:
    return {
        "symbol": symbol.upper(),
        "timeframe": timeframe,
        "indicators": [],
        "drawings": [],
    }


def _drawing_row_to_workspace(row: dict[str, Any]) -> dict[str, Any] | None:
    points = row.get("points") or []
    style = row.get("style") or {}
    tool = str(row.get("tool_type") or "").lower()
    color = style.get("color") or "#f4f7fb"
    width = int(style.get("width") or 2)
    if tool in {"horizontal", "horizontalray", "hray", "hline"}:
        price = None
        if points and isinstance(points[0], dict):
            price = points[0].get("price")
        if price is None:
            return None
        return {"id": row["id"], "kind": "hline", "price": price, "color": color, "width": width, "label": style.get("label")}
    if len(points) < 2:
        return None
    return {"id": row["id"], "kind": "trendline", "p1": points[0], "p2": points[1], "color": color, "width": width}


def _workspace_drawing_to_row(drawing: dict[str, Any], timeframe: str) -> dict[str, Any]:
    if "tool_type" in drawing:
        return {
            "id": drawing.get("id"),
            "user_id": "",
            "symbol": "",
            "timeframe": drawing.get("timeframe") or timeframe,
            "tool_type": drawing.get("tool_type") or "trendline",
            "points": drawing.get("points") or [],
            "style": drawing.get("style") or {},
            "created_at": drawing.get("created_at") or "",
        }

    drawing_id = drawing.get("id")
    if drawing.get("kind") == "hline":
        price = drawing.get("price")
        point = {"time": drawing.get("time") or "", "price": price}
        return {
            "id": drawing_id,
            "user_id": "",
            "symbol": "",
            "timeframe": timeframe,
            "tool_type": "horizontal",
            "points": [point, point],
            "style": {"color": drawing.get("color") or "#f4f7fb", "width": drawing.get("width") or 2, "label": drawing.get("label")},
            "created_at": "",
        }
    return {
        "id": drawing_id,
        "user_id": "",
        "symbol": "",
        "timeframe": timeframe,
        "tool_type": "trendline",
        "points": [drawing.get("p1"), drawing.get("p2")],
        "style": {"color": drawing.get("color") or "#f4f7fb", "width": drawing.get("width") or 2},
        "created_at": "",
    }


def _old_drawing_to_workspace(drawing_id: str, body: DrawingCreate | DrawingUpdate) -> dict[str, Any] | None:
    points = body.points or []
    style = body.style or {}
    if len(points) == 0:
        return None
    return {
        "id": drawing_id,
        "timeframe": body.timeframe,
        "tool_type": body.tool_type,
        "points": points,
        "style": style,
    }


def _get_workspace_row(symbol: str, timeframe: str, user_id: str) -> dict[str, Any]:
    sb = get_admin_client()
    try:
        r = (
            sb.table("chart_workspaces")
            .select("*")
            .eq("user_id", user_id)
            .eq("symbol", symbol.upper())
            .eq("timeframe", timeframe)
            .maybe_single()
            .execute()
        )
        return (r.data if r else None) or _default_workspace(symbol, timeframe)
    except Exception:
        return _default_workspace(symbol, timeframe)


def _save_workspace_row(symbol: str, timeframe: str, indicators: list[Any], drawings: list[Any], user_id: str) -> dict[str, Any]:
    sb = get_admin_client()
    payload = {
        "user_id": user_id,
        "symbol": symbol.upper(),
        "timeframe": timeframe,
        "indicators": indicators,
        "drawings": drawings,
    }
    r = sb.table("chart_workspaces").upsert(payload, on_conflict="user_id,symbol,timeframe").execute()
    if not r.data:
        raise HTTPException(status_code=500, detail="Failed to save workspace")
    return r.data[0]


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


def _fetch_candle_rows(
    client,
    symbol: str,
    *,
    from_date: str | None = None,
    to_date: str | None = None,
    limit: int = 3000,
    desc: bool = False,
) -> list[dict[str, Any]]:
    """Fetch candle rows with explicit pagination past PostgREST's page cap."""
    select_clause = (
        "trade_date,open,high,low,close,volume,prev_close,avg_volume_20d,"
        "rsi_14,ema_20,ema_50,ema_200,atr_14,week_52_high,week_52_low"
    )
    rows: list[dict[str, Any]] = []
    offset = 0
    page_size = min(1000, max(1, limit))
    while len(rows) < limit:
        query = (
            client.table("daily_ohlcv")
            .select(select_clause)
            .eq("symbol", symbol.upper())
        )
        if from_date:
            query = query.gte("trade_date", from_date)
        if to_date:
            query = query.lte("trade_date", to_date)
        chunk = (
            query.order("trade_date", desc=desc)
            .range(offset, offset + page_size - 1)
            .execute()
            .data or []
        )
        if not chunk:
            break
        rows.extend(chunk)
        if len(chunk) < page_size:
            break
        offset += page_size
    return rows[:limit]


def _fetch_adjusted_candle_rows(
    client,
    symbol: str,
    *,
    from_date: str | None = None,
    to_date: str | None = None,
    limit: int = 3000,
) -> list[dict[str, Any]]:
    """Fetch corporate-action adjusted candles through the database function."""
    result = (
        client.rpc(
            "get_adjusted_candles",
            {
                "p_symbol": symbol.upper(),
                "p_from_date": from_date,
                "p_to_date": to_date,
                "p_limit": limit,
                "p_adjust": True,
            },
        )
        .execute()
    )
    return result.data or []


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
    adjusted: bool = Query(False),
):
    requested_sym = symbol.upper()
    tf = _normalize_eod_timeframe(timeframe)
    try:
        sb = get_admin_client()
        sym, meta, alias_meta = _resolve_chart_symbol(sb, requested_sym)
    except Exception:
        metadata = fallback_source_metadata("Candle metadata is temporarily unavailable.")
        return {
            "symbol": requested_sym,
            "requested_symbol": requested_sym,
            "company_name": None,
            "sector": None,
            "timeframe": tf,
            "candles": [],
            "latest": None,
            "mode": "unavailable",
            "source_metadata": metadata,
            "coverage": _chart_coverage_metadata(
                [],
                requested_from=from_date,
                requested_to=to_date,
                requested_limit=limit,
                timeframe=tf,
                source_name=metadata["source_name"],
                as_of=metadata.get("as_of"),
            ),
        }

    # For W/M we need more raw daily bars to aggregate into enough candles
    raw_limit = limit if tf == "D" else (limit * 7 if tf == "W" else limit * 31)
    raw_limit = min(raw_limit, 3000)

    td = date.today()
    fd = date.fromisoformat(from_date) if from_date else (td - timedelta(days=365 * 12))
    td2 = date.fromisoformat(to_date) if to_date else td

    try:
        if adjusted:
            rows = _fetch_adjusted_candle_rows(sb, sym, from_date=str(fd), to_date=str(td2), limit=raw_limit)
        else:
            rows = _fetch_candle_rows(sb, sym, from_date=str(fd), to_date=str(td2), limit=raw_limit, desc=True)
    except Exception:
        metadata = fallback_source_metadata("Candle query is temporarily unavailable.", as_of=None)
        return {
            "symbol": sym,
            "requested_symbol": requested_sym,
            "company_name": meta.get("company_name"),
            "sector": meta.get("sector"),
            "timeframe": tf,
            "candles": [],
            "latest": None,
            "mode": "unavailable",
            "source_metadata": metadata,
            "coverage": _chart_coverage_metadata(
                [],
                requested_from=fd,
                requested_to=td2,
                requested_limit=limit,
                timeframe=tf,
                source_name=metadata["source_name"],
                as_of=metadata.get("as_of"),
            ),
            "adjusted": adjusted,
        }

    if not rows:
        raise HTTPException(status_code=404, detail=f"No candle data found for {sym}")

    # Build daily df then aggregate if needed
    daily_df = pd.DataFrame(rows)
    daily_df["trade_date"] = pd.to_datetime(daily_df["trade_date"]).dt.date
    for col in ["open", "high", "low", "close", "volume"]:
        daily_df[col] = pd.to_numeric(daily_df[col], errors="coerce")
    daily_df = daily_df.sort_values("trade_date").reset_index(drop=True)

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
        # Daily — return the latest fetched window oldest-to-newest for charting.
        def _nullable_float(row: dict[str, Any], col: str) -> float | None:
            value = row.get(col)
            return float(value) if value is not None and pd.notna(value) else None

        candles = [
            {
                "time": str(row["trade_date"]),
                "open":   float(row["open"]),
                "high":   float(row["high"]),
                "low":    float(row["low"]),
                "close":  float(row["close"]),
                "volume": int(row["volume"]) if row.get("volume") is not None and pd.notna(row["volume"]) else 0,
                "ema_20":  _nullable_float(row, "ema_20"),
                "ema_50":  _nullable_float(row, "ema_50"),
                "ema_200": _nullable_float(row, "ema_200"),
                **({"adjustment_factor": _nullable_float(row, "adjustment_factor")} if _nullable_float(row, "adjustment_factor") is not None else {}),
            }
            for row in daily_df.to_dict("records")
        ]
        latest_row = daily_df.iloc[-1].to_dict()
        prev_close = _nullable_float(latest_row, "prev_close")
        close_val  = float(latest_row["close"])
        avg_vol    = _nullable_float(latest_row, "avg_volume_20d")
        vol        = int(latest_row["volume"]) if latest_row.get("volume") is not None and pd.notna(latest_row["volume"]) else 0
        def _f(col): return _nullable_float(latest_row, col)  # type: ignore[misc]
        latest = {
            "close": close_val,
            "pct_change": round((close_val - prev_close) / prev_close * 100, 2) if prev_close and prev_close > 0 else None,
            "volume": vol, "volume_ratio": round(vol / avg_vol, 2) if avg_vol else None,
            "rsi_14": _f("rsi_14"), "ema_20": _f("ema_20"), "ema_50": _f("ema_50"), "ema_200": _f("ema_200"),
            "atr_14": _f("atr_14"), "week_52_high": _f("week_52_high"), "week_52_low": _f("week_52_low"),
            "open": float(latest_row["open"]), "high": float(latest_row["high"]),
            "low": float(latest_row["low"]), "prev_close": prev_close,
        }

    latest_time = candles[-1]["time"] if candles else None
    metadata = eod_source_metadata(
        as_of=latest_time,
        status="healthy" if candles else "unknown",
        symbols_count=1 if candles else 0,
    )
    coverage = _chart_coverage_metadata(
        candles,
        requested_from=fd,
        requested_to=td2,
        requested_limit=limit,
        timeframe=tf,
        source_name=metadata["source_name"],
        as_of=latest_time,
    )
    return {
        "symbol": sym,
        "requested_symbol": requested_sym,
        "resolved_from_alias": bool(alias_meta),
        "alias": alias_meta,
        "company_name": meta.get("company_name"),
        "sector": meta.get("sector"),
        "timeframe": tf,
        "candles": candles,
        "latest": latest,
        "mode": metadata["mode"],
        "source": metadata["source_name"],
        "source_metadata": metadata,
        "coverage": coverage,
        "adjusted": adjusted,
        "adjustment_source": "corporate_actions" if adjusted else None,
    }


# ── Live candles via configured market data provider ─────────────────────────

@router.get("/{symbol}/candles-live")
async def get_candles_live(
    symbol: str,
    request: Request,
    timeframe: str = Query("D"),
    limit: int = Query(500, ge=1, le=1000),
):
    """OHLCV from the configured market data provider."""
    key = client_rate_key(request, "candles-live")
    if not public_market_limiter.is_allowed(key):
        retry_after = public_market_limiter.retry_after(key)
        raise HTTPException(
            status_code=429,
            detail=f"Too many live market data requests - try again in {retry_after} seconds.",
            headers={"Retry-After": str(retry_after)},
        )

    sym = symbol.upper()
    tf = _normalize_eod_timeframe(timeframe)
    try:
        data = get_market_data_provider().live_candles(sym, tf, limit, _lookup_market_identity(sym))
        data["mode"] = "live"
        candles = data.get("candles") or []
        latest_time = candles[-1].get("time") if candles else None
        data["source_metadata"] = live_source_metadata(provider=data.get("source") or "configured provider", as_of=latest_time)
        data["coverage"] = _chart_coverage_metadata(
            candles,
            requested_from=None,
            requested_to=None,
            requested_limit=limit,
            timeframe=tf,
            source_name=data["source_metadata"]["source_name"],
            as_of=latest_time,
        )
        return data
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
    tf = _normalize_eod_timeframe(timeframe)
    # Fetch more daily rows for W/M so aggregation has enough history
    raw_limit = 500 if tf == "D" else (500 * 7 if tf == "W" else 500 * 31)
    df = _fetch_ohlcv(sym, limit=min(raw_limit, 3000))
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

@router.get("/{symbol}/workspace")
async def get_workspace(
    symbol: str,
    timeframe: str = Query("D"),
    user_id: str = Depends(get_current_user_id),
):
    row = _get_workspace_row(symbol, timeframe, user_id)
    return {
        "symbol": symbol.upper(),
        "timeframe": timeframe,
        "indicators": row.get("indicators") or [],
        "drawings": row.get("drawings") or [],
    }


@router.post("/{symbol}/workspace")
async def save_workspace(
    symbol: str,
    body: WorkspaceSave,
    user_id: str = Depends(get_current_user_id),
):
    row = _save_workspace_row(symbol, body.timeframe, body.indicators, body.drawings, user_id)
    return {
        "symbol": symbol.upper(),
        "timeframe": body.timeframe,
        "indicators": row.get("indicators") or [],
        "drawings": row.get("drawings") or [],
    }


@router.get("/{symbol}/drawings")
async def get_drawings(
    symbol: str,
    timeframe: str = Query("D"),
    user_id: str = Depends(get_current_user_id),
):
    row = _get_workspace_row(symbol, timeframe, user_id)
    return [
        {**_workspace_drawing_to_row(item, timeframe), "user_id": user_id, "symbol": symbol.upper()}
        for item in row.get("drawings") or []
    ]


@router.post("/{symbol}/drawings", status_code=status.HTTP_201_CREATED)
async def create_drawing(
    symbol: str,
    body: DrawingCreate,
    user_id: str = Depends(get_current_user_id),
):
    drawing_id = str(uuid4())
    next_drawing = _old_drawing_to_workspace(drawing_id, body)
    if next_drawing is None:
        raise HTTPException(status_code=400, detail="Invalid drawing")
    row = _get_workspace_row(symbol, body.timeframe, user_id)
    drawings = [*(row.get("drawings") or []), next_drawing]
    _save_workspace_row(symbol, body.timeframe, row.get("indicators") or [], drawings, user_id)
    return {**_workspace_drawing_to_row(next_drawing, body.timeframe), "user_id": user_id, "symbol": symbol.upper()}


@router.patch("/{symbol}/drawings/{drawing_id}")
async def update_drawing(
    symbol: str,
    drawing_id: str,
    body: DrawingUpdate,
    user_id: str = Depends(get_current_user_id),
):
    row = _get_workspace_row(symbol, body.timeframe, user_id)
    drawings = row.get("drawings") or []
    if not any(isinstance(item, dict) and str(item.get("id")) == drawing_id for item in drawings):
        raise HTTPException(status_code=404, detail="Drawing not found")
    next_drawing = _old_drawing_to_workspace(drawing_id, body)
    if next_drawing is None:
        raise HTTPException(status_code=400, detail="Invalid drawing")
    next_drawings = [
        next_drawing if isinstance(item, dict) and str(item.get("id")) == drawing_id else item
        for item in drawings
    ]
    _save_workspace_row(symbol, body.timeframe, row.get("indicators") or [], next_drawings, user_id)
    return {**_workspace_drawing_to_row(next_drawing, body.timeframe), "user_id": user_id, "symbol": symbol.upper()}


@router.delete("/{symbol}/drawings/{drawing_id}")
async def delete_drawing(
    symbol: str,
    drawing_id: str,
    user_id: str = Depends(get_current_user_id),
):
    sb = get_admin_client()
    rows = (
        sb.table("chart_workspaces")
        .select("*")
        .eq("user_id", user_id)
        .eq("symbol", symbol.upper())
        .execute()
    )
    changed = False
    for row in rows.data or []:
        drawings = row.get("drawings") or []
        next_drawings = [item for item in drawings if not (isinstance(item, dict) and str(item.get("id")) == drawing_id)]
        if len(next_drawings) != len(drawings):
            changed = True
            _save_workspace_row(symbol, row.get("timeframe") or "D", row.get("indicators") or [], next_drawings, user_id)
    if not changed:
        raise HTTPException(status_code=404, detail="Drawing not found")
    return {"message": "Deleted"}


# ── Layout endpoints ──────────────────────────────────────────────────────────

@router.get("/{symbol}/layout")
async def get_layout(
    symbol: str,
    user_id: str = Depends(get_current_user_id),
):
    row = _get_workspace_row(symbol, "D", user_id)
    return {
        "symbol": symbol.upper(),
        "timeframe": row.get("timeframe") or "D",
        "indicators": row.get("indicators") or [],
        "drawing_tools": [],
    }


@router.post("/{symbol}/layout")
async def save_layout(
    symbol: str,
    body: LayoutSave,
    user_id: str = Depends(get_current_user_id),
):
    row = _get_workspace_row(symbol, body.timeframe, user_id)
    saved = _save_workspace_row(symbol, body.timeframe, body.indicators, row.get("drawings") or [], user_id)
    return {
        "symbol": symbol.upper(),
        "timeframe": body.timeframe,
        "indicators": saved.get("indicators") or [],
        "drawing_tools": body.drawing_tools,
    }
