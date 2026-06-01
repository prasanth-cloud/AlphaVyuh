"""
Backtest router — runs a ScanFilters against historical daily_ohlcv data
to show how many stocks would have matched each day over the past N days.
Pro/Elite plan only.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.middleware.auth import get_current_user_id
from app.routers.scanner import ScanFilters, _apply_filters, _get_user_plan
from app.services.supabase import get_admin_client

router = APIRouter(prefix="/api/v1/backtest", tags=["backtest"])

MAX_DAYS = 90


class BacktestRequest(BaseModel):
    filters: ScanFilters = ScanFilters()
    days: int = 30   # how many trading days to backtest (max 90)


@router.post("/run")
async def run_backtest(
    body: BacktestRequest,
    user_id: str = Depends(get_current_user_id),
):
    plan = _get_user_plan(user_id)
    if plan == "free":
        raise HTTPException(403, "Backtest requires Pro or Elite plan")

    days = min(max(1, body.days), MAX_DAYS)
    client = get_admin_client()

    # Get last N unique trade dates
    dr = (
        client.table("daily_ohlcv")
        .select("trade_date")
        .order("trade_date", desc=True)
        .limit(days)
        .execute()
    )
    dates = sorted(set(r["trade_date"] for r in (dr.data or [])))

    if not dates:
        return {"dates": [], "match_counts": [], "avg_matches": 0}

    results = []
    for trade_date in dates:
        rows = (
            client.table("daily_ohlcv")
            .select(
                "symbol,open,high,low,close,prev_close,volume,avg_volume_20d,"
                "turnover,rsi_14,ema_20,ema_50,ema_200,week_52_high,week_52_low,atr_14,"
                "stock_universe!daily_ohlcv_symbol_fkey!inner(symbol,company_name,series,sector,is_active,market,currency)"
            )
            .eq("trade_date", trade_date)
            .limit(3000)
            .execute()
            .data or []
        )
        matched = _apply_filters(rows, body.filters, score_results=False)
        results.append({
            "date": trade_date,
            "match_count": len(matched),
            "top_symbols": [r["symbol"] for r in matched[:5]],
        })

    match_counts = [r["match_count"] for r in results]
    avg = round(sum(match_counts) / len(match_counts), 1) if match_counts else 0
    max_count = max(match_counts) if match_counts else 0
    min_count = min(match_counts) if match_counts else 0

    return {
        "days_analysed": len(results),
        "avg_matches": avg,
        "max_matches": max_count,
        "min_matches": min_count,
        "results": results,
    }
