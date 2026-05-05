"""
Trade analysis routes.

These endpoints analyse the user's closed trade journal locally. No journal data
is sent to a third-party AI provider.
"""
from __future__ import annotations

import datetime
import logging
from collections import defaultdict
from statistics import mean
from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from app.middleware.auth import get_current_user_id
from app.services.rate_limit import ai_limiter
from app.services.supabase import get_admin_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/ai", tags=["ai"])

MIN_TRADES = 3


_DISCLAIMER = (
    "Trade analysis is generated from your closed journal records for education "
    "and review. It is not SEBI-registered investment advice."
)


def _num(value: Any, fallback: float = 0.0) -> float:
    try:
        if value is None:
            return fallback
        return float(value)
    except (TypeError, ValueError):
        return fallback


def _date(value: Any) -> datetime.date | None:
    if not value:
        return None
    try:
        return datetime.date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def _win_rate(trades: list[dict]) -> float:
    if not trades:
        return 0.0
    wins = sum(1 for trade in trades if _num(trade.get("pnl")) > 0)
    return round(wins / len(trades) * 100, 1)


def _total_pnl(trades: list[dict]) -> float:
    return round(sum(_num(trade.get("pnl")) for trade in trades), 2)


def _best_and_worst(trades: list[dict]) -> tuple[dict | None, dict | None]:
    with_pnl = [trade for trade in trades if trade.get("pnl") is not None]
    if not with_pnl:
        return None, None
    return max(with_pnl, key=lambda t: _num(t.get("pnl"))), min(with_pnl, key=lambda t: _num(t.get("pnl")))


def _group_by(trades: list[dict], key: str, fallback: str = "Untagged") -> dict[str, list[dict]]:
    grouped: dict[str, list[dict]] = defaultdict(list)
    for trade in trades:
        value = str(trade.get(key) or fallback).strip() or fallback
        grouped[value].append(trade)
    return grouped


def _format_pct(value: float | None) -> str:
    if value is None:
        return "n/a"
    sign = "+" if value > 0 else ""
    return f"{sign}{value:.1f}%"


def _format_money(value: float) -> str:
    sign = "+" if value > 0 else ""
    return f"{sign}Rs {value:,.0f}"


def _holding_bucket(days: int) -> str:
    if days <= 0:
        return "Intraday (0d)"
    if days <= 3:
        return "Short (1-3d)"
    if days <= 10:
        return "Swing (4-10d)"
    return "Position (11d+)"


def generate_trade_lesson(entry: dict) -> str:
    """Create a concise, local lesson for a single closed trade."""
    pnl = _num(entry.get("pnl"))
    pnl_pct = _num(entry.get("pnl_pct"))
    holding_days = int(_num(entry.get("holding_days")))
    trade_type = str(entry.get("trade_type") or "long").lower()
    entry_price = _num(entry.get("entry_price"))
    stop_loss = _num(entry.get("stop_loss"), fallback=0.0)
    target = _num(entry.get("target_price"), fallback=0.0)
    setup = entry.get("setup_type") or "untagged setup"

    lines: list[str] = []
    outcome = "winner" if pnl > 0 else "loser" if pnl < 0 else "flat trade"
    lines.append(
        f"- {entry.get('symbol', 'Trade')} was a {outcome}: {_format_money(pnl)} ({_format_pct(pnl_pct)})."
    )

    if setup != "untagged setup":
        lines.append(f"- Setup tagged as {setup}; keep comparing this setup's win rate against your journal average.")
    else:
        lines.append("- Setup was not tagged; add a setup label so future reviews can find repeat patterns.")

    if stop_loss and entry_price:
        stopped = (trade_type == "long" and pnl < 0 and _num(entry.get("exit_price")) <= stop_loss) or (
            trade_type == "short" and pnl < 0 and _num(entry.get("exit_price")) >= stop_loss
        )
        if stopped:
            lines.append("- Loss stayed close to the planned stop; that protects capital for the next setup.")
        else:
            lines.append("- Compare the exit with the planned stop; tighten execution notes if the stop was not followed.")
    else:
        lines.append("- Stop loss was missing at entry, so the trade had no recorded pre-entry risk point.")

    if target and pnl > 0:
        lines.append("- Winner had a target recorded; review whether exit matched the planned reward.")
    elif pnl > 0:
        lines.append("- Winner lacked a target, so planned reward could not be compared with the exit.")

    if holding_days > 10 and pnl < 0:
        lines.append("- Losing trade was held more than 10 days; duration exceeded the short swing-trade sample.")
    elif holding_days <= 3 and pnl > 0:
        lines.append("- Quick winner; this setup closed positive inside 3 days in the recorded sample.")

    return "\n".join(lines[:5])


def generate_journal_analysis(trades: list[dict]) -> str:
    """Build a markdown journal review using only recorded trade data."""
    total = len(trades)
    winners = [trade for trade in trades if _num(trade.get("pnl")) > 0]
    losers = [trade for trade in trades if _num(trade.get("pnl")) < 0]
    win_rate = _win_rate(trades)
    total_pnl = _total_pnl(trades)
    best, worst = _best_and_worst(trades)

    setup_stats = []
    for setup, group in _group_by(trades, "setup_type").items():
        if len(group) < 2:
            continue
        setup_stats.append((setup, len(group), _win_rate(group), _total_pnl(group)))
    setup_stats.sort(key=lambda item: (item[3], item[2], item[1]), reverse=True)

    day_stats = []
    by_day: dict[str, list[dict]] = defaultdict(list)
    for trade in trades:
        entry_day = _date(trade.get("entry_date"))
        if entry_day:
            by_day[entry_day.strftime("%A")].append(trade)
    for day, group in by_day.items():
        day_stats.append((day, len(group), _win_rate(group), _total_pnl(group)))
    day_stats.sort(key=lambda item: item[3])

    hold_winners = [int(_num(t.get("holding_days"))) for t in winners if t.get("holding_days") is not None]
    hold_losers = [int(_num(t.get("holding_days"))) for t in losers if t.get("holding_days") is not None]
    avg_win_hold = round(mean(hold_winners), 1) if hold_winners else None
    avg_loss_hold = round(mean(hold_losers), 1) if hold_losers else None

    buckets: dict[str, list[dict]] = defaultdict(list)
    for trade in trades:
        buckets[_holding_bucket(int(_num(trade.get("holding_days"))))].append(trade)
    bucket_rows = sorted(
        ((bucket, len(group), _win_rate(group), _total_pnl(group)) for bucket, group in buckets.items()),
        key=lambda item: item[3],
    )

    key_patterns = [
        f"- **Overall edge:** {total} closed trades, {win_rate}% win rate, total realised P&L {_format_money(total_pnl)}.",
    ]
    if best:
        key_patterns.append(
            f"- **Best trade:** {best.get('symbol')} contributed {_format_money(_num(best.get('pnl')))} ({_format_pct(_num(best.get('pnl_pct')))})."
        )
    if worst:
        key_patterns.append(
            f"- **Largest drag:** {worst.get('symbol')} cost {_format_money(_num(worst.get('pnl')))} ({_format_pct(_num(worst.get('pnl_pct')))})."
        )
    if avg_win_hold is not None and avg_loss_hold is not None:
        key_patterns.append(
            f"- **Holding behaviour:** winners average {avg_win_hold} days; losers average {avg_loss_hold} days."
        )

    mistakes: list[str] = []
    weak_setups = [row for row in setup_stats if row[2] < win_rate and row[3] < 0]
    if weak_setups:
        setup, count, rate, pnl = weak_setups[0]
        mistakes.append(f"- **Weak setup cluster:** {setup} has {count} trades, {rate}% win rate, {_format_money(pnl)} P&L.")
    worst_bucket = bucket_rows[0] if bucket_rows else None
    if worst_bucket and worst_bucket[3] < 0:
        mistakes.append(
            f"- **Holding period leak:** {worst_bucket[0]} is the weakest bucket with {_format_money(worst_bucket[3])} P&L."
        )
    if day_stats and day_stats[0][3] < 0:
        day, count, rate, pnl = day_stats[0]
        mistakes.append(f"- **Timing issue:** {day} entries show {count} trades, {rate}% win rate, {_format_money(pnl)} P&L.")
    untagged = sum(1 for trade in trades if not trade.get("setup_type"))
    if untagged:
        mistakes.append(f"- **Review quality:** {untagged} closed trades have no setup tag, which weakens pattern detection.")
    if not mistakes:
        mistakes.append("- No repeated loss cluster is clear yet; setup, stop, target, and exit reason coverage determines future pattern quality.")

    working: list[str] = []
    strong_setups = [row for row in setup_stats if row[2] >= win_rate and row[3] > 0]
    if strong_setups:
        setup, count, rate, pnl = strong_setups[0]
        working.append(f"- **Highest P&L setup:** {setup} has {count} trades, {rate}% win rate, {_format_money(pnl)} P&L.")
    profitable_buckets = [row for row in bucket_rows if row[3] > 0]
    if profitable_buckets:
        bucket, count, rate, pnl = profitable_buckets[-1]
        working.append(f"- **Highest P&L holding bucket:** {bucket} produced {_format_money(pnl)} across {count} trades.")
    if winners:
        working.append(f"- **Winner count:** {len(winners)} trades closed positive in the analysed sample.")
    if not working:
        working.append("- Positive sample is still thin; post-trade notes and risk fields are incomplete for pattern analysis.")

    rules: list[str] = []
    if weak_setups:
        setup = weak_setups[0][0]
        rules.append(f"- {setup} trades are currently below the journal win-rate baseline in this sample.")
    if avg_loss_hold is not None and avg_win_hold is not None and avg_loss_hold > avg_win_hold:
        rules.append("- Losing trades were held longer than winning trades on average.")
    if worst:
        rules.append(f"- {worst.get('symbol')} had the largest realised loss in the analysed sample.")
    rules.append("- Closed trades with setup type, entry reason, exit reason, and lesson fields produce higher-quality review data.")

    return "\n\n".join([
        "## Key Patterns",
        "\n".join(key_patterns[:4]),
        "## Top Mistakes",
        "\n".join(mistakes[:4]),
        "## What's Working",
        "\n".join(working[:3]),
        "## Observed Process Patterns",
        "\n".join(rules[:4]),
    ])


@router.post("/analyse")
async def analyse_journal(user_id: str = Depends(get_current_user_id)):
    if not ai_limiter.is_allowed(user_id):
        retry_after = ai_limiter.retry_after(user_id)
        raise HTTPException(
            429,
            f"Too many review requests - try again in {retry_after} seconds.",
            headers={"Retry-After": str(retry_after)},
        )

    sb = get_admin_client()
    result = (
        sb.table("trade_journal")
        .select(
            "symbol,trade_type,setup_type,entry_date,entry_price,"
            "exit_date,exit_price,pnl,pnl_pct,holding_days,"
            "entry_reason,exit_reason,mistakes"
        )
        .eq("user_id", user_id)
        .eq("status", "closed")
        .order("entry_date", desc=False)
        .execute()
    )
    trades = result.data or []

    if len(trades) < MIN_TRADES:
        raise HTTPException(
            400,
            f"Need at least {MIN_TRADES} closed trades for analysis. You have {len(trades)}.",
        )

    return {
        "analysis": generate_journal_analysis(trades),
        "trades_analysed": len(trades),
        "disclaimer": _DISCLAIMER,
    }


@router.get("/patterns")
async def get_patterns(user_id: str = Depends(get_current_user_id)):
    """
    Compute statistical patterns from closed trades.
    Returns win rates by day of week, direction, holding period bucket, and time-in-trade stats.
    """
    sb = get_admin_client()
    result = (
        sb.table("trade_journal")
        .select("symbol,trade_type,setup_type,entry_date,exit_date,pnl,holding_days,risk_reward,mistakes")
        .eq("user_id", user_id)
        .eq("status", "closed")
        .execute()
    )
    trades = result.data or []

    if len(trades) < MIN_TRADES:
        return {
            "min_trades_required": MIN_TRADES,
            "trades_available": len(trades),
            "ready": False,
        }

    day_stats: dict = defaultdict(lambda: {"trades": 0, "wins": 0, "total_pnl": 0.0})
    direction_stats: dict = defaultdict(lambda: {"trades": 0, "wins": 0, "total_pnl": 0.0})
    holding_buckets: dict = {
        "Intraday (0d)": {"trades": 0, "wins": 0},
        "Short (1-3d)":  {"trades": 0, "wins": 0},
        "Swing (4-10d)": {"trades": 0, "wins": 0},
        "Position (11d+)": {"trades": 0, "wins": 0},
    }

    win_hold: list[int] = []
    loss_hold: list[int] = []
    rr_values: list[float] = []
    mistake_notes: list[str] = []
    setup_stats: dict[str, dict[str, float]] = defaultdict(lambda: {"trades": 0, "wins": 0, "total_pnl": 0.0})

    for t in trades:
        pnl = _num(t.get("pnl"))
        win = pnl > 0
        setup = t.get("setup_type") or "Untagged"
        setup_stats[setup]["trades"] += 1
        setup_stats[setup]["total_pnl"] += pnl
        if win:
            setup_stats[setup]["wins"] += 1
        if t.get("risk_reward") is not None:
            rr_values.append(_num(t.get("risk_reward")))
        if str(t.get("mistakes") or "").strip():
            mistake_notes.append(str(t.get("mistakes")).strip())

        entry_day = _date(t.get("entry_date"))
        if entry_day:
            day_name = entry_day.strftime("%A")
            day_stats[day_name]["trades"] += 1
            day_stats[day_name]["total_pnl"] += pnl
            if win:
                day_stats[day_name]["wins"] += 1

        direction = t.get("trade_type") or "long"
        direction_stats[direction]["trades"] += 1
        direction_stats[direction]["total_pnl"] += pnl
        if win:
            direction_stats[direction]["wins"] += 1

        hd = int(_num(t.get("holding_days")))
        bucket = _holding_bucket(hd)
        holding_buckets[bucket]["trades"] += 1
        if win:
            holding_buckets[bucket]["wins"] += 1

        if win:
            win_hold.append(hd)
        else:
            loss_hold.append(hd)

    avg_win_hold = round(sum(win_hold) / len(win_hold), 1) if win_hold else None
    avg_loss_hold = round(sum(loss_hold) / len(loss_hold), 1) if loss_hold else None

    day_order = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
    day_of_week = [
        {
            "day": day,
            "trades": day_stats[day]["trades"],
            "wins": day_stats[day]["wins"],
            "win_rate": round(day_stats[day]["wins"] / day_stats[day]["trades"] * 100, 1)
            if day_stats[day]["trades"] > 0 else 0,
            "total_pnl": round(day_stats[day]["total_pnl"], 2),
        }
        for day in day_order if day_stats[day]["trades"] > 0
    ]

    by_direction = [
        {
            "direction": d.capitalize(),
            "trades": v["trades"],
            "wins": v["wins"],
            "win_rate": round(v["wins"] / v["trades"] * 100, 1) if v["trades"] else 0,
            "total_pnl": round(v["total_pnl"], 2),
        }
        for d, v in direction_stats.items()
    ]

    by_holding = [
        {
            "bucket": b,
            "trades": v["trades"],
            "wins": v["wins"],
            "win_rate": round(v["wins"] / v["trades"] * 100, 1) if v["trades"] else 0,
        }
        for b, v in holding_buckets.items()
        if v["trades"] > 0
    ]

    best_setup = None
    if setup_stats:
        setup_rows = [
            (
                setup,
                int(values["trades"]),
                round(values["wins"] / values["trades"] * 100, 1) if values["trades"] else 0,
                round(values["total_pnl"], 2),
            )
            for setup, values in setup_stats.items()
        ]
        best_setup = sorted(setup_rows, key=lambda row: (row[3], row[2], row[1]), reverse=True)[0]

    worst_day = min(day_of_week, key=lambda row: row["total_pnl"], default=None)
    worst_bucket = min(
        (
            {
                **bucket,
                "total_pnl": round(sum(_num(t.get("pnl")) for t in trades if _holding_bucket(int(_num(t.get("holding_days")))) == bucket["bucket"]), 2),
            }
            for bucket in by_holding
        ),
        key=lambda row: row["total_pnl"],
        default=None,
    )
    avg_rr = round(sum(rr_values) / len(rr_values), 2) if rr_values else None
    weak_rr = sum(1 for value in rr_values if value < 2)
    untagged = int(setup_stats.get("Untagged", {}).get("trades", 0))

    next_tip = "Keep closing trades with setup, risk, exit reason, and lesson notes to sharpen review quality."
    if untagged:
        next_tip = f"Tag {untagged} untagged closed trade{'s' if untagged != 1 else ''} so setup quality becomes measurable."
    elif avg_rr is not None and weak_rr:
        next_tip = f"Tighten pre-trade filtering: {weak_rr} closed trade{'s' if weak_rr != 1 else ''} had planned R:R below 2."
    elif avg_loss_hold is not None and avg_win_hold is not None and avg_loss_hold > avg_win_hold:
        next_tip = "Review exit rules: losing trades are being held longer than winners."

    coaching_cards = [
        {
            "label": "Repeated mistakes",
            "value": f"{len(mistake_notes)} noted",
            "detail": mistake_notes[-1][:140] if mistake_notes else "No repeated mistake notes yet; add close-review notes to expose behavior patterns.",
            "tone": "warn" if mistake_notes else "neutral",
        },
        {
            "label": "Best setup type",
            "value": best_setup[0] if best_setup else "Not enough data",
            "detail": f"{best_setup[1]} trades, {best_setup[2]}% win rate, {_format_money(best_setup[3])} P&L." if best_setup else "Tag closed trades with setup type to identify your edge.",
            "tone": "gain" if best_setup and best_setup[3] >= 0 else "neutral",
        },
        {
            "label": "Worst behavior",
            "value": worst_day["day"] if worst_day and worst_day["total_pnl"] < 0 else (worst_bucket["bucket"] if worst_bucket and worst_bucket["total_pnl"] < 0 else "No clear leak"),
            "detail": (
                f"{worst_day['day']} entries are at {_format_money(worst_day['total_pnl'])}."
                if worst_day and worst_day["total_pnl"] < 0
                else f"{worst_bucket['bucket']} trades are at {_format_money(worst_bucket['total_pnl'])}."
                if worst_bucket and worst_bucket["total_pnl"] < 0
                else "No negative cluster is strong enough yet."
            ),
            "tone": "loss" if (worst_day and worst_day["total_pnl"] < 0) or (worst_bucket and worst_bucket["total_pnl"] < 0) else "neutral",
        },
        {
            "label": "Risk/reward discipline",
            "value": f"Avg {avg_rr}:1" if avg_rr is not None else "Missing",
            "detail": f"{weak_rr} closed trade{'s' if weak_rr != 1 else ''} below 2:1 planned R:R." if avg_rr is not None else "Add stop and target before entry so R:R can be audited.",
            "tone": "gain" if avg_rr is not None and avg_rr >= 2 and weak_rr == 0 else "warn",
        },
        {
            "label": "Holding time insight",
            "value": (
                f"W {avg_win_hold}d / L {avg_loss_hold}d"
                if avg_win_hold is not None and avg_loss_hold is not None
                else "Incomplete"
            ),
            "detail": (
                "Losers are held longer than winners; review exit discipline."
                if avg_loss_hold is not None and avg_win_hold is not None and avg_loss_hold > avg_win_hold
                else "Winner and loser holding periods are not showing a major leak yet."
                if avg_win_hold is not None and avg_loss_hold is not None
                else "Close more trades with dates to compare winner and loser hold times."
            ),
            "tone": "loss" if avg_loss_hold is not None and avg_win_hold is not None and avg_loss_hold > avg_win_hold else "neutral",
        },
        {
            "label": "Next improvement tip",
            "value": "Process",
            "detail": next_tip,
            "tone": "accent",
        },
    ]

    return {
        "ready": True,
        "total_trades": len(trades),
        "avg_hold_winners": avg_win_hold,
        "avg_hold_losers":  avg_loss_hold,
        "day_of_week":      day_of_week,
        "by_direction":     by_direction,
        "by_holding_period": by_holding,
        "coaching_cards": coaching_cards,
    }
