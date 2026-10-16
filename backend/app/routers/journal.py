from datetime import date, datetime, timedelta
from math import isfinite
from typing import Any, Literal, Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, status
import yfinance as yf
from pydantic import BaseModel

from app.middleware.auth import get_current_user_id
from app.services.plans import get_effective_user_plan
from app.services.supabase import get_admin_client  # SERVICE_ROLE: queries scoped by JWT-validated user_id
from app.services.workflow_state import sync_workflow_state

FREE_JOURNAL_MONTHS = 3


def _get_user_plan(user_id: str) -> str:
    sb = get_admin_client()
    return get_effective_user_plan(sb, user_id)


def _portfolio_unavailable() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Portfolio is temporarily unavailable.",
    )

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
    source_page: Optional[Literal["chart", "watchlist", "scanner", "manual"]] = None
    source_context: Optional[str] = None
    scanner_context: Optional[dict[str, Any]] = None
    thesis: Optional[str] = None
    invalidation_rule: Optional[str] = None


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
    source_page: Optional[Literal["chart", "watchlist", "scanner", "manual"]] = None
    source_context: Optional[str] = None
    scanner_context: Optional[dict[str, Any]] = None
    thesis: Optional[str] = None
    invalidation_rule: Optional[str] = None
    status: Optional[str] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _compute_pnl(entry_price: float, exit_price: float, quantity: int, trade_type: str):
    if trade_type == "long":
        pnl = (exit_price - entry_price) * quantity
    else:
        pnl = (entry_price - exit_price) * quantity
    pnl_pct = (pnl / (entry_price * quantity)) * 100
    return round(pnl, 2), round(pnl_pct, 4)


def _clean_text(value: str | None, max_len: int) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned[:max_len] if cleaned else None


def _clean_context(value: dict[str, Any] | None) -> dict[str, Any] | None:
    return value if isinstance(value, dict) else None


def _journal_today() -> date:
    return datetime.now(ZoneInfo("Asia/Kolkata")).date()


def _analytics_number(value: Any) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError, OverflowError):
        return None
    return number if isfinite(number) else None


def _analytics_date(value: Any) -> date | None:
    if not isinstance(value, str):
        return None
    try:
        parsed = date.fromisoformat(value)
    except ValueError:
        return None
    return parsed if parsed.isoformat() == value else None


def _analytics_holding_days(row: dict) -> int | None:
    entry_date = _analytics_date(row.get("entry_date"))
    exit_date = _analytics_date(row.get("exit_date"))
    if entry_date is None or exit_date is None or entry_date > exit_date:
        return None
    # Calendar dates are authoritative; stored holding_days can be stale after edits.
    return (exit_date - entry_date).days


def _closed_analytics_entries(client, user_id: str) -> list[dict]:
    entries: list[dict] = []
    seen_ids: set[str] = set()
    expected_count: int | None = None
    while True:
        result = (
            client.table("trade_journal")
            .select("id,symbol,trade_type,setup_type,entry_date,exit_date,pnl,pnl_pct,status,holding_days,risk_reward", count="exact")
            .eq("user_id", user_id)
            .eq("status", "closed")
            .order("exit_date", desc=False)
            .order("id", desc=False)
            .range(len(entries), len(entries) + 999)
            .execute()
        )
        chunk = result.data
        if not isinstance(chunk, list):
            raise ValueError("Invalid journal response")
        count = getattr(result, "count", None)
        if isinstance(count, int) and not isinstance(count, bool):
            if expected_count is not None and count != expected_count:
                raise ValueError("Journal history changed while loading")
            expected_count = count
        if not chunk:
            if expected_count is not None and len(entries) != expected_count:
                raise ValueError("Incomplete journal history")
            return entries
        for row in chunk:
            trade_id = row.get("id") if isinstance(row, dict) else None
            if not isinstance(trade_id, str) or not trade_id or trade_id in seen_ids:
                raise ValueError("Journal history changed while loading")
            seen_ids.add(trade_id)
        entries.extend(chunk)
        if expected_count is not None and len(entries) >= expected_count:
            if len(entries) != expected_count:
                raise ValueError("Unexpected journal row count")
            return entries


def _trade_metrics(entries: list[dict], *, closed_trades: int | None = None) -> dict:
    returns = [value for row in entries if (value := _analytics_number(row.get("pnl_pct"))) is not None]
    cash = [value for row in entries if (value := _analytics_number(row.get("pnl"))) is not None]
    gains = [value for value in returns if value > 0]
    losses = [-value for value in returns if value < 0]
    cash_wins = [value for value in cash if value > 0]
    cash_losses = [-value for value in cash if value < 0]

    def rounded(value: float | None) -> float | None:
        return round(value, 4) if value is not None and isfinite(value) else None

    def average(values: list[float]) -> float | None:
        return sum(value / len(values) for value in values) if values else None

    winner_holding: list[float] = []
    loser_holding: list[float] = []
    for row in entries:
        duration = _analytics_holding_days(row)
        pnl_pct = _analytics_number(row.get("pnl_pct"))
        if duration is None or pnl_pct is None:
            continue
        if pnl_pct > 0:
            winner_holding.append(duration)
        elif pnl_pct < 0:
            loser_holding.append(duration)

    avg_gain = average(gains)
    avg_loss = average(losses)
    win_probability = len(gains) / len(returns) if returns else None
    loss_probability = len(losses) / len(returns) if returns else None
    payoff = avg_gain / avg_loss if avg_gain is not None and avg_loss else None
    adjusted = (
        avg_gain * win_probability / (avg_loss * loss_probability)
        if avg_gain is not None and avg_loss and win_probability is not None and loss_probability
        else None
    )
    return {
        "closed_trades": len(entries) if closed_trades is None else closed_trades,
        "eligible_trades": len(entries),
        "return_trade_count": len(returns),
        "cash_trade_count": len(cash),
        "wins": len(gains),
        "losses": len(losses),
        "breakevens": sum(value == 0 for value in returns),
        "win_rate_pct": rounded(win_probability * 100) if win_probability is not None else None,
        "loss_rate_pct": rounded(loss_probability * 100) if loss_probability is not None else None,
        "avg_gain_pct": rounded(avg_gain),
        "avg_loss_pct": rounded(avg_loss),
        "largest_gain_pct": rounded(max(gains)) if gains else None,
        "largest_loss_pct": rounded(max(losses)) if losses else None,
        "avg_win_cash": rounded(average(cash_wins)),
        "avg_loss_cash": rounded(average(cash_losses)),
        "expectancy_pct": rounded(average(returns)),
        "expectancy_cash": rounded(average(cash)),
        "profit_factor_cash": rounded(sum(cash_wins) / sum(cash_losses)) if cash_losses else None,
        "payoff_ratio": rounded(payoff),
        "adjusted_win_loss_ratio": rounded(adjusted),
        "avg_winner_holding_days": rounded(average(winner_holding)),
        "avg_loser_holding_days": rounded(average(loser_holding)),
        "winner_holding_count": len(winner_holding),
        "loser_holding_count": len(loser_holding),
    }


def _performance_analytics(entries: list[dict], today: date) -> dict:
    eligible: list[dict] = []
    months: dict[str, list[dict]] = {}
    unknown_dates = 0
    future_dates = 0
    for row in entries:
        exit_date = _analytics_date(row.get("exit_date"))
        if exit_date is None:
            unknown_dates += 1
            continue
        if exit_date > today:
            future_dates += 1
            continue
        eligible.append(row)
        months.setdefault(exit_date.strftime("%Y-%m"), []).append(row)
    metrics = _trade_metrics(eligible, closed_trades=len(entries))
    returns = [value for row in eligible if (value := _analytics_number(row.get("pnl_pct"))) is not None]
    missing_returns = len(eligible) - len(returns)
    return {
        "trading_edge": metrics,
        "monthly_tracker": [{"month": month, **_trade_metrics(rows)} for month, rows in sorted(months.items())],
        "trade_distribution": {
            "returns_pct": returns,
            "gain_count": metrics["wins"],
            "loss_count": metrics["losses"],
            "breakeven_count": metrics["breakevens"],
            "missing_return_count": missing_returns,
        },
        "metric_coverage": {
            "closed_trades": len(entries),
            "eligible_trades": len(eligible),
            "return_trade_count": len(returns),
            "cash_trade_count": metrics["cash_trade_count"],
            "unknown_exit_date_count": unknown_dates,
            "future_exit_date_count": future_dates,
            "missing_return_count": missing_returns,
            "missing_cash_pnl_count": len(eligible) - metrics["cash_trade_count"],
        },
    }


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/analytics")
async def get_analytics(user_id: str = Depends(get_current_user_id)):
    try:
        sb = get_admin_client()
        all_entries = _closed_analytics_entries(sb, user_id)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Journal analytics are temporarily unavailable.",
        )
    today = _journal_today()
    performance = _performance_analytics(all_entries, today)
    entries = []
    for entry in all_entries:
        exit_date = _analytics_date(entry.get("exit_date"))
        if exit_date is not None and exit_date > today:
            continue
        normalized = dict(entry)
        for field in ("pnl", "pnl_pct", "holding_days", "risk_reward"):
            normalized[field] = _analytics_number(entry.get(field))
        normalized["holding_days"] = _analytics_holding_days(entry)
        entries.append(normalized)

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
            setup_map[s] = {"trades": 0, "wins": 0, "total_pnl": 0.0, "holding_days": [], "risk_rewards": []}
        setup_map[s]["trades"] += 1
        if pnl > 0:
            setup_map[s]["wins"] += 1
        setup_map[s]["total_pnl"] += pnl
        if e.get("holding_days") is not None:
            setup_map[s]["holding_days"].append(int(e["holding_days"]))
        if e.get("risk_reward") is not None:
            setup_map[s]["risk_rewards"].append(float(e["risk_reward"]))

    setup_breakdown = []
    for k, v in setup_map.items():
        holding = v["holding_days"]
        risk_rewards = v["risk_rewards"]
        setup_breakdown.append({
            "setup": k,
            "trades": v["trades"],
            "wins": v["wins"],
            "win_rate": round(v["wins"] / v["trades"] * 100, 1) if v["trades"] else 0,
            "total_pnl": round(v["total_pnl"], 2),
            "avg_pnl": round(v["total_pnl"] / v["trades"], 2) if v["trades"] else 0,
            "avg_holding_days": round(sum(holding) / len(holding), 1) if holding else None,
            "avg_risk_reward": round(sum(risk_rewards) / len(risk_rewards), 2) if risk_rewards else None,
        })
    setup_breakdown.sort(key=lambda x: x["total_pnl"], reverse=True)

    # ── Monthly P&L ───────────────────────────────────────────────────────────
    month_map: dict = {}
    for e in entries:
        exit_date = _analytics_date(e.get("exit_date"))
        if exit_date is None or e.get("pnl") is None:
            continue
        month = exit_date.strftime("%Y-%m")
        month_map[month] = round(month_map.get(month, 0.0) + float(e["pnl"]), 2)
    monthly_pnl = [{"month": k, "pnl": v} for k, v in sorted(month_map.items())]

    # ── Drawdown analysis ─────────────────────────────────────────────────────
    drawdown_curve = []
    max_dd = 0.0
    peak = 0.0
    longest_dd_days = 0
    current_dd_start: date | None = None

    for pt in equity_curve:
        val = pt["cumulative_pnl"]
        peak = max(peak, val)
        dd = peak - val

        try:
            point_date = date.fromisoformat(pt["date"])
        except (TypeError, ValueError):
            point_date = None

        # Measure observed underwater periods through recovery or the latest
        # closed trade, using each point's running high rather than the final high.
        if dd > 0 and current_dd_start is None:
            current_dd_start = point_date
        if current_dd_start is not None and point_date is not None:
            longest_dd_days = max(longest_dd_days, (point_date - current_dd_start).days)
        if dd == 0:
            current_dd_start = None

        max_dd = max(max_dd, dd)
        drawdown_curve.append({
            "date": pt["date"],
            "drawdown": -round(dd, 2),
            # Cumulative P&L is not account equity; percentage drawdown needs an
            # equity baseline and cash-flow history that this journal does not have.
            "drawdown_pct": None,
        })

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
        **performance,
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
        "source_page": body.source_page or "manual",
        "source_context": _clean_text(body.source_context, 240),
        "scanner_context": _clean_context(body.scanner_context),
        "thesis": _clean_text(body.thesis, 1200),
        "invalidation_rule": _clean_text(body.invalidation_rule, 800),
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
        "thesis": row["thesis"],
        "invalidation_rule": row["invalidation_rule"],
        "scanner_context": row["scanner_context"],
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
    for key, max_len in {
        "source_context": 240,
        "thesis": 1200,
        "invalidation_rule": 800,
    }.items():
        if key in update_data:
            update_data[key] = _clean_text(update_data[key], max_len)
    if "scanner_context" in update_data:
        update_data["scanner_context"] = _clean_context(update_data["scanner_context"])

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
    try:
        sb = get_admin_client()
        result = (
            sb.table("trade_journal")
            .select("id,symbol,company_name,trade_type,entry_date,entry_price,quantity,stop_loss,target_price,setup_type")
            .eq("user_id", user_id)
            .eq("status", "open")
            .order("entry_date", desc=False)
            .execute()
        )
    except Exception:
        raise _portfolio_unavailable()
    positions = result.data or []
    if not positions:
        return {"positions": [], "summary": {"total_invested": 0, "total_current": 0, "total_pnl": 0, "total_pnl_pct": 0}, "sectors": []}

    # Fetch fallback prices from the latest stored EOD row
    symbols = list({p["symbol"] for p in positions})
    try:
        price_rows = (
            sb.table("daily_ohlcv")
            .select("symbol,close,pct_change")
            .in_("symbol", symbols)
            .order("trade_date", desc=True)
            .execute()
        )
    except Exception:
        raise _portfolio_unavailable()
    latest_prices: dict[str, dict] = {}
    for row in (price_rows.data or []):
        sym = row["symbol"]
        if sym not in latest_prices:
            latest_prices[sym] = {"close": float(row["close"]), "pct_change": row.get("pct_change"), "source": "daily_ohlcv"}

    # Prefer live Yahoo Finance quotes when available
    try:
        market_rows = (
            sb.table("stock_universe")
            .select("symbol,market")
            .in_("symbol", symbols)
            .execute()
        )
        market_map: dict[str, str] = {r["symbol"]: (r.get("market") or "NSE") for r in (market_rows.data or [])}
    except Exception:
        market_map = {}

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
    try:
        sector_rows = (
            sb.table("stock_universe")
            .select("symbol,sector")
            .in_("symbol", symbols)
            .execute()
        )
    except Exception:
        raise _portfolio_unavailable()
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
