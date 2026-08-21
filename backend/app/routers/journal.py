from datetime import date, datetime, timedelta, timezone
from typing import Any, Literal, Optional
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status
import yfinance as yf
from pydantic import BaseModel

from app.middleware.auth import get_current_user_id, get_current_user_token
from app.services.audit_log import record_broker_audit_event
from app.services.plans import get_effective_user_plan
from app.services.supabase import get_admin_client, get_user_client  # SERVICE_ROLE: writes normalized broker evidence and audit rows after JWT-scoped reads
from app.services.trade_excursion import (
    IntradayPathError,
    calculate_excursion,
    capture_zerodha_intraday_path,
)
from app.services.workflow_state import sync_workflow_state

FREE_JOURNAL_MONTHS = 3
UNPLANNED_SETUP_TYPE = "unplanned"
REVIEW_ANALYTICS_MINIMUM_SAMPLE = 5
REVIEW_ANALYTICS_ADHERENCE = ("followed", "partial", "not_followed", "unknown")
ANALYTICS_SECTOR_SOURCE = "stock_universe.sector"
ANALYTICS_SECTOR_STATUS_AVAILABLE = "available"
ANALYTICS_SECTOR_STATUS_UNAVAILABLE = "unavailable"


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
    setup_id: UUID | None = None
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
    setup_id: Optional[UUID] = None
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


class IntradayPathCaptureRequest(BaseModel):
    broker: Literal["zerodha"] = "zerodha"
    interval: Literal["5minute", "15minute", "30minute", "60minute"] = "15minute"


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


def _effective_setup_type(setup_id: UUID | None, setup_type: str | None) -> str | None:
    cleaned = _clean_text(setup_type, 80)
    return cleaned or (UNPLANNED_SETUP_TYPE if setup_id is None else None)


def _safe_float(value: Any) -> float | None:
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _holding_period_bucket(value: Any) -> str:
    days = _safe_float(value)
    if days is None:
        return "Holding time unavailable"
    if days <= 0:
        return "Intraday (0d)"
    if days <= 3:
        return "Short (1–3d)"
    if days <= 10:
        return "Swing (4–10d)"
    return "Position (11d+)"


def _scanner_cohort(entry: dict[str, Any]) -> str:
    context = entry.get("scanner_context")
    if not isinstance(context, dict):
        return "Not scanner-sourced"
    name = context.get("preset_name") or context.get("preset_id")
    if isinstance(name, str) and name.strip():
        return name.strip()[:80]
    if context.get("scan_run_id") or context.get("candidate_id"):
        return "Scanner run (unnamed)"
    return "Scanner context incomplete"


def _realized_r_multiple(entry: dict[str, Any]) -> float | None:
    """Return realized R only when a valid entry stop risk was recorded."""
    entry_price = _safe_float(entry.get("entry_price"))
    stop_price = _safe_float(entry.get("stop_loss"))
    quantity = _safe_float(entry.get("quantity"))
    pnl = _safe_float(entry.get("pnl"))
    if entry_price is None or stop_price is None or quantity is None or pnl is None:
        return None
    if entry_price <= 0 or quantity <= 0:
        return None
    trade_type = str(entry.get("trade_type") or "long").lower()
    risk_per_share = entry_price - stop_price if trade_type == "long" else stop_price - entry_price
    planned_risk = risk_per_share * quantity
    if planned_risk <= 0:
        return None
    return round(pnl / planned_risk, 4)


def _build_cohort_rows(
    entries: list[dict[str, Any]],
    key_for_entry: Any,
    realized_r_by_entry: dict[str, float | None],
    reviewed_entry_ids: set[str],
) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for entry in entries:
        key = str(key_for_entry(entry)).strip() or "Unknown"
        grouped.setdefault(key, []).append(entry)

    rows: list[dict[str, Any]] = []
    for cohort, group in grouped.items():
        pnls = [_safe_float(entry.get("pnl")) or 0.0 for entry in group]
        r_values = [
            realized_r_by_entry.get(str(entry.get("id")))
            for entry in group
        ]
        available_r = [value for value in r_values if value is not None]
        total_pnl = sum(pnls)
        wins = sum(1 for pnl in pnls if pnl > 0)
        rows.append({
            "cohort": cohort,
            "trades": len(group),
            "wins": wins,
            "win_rate": round(wins / len(group) * 100, 1) if group else 0,
            "total_pnl": round(total_pnl, 2),
            "avg_pnl": round(total_pnl / len(group), 2) if group else 0,
            "avg_r_multiple": round(sum(available_r) / len(available_r), 2) if available_r else None,
            "reviewed_trades": sum(1 for entry in group if str(entry.get("id")) in reviewed_entry_ids),
        })
    rows.sort(key=lambda row: (-row["total_pnl"], row["cohort"]))
    return rows


def _build_r_multiple_summary(
    entries: list[dict[str, Any]],
    realized_r_by_entry: dict[str, float | None],
) -> dict[str, Any]:
    r_values = [
        realized_r_by_entry.get(str(entry.get("id"))) if entry.get("id") is not None else None
        for entry in entries
    ]
    values = [value for value in r_values if value is not None]
    winners = [value for value in values if value > 0]
    losers = [value for value in values if value < 0]
    total_r = sum(values)
    return {
        "trades": len(entries),
        "available_trades": len(values),
        "missing_risk_plan": len(entries) - len(values),
        "positive_trades": len(winners),
        "negative_trades": len(losers),
        "win_rate": round(len(winners) / len(values) * 100, 1) if values else None,
        "total_r": round(total_r, 2) if values else None,
        "expectancy_r": round(total_r / len(values), 2) if values else None,
        "avg_winner_r": round(sum(winners) / len(winners), 2) if winners else None,
        "avg_loser_r": round(sum(losers) / len(losers), 2) if losers else None,
    }


def _build_mae_mfe_summary(
    sb: Any,
    entries: list[dict[str, Any]],
    *,
    user_id: str | None = None,
) -> dict[str, Any]:
    """Build MAE/MFE from persisted intraday paths with an honest EOD fallback."""
    candidates = []
    for entry in entries:
        symbol = str(entry.get("symbol") or "").upper()
        entry_date = str(entry.get("entry_date") or "")[:10]
        exit_date = str(entry.get("exit_date") or "")[:10]
        entry_price = _safe_float(entry.get("entry_price"))
        if symbol and entry_date and exit_date and entry_date <= exit_date and entry_price and entry_price > 0:
            candidates.append((entry, symbol, entry_date, exit_date, entry_price))

    base = {
        "status": "unavailable",
        "basis": "daily_ohlcv_eod_proxy",
        "trades_with_path": 0,
        "trades_without_path": len(entries),
        "intraday_trades": 0,
        "eod_proxy_trades": 0,
        "avg_mae_pct": None,
        "avg_mfe_pct": None,
        "avg_mae_r": None,
        "avg_mfe_r": None,
        "trades": [],
        "reason": "Daily OHLCV paths were not available for the closed-trade window.",
    }
    if not candidates:
        return base

    # A missing migration or an older deployment must not make the analytics
    # endpoint fail. The EOD query below remains the compatibility path.
    intraday_by_entry: dict[str, dict[str, Any]] = {}
    journal_ids = [str(entry.get("id")) for entry, *_ in candidates if entry.get("id") is not None]
    if user_id and journal_ids:
        try:
            path_result = (
                sb.table("trade_intraday_paths")
                .select("journal_id,interval,source,bars,capture_status,captured_at")
                .eq("user_id", user_id)
                .in_("journal_id", journal_ids)
                .order("captured_at", desc=True)
                .execute()
            )
            for path_record in path_result.data or []:
                journal_id = str(path_record.get("journal_id") or "")
                if journal_id and journal_id not in intraday_by_entry:
                    intraday_by_entry[journal_id] = path_record
        except Exception:
            intraday_by_entry = {}

    excursion_rows: list[dict[str, Any]] = []
    mae_pcts: list[float] = []
    mfe_pcts: list[float] = []
    mae_rs: list[float] = []
    mfe_rs: list[float] = []
    intraday_count = 0
    eod_count = 0
    intraday_rows_by_entry: dict[str, dict[str, Any]] = {}

    for entry, _symbol, _entry_date, _exit_date, _entry_price in candidates:
        entry_id = str(entry.get("id") or "")
        path_record = intraday_by_entry.get(entry_id)
        if not path_record or not isinstance(path_record.get("bars"), list):
            continue
        row = calculate_excursion(
            entry,
            path_record["bars"],
            basis="intraday_path",
            interval=str(path_record.get("interval") or "15minute"),
            source=str(path_record.get("source") or "zerodha_kite"),
        )
        if row:
            intraday_rows_by_entry[entry_id] = row

    eod_candidates = [
        candidate for candidate in candidates
        if str(candidate[0].get("id") or "") not in intraday_rows_by_entry
    ]
    bars_by_symbol: dict[str, list[dict[str, Any]]] = {}
    if eod_candidates:
        symbols = sorted({symbol for _, symbol, _, _, _ in eod_candidates})
        from_date = min(start for _, _, start, _, _ in eod_candidates)
        to_date = max(end for _, _, _, end, _ in eod_candidates)
        try:
            offset = 0
            while True:
                page = (
                    sb.table("daily_ohlcv")
                    .select("symbol,trade_date,high,low")
                    .in_("symbol", symbols)
                    .gte("trade_date", from_date)
                    .lte("trade_date", to_date)
                    .order("trade_date", desc=False)
                    .range(offset, offset + 999)
                    .execute()
                    .data or []
                )
                for bar in page:
                    symbol = str(bar.get("symbol") or "").upper()
                    if symbol:
                        bars_by_symbol.setdefault(symbol, []).append(bar)
                if len(page) < 1000:
                    break
                offset += len(page)
        except Exception:
            if not intraday_rows_by_entry:
                return {
                    **base,
                    "reason": "Daily OHLCV excursion data is temporarily unavailable.",
                }

    for entry, symbol, entry_date, exit_date, _entry_price in candidates:
        entry_id = str(entry.get("id") or "")
        row = intraday_rows_by_entry.get(entry_id)
        if row is None:
            path = [
                bar for bar in bars_by_symbol.get(symbol, [])
                if entry_date <= str(bar.get("trade_date") or "")[:10] <= exit_date
            ]
            row = calculate_excursion(entry, path, basis="daily_ohlcv_eod_proxy")
            if row:
                eod_count += 1
        else:
            intraday_count += 1
        if row is None:
            continue
        excursion_rows.append(row)
        mae_pcts.append(row["mae_pct"])
        mfe_pcts.append(row["mfe_pct"])
        if row["mae_r"] is not None:
            mae_rs.append(row["mae_r"])
        if row["mfe_r"] is not None:
            mfe_rs.append(row["mfe_r"])

    if not excursion_rows:
        return base
    if intraday_count and eod_count:
        basis = "mixed_intraday_and_eod_proxy"
        reason = "Mixed coverage: persisted intraday paths plus EOD high/low proxy for missing paths."
    elif intraday_count:
        basis = "intraday_path"
        reason = "Persisted Zerodha intraday paths; capture coverage may be partial for trades without bars."
    else:
        basis = "daily_ohlcv_eod_proxy"
        reason = "EOD high/low proxy; capture a broker intraday path to improve coverage."
    return {
        "status": "available" if len(excursion_rows) == len(entries) else "partial",
        "basis": basis,
        "trades_with_path": len(excursion_rows),
        "trades_without_path": len(entries) - len(excursion_rows),
        "intraday_trades": intraday_count,
        "eod_proxy_trades": eod_count,
        "avg_mae_pct": round(sum(mae_pcts) / len(mae_pcts), 2),
        "avg_mfe_pct": round(sum(mfe_pcts) / len(mfe_pcts), 2),
        "avg_mae_r": round(sum(mae_rs) / len(mae_rs), 2) if mae_rs else None,
        "avg_mfe_r": round(sum(mfe_rs) / len(mfe_rs), 2) if mfe_rs else None,
        "trades": excursion_rows,
        "reason": reason,
    }


def _review_analytics_summary(entries: list[dict[str, Any]], reviews: list[dict[str, Any]], *, data_status: str) -> dict[str, Any]:
    """Build descriptive process metrics without implying investment advice.

    Only completed review records count toward the reviewed sample. Closed trades
    without a completed review remain visible in the unknown bucket so missing
    process data cannot look like adherence.
    """
    review_by_entry: dict[str, dict[str, Any]] = {}
    for review in reviews:
        journal_entry_id = review.get("journal_entry_id")
        if journal_entry_id is None:
            continue
        key = str(journal_entry_id)
        if key not in review_by_entry:
            review_by_entry[key] = review

    adherence_map = {
        adherence: {"trades": 0, "wins": 0, "total_pnl": 0.0}
        for adherence in REVIEW_ANALYTICS_ADHERENCE
    }
    reviewed_trades = 0
    linked_trades = 0
    unplanned_trades = 0

    for entry in entries:
        if entry.get("setup_id") is not None:
            linked_trades += 1
        else:
            unplanned_trades += 1

        review = review_by_entry.get(str(entry.get("id")))
        is_completed = isinstance(review, dict) and review.get("status") == "completed"
        adherence = review.get("plan_adherence") if is_completed else "unknown"
        if adherence not in REVIEW_ANALYTICS_ADHERENCE:
            adherence = "unknown"
        if is_completed:
            reviewed_trades += 1

        pnl = float(entry["pnl"]) if entry.get("pnl") is not None else 0.0
        row = adherence_map[adherence]
        row["trades"] += 1
        if pnl > 0:
            row["wins"] += 1
        row["total_pnl"] += pnl

    plan_adherence = []
    for adherence in REVIEW_ANALYTICS_ADHERENCE:
        row = adherence_map[adherence]
        trades = row["trades"]
        total_pnl = row["total_pnl"]
        plan_adherence.append({
            "adherence": adherence,
            "trades": trades,
            "wins": row["wins"],
            "win_rate": round(row["wins"] / trades * 100, 1) if trades else 0,
            "total_pnl": round(total_pnl, 2),
            "avg_pnl": round(total_pnl / trades, 2) if trades else 0,
        })

    return {
        "minimum_sample_size": REVIEW_ANALYTICS_MINIMUM_SAMPLE,
        "reviewed_trades": reviewed_trades,
        "unreviewed_closed_trades": len(entries) - reviewed_trades,
        "linked_trades": linked_trades,
        "unplanned_trades": unplanned_trades,
        "sample_size_sufficient": reviewed_trades >= REVIEW_ANALYTICS_MINIMUM_SAMPLE,
        "review_data_status": data_status,
        "plan_adherence": plan_adherence,
    }


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/analytics")
async def get_analytics(
    from_date: str | None = None,
    to_date: str | None = None,
    user_id: str = Depends(get_current_user_id),
):
    parsed_from: date | None = None
    parsed_to: date | None = None
    for label, value in (("from_date", from_date), ("to_date", to_date)):
        if value is None:
            continue
        try:
            parsed = date.fromisoformat(value)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"{label} must be a valid YYYY-MM-DD date.",
            ) from exc
        if label == "from_date":
            parsed_from = parsed
        else:
            parsed_to = parsed
    if parsed_from and parsed_to and parsed_from > parsed_to:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="from_date must be on or before to_date.",
        )

    try:
        sb = get_admin_client()
        query = (
            sb.table("trade_journal")
            .select(
                "id,setup_id,symbol,trade_type,setup_type,entry_date,exit_date,pnl,pnl_pct,status,"
                "holding_days,risk_reward,entry_price,exit_price,quantity,stop_loss,scanner_context"
            )
            .eq("user_id", user_id)
            .eq("status", "closed")
        )
        if parsed_from:
            query = query.gte("exit_date", parsed_from.isoformat())
        if parsed_to:
            query = query.lte("exit_date", parsed_to.isoformat())
        result = query.order("exit_date", desc=False).execute()
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Journal analytics are temporarily unavailable.",
        )
    entries = result.data or []

    # Review metrics enrich the core journal analytics. A missing or unavailable
    # review table should not hide the user's realised P&L and drawdown history.
    reviews: list[dict[str, Any]] = []
    review_data_status = "available"
    try:
        review_result = (
            sb.table("trade_reviews")
            .select("journal_entry_id,status,plan_adherence,reviewed_at,updated_at")
            .eq("user_id", user_id)
            .order("updated_at", desc=True)
            .execute()
        )
        reviews = review_result.data or []
    except Exception:
        review_data_status = "unavailable"

    reviewed_entry_ids = {
        str(review.get("journal_entry_id"))
        for review in reviews
        if review.get("status") == "completed" and review.get("journal_entry_id") is not None
    }
    realized_r_by_entry = {
        str(entry.get("id")): _realized_r_multiple(entry)
        for entry in entries
        if entry.get("id") is not None
    }

    # Sector is deliberately a contextual cohort, not a benchmark or a claim
    # about sector attribution. It uses the repository's current symbol labels
    # and remains visibly unavailable when the lookup cannot be completed.
    sector_by_symbol: dict[str, str] = {}
    sector_data_status = ANALYTICS_SECTOR_STATUS_AVAILABLE
    symbols = sorted({str(entry.get("symbol") or "").upper() for entry in entries if entry.get("symbol")})
    if symbols:
        try:
            sector_result = (
                sb.table("stock_universe")
                .select("symbol,sector")
                .in_("symbol", symbols)
                .execute()
            )
            sector_by_symbol = {
                str(row.get("symbol") or "").upper(): str(row.get("sector")).strip()
                for row in (sector_result.data or [])
                if row.get("symbol") and row.get("sector") and str(row.get("sector")).strip()
            }
        except Exception:
            sector_data_status = ANALYTICS_SECTOR_STATUS_UNAVAILABLE

    def sector_for_entry(entry: dict[str, Any]) -> str:
        if sector_data_status == ANALYTICS_SECTOR_STATUS_UNAVAILABLE:
            return "Sector data unavailable"
        return sector_by_symbol.get(str(entry.get("symbol") or "").upper(), "Sector unavailable")

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

    cohort_breakdown = {
        "scanner": _build_cohort_rows(entries, _scanner_cohort, realized_r_by_entry, reviewed_entry_ids),
        "sector": _build_cohort_rows(entries, sector_for_entry, realized_r_by_entry, reviewed_entry_ids),
        "holding_period": _build_cohort_rows(
            entries,
            lambda entry: _holding_period_bucket(entry.get("holding_days")),
            realized_r_by_entry,
            reviewed_entry_ids,
        ),
    }
    mae_mfe_summary = _build_mae_mfe_summary(sb, entries, user_id=user_id)

    return {
        "equity_curve":    equity_curve,
        "setup_breakdown": setup_breakdown,
        "monthly_pnl":     monthly_pnl,
        "drawdown_curve":  drawdown_curve,
        "max_drawdown":    round(max_dd, 2),
        "longest_dd_days": longest_dd_days,
        "recovery_factor": recovery_factor,
        "profit_factor":   profit_factor,
        "review_summary":  _review_analytics_summary(entries, reviews, data_status=review_data_status),
        "analysis_period": {
            "from_date": parsed_from.isoformat() if parsed_from else None,
            "to_date": parsed_to.isoformat() if parsed_to else None,
            "trade_count": len(entries),
        },
        "r_multiple_summary": _build_r_multiple_summary(entries, realized_r_by_entry),
        "cohort_breakdown": cohort_breakdown,
        "sector_context": {
            "status": sector_data_status,
            "source": ANALYTICS_SECTOR_SOURCE,
            "note": "Sector cohorts use current AlphaVyuh symbol labels for context; they are not benchmark attribution.",
        },
        "mae_mfe": mae_mfe_summary,
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

    if body.setup_id:
        setup = (
            sb.table("setups")
            .select("id,symbol")
            .eq("id", str(body.setup_id))
            .eq("user_id", user_id)
            .maybe_single()
            .execute()
            .data
        )
        if not setup:
            raise HTTPException(status_code=404, detail="Setup not found")
        if str(setup.get("symbol") or "").upper() != body.symbol.strip().upper():
            raise HTTPException(status_code=400, detail="Setup symbol does not match the journal symbol")

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

    setup_type = _effective_setup_type(body.setup_id, body.setup_type)

    row = {
        "user_id": user_id,
        "symbol": body.symbol.upper(),
        "setup_id": str(body.setup_id) if body.setup_id else None,
        "company_name": company_name,
        "trade_type": body.trade_type,
        "entry_date": body.entry_date,
        "entry_price": body.entry_price,
        "quantity": body.quantity,
        "setup_type": setup_type,
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
        "setup_type": setup_type,
        "notes": body.entry_reason,
        "thesis": row["thesis"],
        "invalidation_rule": row["invalidation_rule"],
        "scanner_context": row["scanner_context"],
        "journal_id": created["id"],
        "setup_id": row["setup_id"],
    })
    return created


@router.post("/{entry_id}/intraday-path")
async def capture_intraday_path(
    entry_id: str,
    body: IntradayPathCaptureRequest,
    user_id: str = Depends(get_current_user_id),
    user_jwt: str = Depends(get_current_user_token),
):
    """Capture one closed trade's normalized Zerodha path for MAE/MFE analysis."""
    try:
        read_sb = get_user_client(user_jwt)
        existing = (
            read_sb.table("trade_journal")
            .select("id,user_id,symbol,trade_type,entry_date,exit_date,entry_price,stop_loss,status")
            .eq("id", entry_id)
            .eq("user_id", user_id)
            .maybe_single()
            .execute()
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Journal data is temporarily unavailable.",
        ) from exc
    entry = existing.data
    if not entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entry not found")
    journal_id = str(entry.get("id") or "")
    if not journal_id:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Journal entry identity is unavailable.")
    if entry.get("status") != "closed" or not entry.get("exit_date"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Trade must be closed before capturing a path.")

    try:
        plan = _get_user_plan(user_id)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Plan access could not be verified.",
        ) from exc
    if plan not in {"pro", "elite"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "plan_required",
                "message": "Intraday broker paths require Pro or Elite.",
                "upgrade_url": "/settings/billing",
            },
        )

    try:
        captured = capture_zerodha_intraday_path(
            user_id=user_id,
            symbol=str(entry.get("symbol") or ""),
            entry_date=str(entry.get("entry_date") or ""),
            exit_date=str(entry.get("exit_date") or ""),
            interval=body.interval,
        )
    except IntradayPathError as exc:
        error_status = {
            "auth": status.HTTP_401_UNAUTHORIZED,
            "config": status.HTTP_503_SERVICE_UNAVAILABLE,
            "provider": status.HTTP_502_BAD_GATEWAY,
            "rate": status.HTTP_429_TOO_MANY_REQUESTS,
        }[exc.kind]
        raise HTTPException(status_code=error_status, detail=str(exc)) from exc

    captured_at = datetime.now(timezone.utc).isoformat()
    path_id = str(uuid4())
    payload = {
        "id": path_id,
        "user_id": user_id,
        "journal_id": journal_id,
        "symbol": captured.symbol,
        "broker": captured.broker,
        "interval": captured.interval,
        "from_at": captured.from_at,
        "to_at": captured.to_at,
        "source": captured.source,
        "bars": captured.bars,
        "bar_count": len(captured.bars),
        "capture_status": "available",
        "captured_at": captured_at,
    }
    try:
        sb = get_admin_client()
        sb.table("trade_intraday_paths").upsert(
            payload,
            on_conflict="user_id,journal_id,broker,interval,from_at,to_at",
        ).execute()
    except Exception as exc:
        try:
            record_broker_audit_event(
                user_id=user_id,
                event_type="journal.intraday_path.capture",
                outcome="failed",
                actor_type="user",
                broker=captured.broker,
                journal_id=journal_id,
                metadata={"interval": captured.interval, "bar_count": len(captured.bars), "reason": "storage_unavailable"},
            )
        except Exception:
            pass
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Intraday path storage is temporarily unavailable.",
        ) from exc

    try:
        record_broker_audit_event(
            user_id=user_id,
            event_type="journal.intraday_path.capture",
            outcome="recorded",
            actor_type="user",
            broker=captured.broker,
            journal_id=journal_id,
            metadata={"interval": captured.interval, "bar_count": len(captured.bars), "source": captured.source},
        )
    except Exception:
        pass
    return {
        "id": path_id,
        "journal_id": journal_id,
        "symbol": captured.symbol,
        "broker": captured.broker,
        "interval": captured.interval,
        "from_at": captured.from_at,
        "to_at": captured.to_at,
        "bar_count": len(captured.bars),
        "capture_status": "available",
        "captured_at": captured_at,
    }


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
    if "setup_id" in update_data:
        if body.setup_id:
            setup = (
                sb.table("setups")
                .select("id,symbol")
                .eq("id", str(body.setup_id))
                .eq("user_id", user_id)
                .maybe_single()
                .execute()
                .data
            )
            if not setup:
                raise HTTPException(status_code=404, detail="Setup not found")
            if str(setup.get("symbol") or "").upper() != str(entry.get("symbol") or "").upper():
                raise HTTPException(status_code=400, detail="Setup symbol does not match the journal symbol")
        update_data["setup_id"] = str(update_data["setup_id"]) if update_data["setup_id"] else None

    if "setup_type" in update_data:
        update_data["setup_type"] = _clean_text(update_data["setup_type"], 80)
    effective_setup_id = update_data.get("setup_id", entry.get("setup_id"))
    if effective_setup_id is None and not update_data.get("setup_type"):
        update_data["setup_type"] = UNPLANNED_SETUP_TYPE

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
            "setup_id": updated_entry.get("setup_id"),
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
