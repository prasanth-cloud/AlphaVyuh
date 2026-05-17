from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
import yfinance as yf
from pydantic import BaseModel

from app.middleware.auth import get_current_user_id
from app.services.plans import get_effective_user_plan
from app.services.supabase import get_admin_client
from app.services.workflow_state import sync_workflow_state

FREE_JOURNAL_MONTHS = 3


def _get_user_plan(user_id: str) -> str:
    sb = get_admin_client()
    return get_effective_user_plan(sb, user_id)

router = APIRouter(prefix="/api/v1/journal", tags=["journal"])


# ── Models ────────────────────────────────────────────────────────────────────

class JournalEntry(BaseModel):
    symbol: str
    trade_type: str                     # 'long' or 'short'
    entry_date: str                     # YYYY-MM-DD
    entry_price: float
    quantity: int
    setup_type: Optional[str] = None
    stop_loss: Optional[float] = None
    target_price: Optional[float] = None
    entry_reason: Optional[str] = None


class JournalUpdate(BaseModel):
    exit_date: Optional[str] = None
    exit_price: Optional[float] = None
    exit_reason: Optional[str] = None
    mistakes: Optional[str] = None
    lessons: Optional[str] = None
    stop_loss: Optional[float] = None
    target_price: Optional[float] = None
    setup_type: Optional[str] = None
    entry_reason: Optional[str] = None
    status: Optional[str] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _compute_pnl(entry_price: float, exit_price: float, quantity: int, trade_type: str):
    if trade_type == "long":
        pnl = (exit_price - entry_price) * quantity
    else:
        pnl = (entry_price - exit_price) * quantity
    pnl_pct = (pnl / (entry_price * quantity)) * 100
    return round(pnl, 2), round(pnl_pct, 4)


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/analytics")
async def get_analytics(user_id: str = Depends(get_current_user_id)):
    sb = get_admin_client()
    result = (
        sb.table("trade_journal")
        .select("symbol,trade_type,setup_type,entry_date,exit_date,pnl,pnl_pct,status,holding_days")
        .eq("user_id", user_id)
        .eq("status", "closed")
        .order("exit_date", desc=False)
        .execute()
    )
    entries = result.data or []

    # ── Equity curve ─────────────────────────────────────────────────────────
    equity_curve = []
    cumulative = 0.0
    for e in entries:
        if e.get("pnl") is None or not e.get("exit_date"):
            continue
        cumulative += float(e["pnl"])
        equity_curve.append({"date": e["exit_date"], "cumulative_pnl": round(cumulative, 2)})

    # ── Per-setup breakdown ───────────────────────────────────────────────────
    setup_map: dict = {}
    for e in entries:
        s = e.get("setup_type") or "Untagged"
        pnl = float(e["pnl"]) if e.get("pnl") is not None else 0.0
        if s not in setup_map:
            setup_map[s] = {"trades": 0, "wins": 0, "total_pnl": 0.0}
        setup_map[s]["trades"] += 1
        if pnl > 0:
            setup_map[s]["wins"] += 1
        setup_map[s]["total_pnl"] += pnl

    setup_breakdown = [
        {
            "setup": k,
            "trades": v["trades"],
            "wins": v["wins"],
            "win_rate": round(v["wins"] / v["trades"] * 100, 1) if v["trades"] else 0,
            "total_pnl": round(v["total_pnl"], 2),
            "avg_pnl": round(v["total_pnl"] / v["trades"], 2) if v["trades"] else 0,
        }
        for k, v in setup_map.items()
    ]
    setup_breakdown.sort(key=lambda x: x["total_pnl"], reverse=True)

    # ── Monthly P&L ───────────────────────────────────────────────────────────
    month_map: dict = {}
    for e in entries:
        if not e.get("exit_date") or e.get("pnl") is None:
            continue
        month = e["exit_date"][:7]
        month_map[month] = round(month_map.get(month, 0.0) + float(e["pnl"]), 2)
    monthly_pnl = [{"month": k, "pnl": v} for k, v in sorted(month_map.items())]

    # ── Drawdown analysis ─────────────────────────────────────────────────────
    drawdown_curve = []
    max_dd = 0.0
    peak = 0.0
    longest_dd_days = 0
    current_dd_start: str | None = None

    for pt in equity_curve:
        val = pt["cumulative_pnl"]
        if val > peak:
            peak = val
            current_dd_start = None
        dd = peak - val
        dd_pct = (dd / abs(peak) * 100) if peak != 0 else 0.0
        if dd > 0 and current_dd_start is None:
            current_dd_start = pt["date"]
        if dd > max_dd:
            max_dd = dd
        drawdown_curve.append({
            "date": pt["date"],
            "drawdown": -round(dd, 2),
            "drawdown_pct": -round(dd_pct, 2),
        })

    if len(equity_curve) >= 2:
        from datetime import date as date_
        in_dd = False
        dd_start_dt = None
        for pt in equity_curve:
            val = pt["cumulative_pnl"]
            if val < peak:
                if not in_dd:
                    in_dd = True
                    try:
                        dd_start_dt = date_.fromisoformat(pt["date"])
                    except Exception:
                        dd_start_dt = None
            else:
                if in_dd and dd_start_dt:
                    try:
                        end_dt = date_.fromisoformat(pt["date"])
                        span = (end_dt - dd_start_dt).days
                        longest_dd_days = max(longest_dd_days, span)
                    except Exception:
                        pass
                in_dd = False
                dd_start_dt = None

    total_pnl = equity_curve[-1]["cumulative_pnl"] if equity_curve else 0.0
    recovery_factor = round(total_pnl / max_dd, 2) if max_dd > 0 else None
    profit_factor_num = sum(float(e["pnl"]) for e in entries if e.get("pnl") and float(e["pnl"]) > 0)
    profit_factor_den = abs(sum(float(e["pnl"]) for e in entries if e.get("pnl") and float(e["pnl"]) < 0))
    profit_factor = round(profit_factor_num / profit_factor_den, 2) if profit_factor_den > 0 else None

    return {
        "equity_curve":    equity_curve,
        "setup_breakdown": setup_breakdown,
        "monthly_pnl":     monthly_pnl,
        "drawdown_curve":  drawdown_curve,
        "max_drawdown":    round(max_dd, 2),
        "longest_dd_days": longest_dd_days,
        "recovery_factor": recovery_factor,
        "profit_factor":   profit_factor,
    }


@router.get("/stats")
async def get_stats(user_id: str = Depends(get_current_user_id)):
    sb = get_admin_client()
    result = (
        sb.table("trade_journal")
        .select("pnl,pnl_pct,status,trade_type,setup_type,holding_days")
        .eq("user_id", user_id)
        .eq("status", "closed")
        .execute()
    )
    entries = result.data or []

    open_r = (
        sb.table("trade_journal")
        .select("id", count="exact")
        .eq("user_id", user_id)
        .eq("status", "open")
        .execute()
    )
    open_count = open_r.count or 0

    if not entries:
        return {
            "total_trades": 0, "open_trades": open_count, "total_pnl": 0,
            "win_rate": 0, "avg_pnl": 0, "avg_win": 0, "avg_loss": 0,
            "best_trade": 0, "worst_trade": 0, "avg_holding_days": 0,
        }

    pnls = [float(e["pnl"]) for e in entries if e.get("pnl") is not None]
    wins = [p for p in pnls if p > 0]
    losses = [p for p in pnls if p < 0]
    holding = [e["holding_days"] for e in entries if e.get("holding_days") is not None]

    return {
        "total_trades": len(entries),
        "open_trades": open_count,
        "total_pnl": round(sum(pnls), 2),
        "win_rate": round(len(wins) / len(pnls) * 100, 1) if pnls else 0,
        "avg_pnl": round(sum(pnls) / len(pnls), 2) if pnls else 0,
        "avg_win": round(sum(wins) / len(wins), 2) if wins else 0,
        "avg_loss": round(sum(losses) / len(losses), 2) if losses else 0,
        "best_trade": round(max(pnls), 2) if pnls else 0,
        "worst_trade": round(min(pnls), 2) if pnls else 0,
        "avg_holding_days": round(sum(holding) / len(holding), 1) if holding else 0,
    }


@router.get("")
async def list_entries(
    limit: int = Query(default=50, le=500),
    offset: int = 0,
    status: Optional[str] = None,
    symbol: Optional[str] = None,
    user_id: str = Depends(get_current_user_id),
):
    sb = get_admin_client()
    plan = _get_user_plan(user_id)

    q = (
        sb.table("trade_journal")
        .select("*")
        .eq("user_id", user_id)
        .order("entry_date", desc=True)
        .range(offset, offset + limit - 1)
    )
    if plan == "free":
        cutoff = (date.today() - timedelta(days=FREE_JOURNAL_MONTHS * 30)).isoformat()
        q = q.gte("entry_date", cutoff)
    if status:
        q = q.eq("status", status)
    if symbol:
        q = q.eq("symbol", symbol.upper())

    result = q.execute()
    return {
        "entries": result.data or [],
        "total": len(result.data or []),
        "plan": plan,
        "history_months": FREE_JOURNAL_MONTHS if plan == "free" else None,
    }


@router.post("")
async def create_entry(
    body: JournalEntry,
    user_id: str = Depends(get_current_user_id),
):
    sb = get_admin_client()

    stock = (
        sb.table("stock_universe")
        .select("company_name")
        .eq("symbol", body.symbol.upper())
        .execute()
    )
    company_name = stock.data[0]["company_name"] if stock.data else body.symbol.upper()

    risk_reward = None
    if body.stop_loss and body.target_price and body.entry_price:
        if body.trade_type == "long":
            risk = body.entry_price - body.stop_loss
            reward = body.target_price - body.entry_price
        else:
            risk = body.stop_loss - body.entry_price
            reward = body.entry_price - body.target_price
        if risk > 0:
            risk_reward = round(reward / risk, 2)

    row = {
        "user_id": user_id,
        "symbol": body.symbol.upper(),
        "company_name": company_name,
        "trade_type": body.trade_type,
        "entry_date": body.entry_date,
        "entry_price": body.entry_price,
        "quantity": body.quantity,
        "setup_type": body.setup_type,
        "stop_loss": body.stop_loss,
        "target_price": body.target_price,
        "risk_reward": risk_reward,
        "entry_reason": body.entry_reason,
        "status": "open",
    }
    result = sb.table("trade_journal").insert(row).execute()
    created = result.data[0]
    sync_workflow_state(sb, user_id, row["symbol"], {
        "source": "journal",
        "lifecycle": "open",
        "entry": body.entry_price,
        "stop": body.stop_loss,
        "target": body.target_price,
        "position_size": body.quantity,
        "setup_type": body.setup_type,
        "notes": body.entry_reason,
        "journal_id": created["id"],
    })
    return created


@router.patch("/{entry_id}")
async def update_entry(
    entry_id: str,
    body: JournalUpdate,
    user_id: str = Depends(get_current_user_id),
):
    sb = get_admin_client()

    existing = (
        sb.table("trade_journal")
        .select("*")
        .eq("id", entry_id)
        .eq("user_id", user_id)
        .maybe_single()
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Entry not found")

    entry = existing.data
    update_data = body.model_dump(exclude_unset=True)

    closing_now = bool(body.exit_price and body.exit_date)

    if closing_now:
        pnl, pnl_pct = _compute_pnl(
            float(entry["entry_price"]),
            body.exit_price,  # type: ignore[arg-type]
            int(entry["quantity"]),
            entry["trade_type"],
        )
        update_data["pnl"] = pnl
        update_data["pnl_pct"] = pnl_pct
        update_data["status"] = "closed"

        entry_d = date.fromisoformat(entry["entry_date"])
        exit_d = date.fromisoformat(body.exit_date)  # type: ignore[arg-type]
        update_data["holding_days"] = (exit_d - entry_d).days

    result = sb.table("trade_journal").update(update_data).eq("id", entry_id).execute()
    updated_entry = result.data[0]

    # Generate a local trade lesson when a trade is closed.
    if closing_now:
        try:
            from app.routers.broker import _trigger_ai_analysis
            _trigger_ai_analysis(sb, updated_entry)
        except Exception:
            pass  # non-blocking
        sync_workflow_state(sb, user_id, str(updated_entry["symbol"]), {
            "source": "journal",
            "lifecycle": "closed",
            "journal_id": entry_id,
        })

    return updated_entry


@router.post("/{entry_id}/lessons")
async def generate_lessons(
    entry_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """Generate a local lesson for a specific closed trade on demand."""
    sb = get_admin_client()
    r = sb.table("trade_journal").select("*").eq("id", entry_id).eq("user_id", user_id).maybe_single().execute()
    if not r.data:
        raise HTTPException(status_code=404, detail="Entry not found")
    if r.data["status"] != "closed":
        raise HTTPException(status_code=400, detail="Trade must be closed first")

    try:
        from app.routers.broker import _trigger_ai_analysis
        _trigger_ai_analysis(sb, r.data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Trade lesson failed: {e}")

    updated = sb.table("trade_journal").select("*").eq("id", entry_id).eq("user_id", user_id).maybe_single().execute()
    from app.routers.ai import _DISCLAIMER
    result = dict(updated.data or {})
    result["disclaimer"] = _DISCLAIMER
    return result


@router.delete("/{entry_id}")
async def delete_entry(
    entry_id: str,
    user_id: str = Depends(get_current_user_id),
):
    sb = get_admin_client()
    sb.table("trade_journal").delete().eq("id", entry_id).eq("user_id", user_id).execute()
    return {"message": "Deleted"}


@router.get("/portfolio")
async def get_portfolio(user_id: str = Depends(get_current_user_id)):
    """
    Returns all open positions with current price from daily_ohlcv,
    unrealised P&L, and sector breakdown.
    """
    sb = get_admin_client()
    result = (
        sb.table("trade_journal")
        .select("id,symbol,company_name,trade_type,entry_date,entry_price,quantity,stop_loss,target_price,setup_type")
        .eq("user_id", user_id)
        .eq("status", "open")
        .order("entry_date", desc=False)
        .execute()
    )
    positions = result.data or []
    if not positions:
        return {"positions": [], "summary": {"total_invested": 0, "total_current": 0, "total_pnl": 0, "total_pnl_pct": 0}, "sectors": []}

    # Fetch fallback prices from the latest stored EOD row
    symbols = list({p["symbol"] for p in positions})
    price_rows = (
        sb.table("daily_ohlcv")
        .select("symbol,close,pct_change")
        .in_("symbol", symbols)
        .order("trade_date", desc=True)
        .execute()
    )
    latest_prices: dict[str, dict] = {}
    for row in (price_rows.data or []):
        sym = row["symbol"]
        if sym not in latest_prices:
            latest_prices[sym] = {"close": float(row["close"]), "pct_change": row.get("pct_change"), "source": "daily_ohlcv"}

    # Prefer live Yahoo Finance quotes when available
    market_rows = (
        sb.table("stock_universe")
        .select("symbol,market")
        .in_("symbol", symbols)
        .execute()
    )
    market_map: dict[str, str] = {r["symbol"]: (r.get("market") or "NSE") for r in (market_rows.data or [])}

    def _yf_symbol(sym: str, market: str) -> str:
        return sym if market in ("NASDAQ", "NYSE") else f"{sym}.NS"

    for sym in symbols:
        try:
            ticker = yf.Ticker(_yf_symbol(sym, market_map.get(sym, "NSE")))
            hist = ticker.history(period="2d", interval="1d")
            if hist.empty:
                continue
            latest = hist.iloc[-1]
            prev = hist.iloc[-2] if len(hist) >= 2 else hist.iloc[-1]
            close = float(latest["Close"])
            prev_close = float(prev["Close"])
            pct_change = round((close - prev_close) / prev_close * 100, 2) if prev_close else None
            latest_prices[sym] = {"close": close, "pct_change": pct_change, "source": "yahoo_finance"}
        except Exception:
            continue

    # Fetch sector info
    sector_rows = (
        sb.table("stock_universe")
        .select("symbol,sector")
        .in_("symbol", symbols)
        .execute()
    )
    sectors_map: dict[str, str | None] = {r["symbol"]: r.get("sector") for r in (sector_rows.data or [])}

    enriched = []
    total_invested = 0.0
    total_current  = 0.0
    sector_pnl: dict[str, float] = {}

    for p in positions:
        sym   = p["symbol"]
        qty   = int(p["quantity"] or 0)
        entry = float(p["entry_price"] or 0)
        cur   = latest_prices.get(sym, {}).get("close", entry)
        day_chg = latest_prices.get(sym, {}).get("pct_change")

        if p["trade_type"] == "long":
            pnl = (cur - entry) * qty
        else:
            pnl = (entry - cur) * qty
        pnl_pct = (pnl / (entry * qty) * 100) if entry and qty else 0

        invested = entry * qty
        total_invested += invested
        total_current  += cur * qty

        sector = sectors_map.get(sym)
        if sector:
            sector_pnl[sector] = sector_pnl.get(sector, 0) + pnl

        enriched.append({
            **p,
            "current_price": round(cur, 2),
            "day_change_pct": round(float(day_chg), 2) if day_chg is not None else None,
            "unrealised_pnl": round(pnl, 2),
            "unrealised_pnl_pct": round(pnl_pct, 2),
            "invested": round(invested, 2),
            "sector": sector,
        })

    total_pnl = total_current - total_invested
    total_pnl_pct = (total_pnl / total_invested * 100) if total_invested else 0

    sectors_list = [
        {"sector": s or "Unknown", "pnl": round(v, 2)}
        for s, v in sorted(sector_pnl.items(), key=lambda x: x[1], reverse=True)
    ]

    return {
        "positions": enriched,
        "summary": {
            "total_invested": round(total_invested, 2),
            "total_current":  round(total_current, 2),
            "total_pnl":      round(total_pnl, 2),
            "total_pnl_pct":  round(total_pnl_pct, 2),
            "open_count":     len(enriched),
        },
        "sectors": sectors_list,
    }
