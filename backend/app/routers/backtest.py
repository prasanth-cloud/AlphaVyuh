"""
Backtest router — runs a ScanFilters against historical daily_ohlcv data
to show how many stocks would have matched each day over the past N days.
Pro/Elite plan only.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.middleware.auth import get_current_user_id
from app.routers.scanner import (
    SCANNER_BASE_SELECT,
    SCANNER_INTELLIGENCE_SELECT,
    ScanFilters,
    _apply_filters,
    _get_user_plan,
    _m3a_columns_ready,
    _push_db_prefilters,
)
from app.services.supabase import get_admin_client  # SERVICE_ROLE: queries scoped by JWT-validated user_id

router = APIRouter(prefix="/api/v1/backtest", tags=["backtest"])

MAX_DAYS = 90
DATE_LOOKBACK_PAGE_SIZE = 1000


class BacktestRequest(BaseModel):
    filters: ScanFilters = ScanFilters()
    days: int = 30   # how many trading days to backtest (max 90)


def _ordered_unique_dates(rows: list[dict]) -> list[str]:
    dates: list[str] = []
    seen: set[str] = set()
    for row in rows:
        raw_trade_date = row.get("trade_date")
        trade_date = str(raw_trade_date) if raw_trade_date else ""
        if trade_date and trade_date not in seen:
            dates.append(trade_date)
            seen.add(trade_date)
    return dates


def _recent_trade_dates_from_daily_rows(client, days: int) -> list[str]:
    dates: list[str] = []
    seen: set[str] = set()
    offset = 0

    while len(dates) < days:
        rows = (
            client.table("daily_ohlcv")
            .select("trade_date")
            .order("trade_date", desc=True)
            .range(offset, offset + DATE_LOOKBACK_PAGE_SIZE - 1)
            .execute()
            .data or []
        )
        if not rows:
            break

        for trade_date in _ordered_unique_dates(rows):
            if trade_date not in seen:
                dates.append(trade_date)
                seen.add(trade_date)
                if len(dates) >= days:
                    break

        if len(rows) < DATE_LOOKBACK_PAGE_SIZE:
            break
        offset += DATE_LOOKBACK_PAGE_SIZE

    return sorted(dates)


def _recent_trade_dates(client, days: int) -> list[str]:
    try:
        rows = (
            client.table("bhavcopy_ingestion_log")
            .select("trade_date")
            .in_("status", ["success", "already_done"])
            .order("trade_date", desc=True)
            .limit(days)
            .execute()
            .data or []
        )
        dates = _ordered_unique_dates(rows)
        if len(dates) >= days:
            return sorted(dates[:days])
    except Exception:
        dates = []

    fallback_dates = _recent_trade_dates_from_daily_rows(client, days)
    return sorted(set(dates + fallback_dates))[-days:]


def _daily_rows_for_backtest(client, trade_date: str, filters: ScanFilters) -> list[dict]:
    query = (
        client.table("daily_ohlcv")
        .select(SCANNER_INTELLIGENCE_SELECT)
        .eq("trade_date", trade_date)
    )
    m3a_ready = _m3a_columns_ready(client, trade_date)
    query = _push_db_prefilters(query, filters, m3a_ready=m3a_ready)
    try:
        return query.limit(3000).execute().data or []
    except Exception:
        return (
            client.table("daily_ohlcv")
            .select(SCANNER_BASE_SELECT)
            .eq("trade_date", trade_date)
            .limit(3000)
            .execute()
            .data or []
        )


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

    dates = _recent_trade_dates(client, days)

    if not dates:
        return {
            "days_analysed": 0,
            "avg_matches": 0,
            "max_matches": 0,
            "min_matches": 0,
            "results": [],
        }

    results = []
    for trade_date in dates:
        rows = _daily_rows_for_backtest(client, trade_date, body.filters)
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
