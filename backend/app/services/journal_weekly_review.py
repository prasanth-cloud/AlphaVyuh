"""Evidence-backed aggregation of completed journal weeks."""

from __future__ import annotations

from collections import defaultdict
from datetime import UTC, date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo


WEEK_TIMEZONE = "Asia/Kolkata"
WEEK_BASIS = "exit_date_monday_sunday"
ADHERENCE_VALUES = ("followed", "partial", "not_followed", "not_applicable")
RULE_BREAK_CODES = (
    "setup_not_confirmed",
    "entry_outside_plan",
    "position_risk_exceeded",
    "stop_rule_broken",
    "exit_rule_broken",
    "other",
)


class EvidenceScopeMismatch(ValueError):
    """Requested evidence was not wholly available inside the scoped ledger."""


def current_market_date(now: datetime | None = None) -> date:
    instant = now or datetime.now(UTC)
    if instant.tzinfo is None:
        instant = instant.replace(tzinfo=UTC)
    return instant.astimezone(ZoneInfo(WEEK_TIMEZONE)).date()


def completed_week_period(today: date, weeks: int) -> tuple[date, date]:
    """Return completed Monday-Sunday market-date boundaries.

    trade_journal.exit_date is a date without time zone. AlphaVyuh treats these
    as Asia/Kolkata market-calendar dates and never browser-regroups them.
    """
    current_week_start = today - timedelta(days=today.weekday())
    period_end = current_week_start - timedelta(days=1)
    period_start = period_end - timedelta(days=(weeks * 7) - 1)
    return period_start, period_end


def fetch_completed_trade_rows_snapshot(
    client: Any,
    user_id: str,
    period_start: date,
    period_end: date,
    entry_date_cutoff: date | None,
) -> list[dict[str, Any]]:
    result = client.rpc(
        "get_journal_weekly_review_rows",
        {
            "p_user_id": user_id,
            "p_period_start": period_start.isoformat(),
            "p_period_end": period_end.isoformat(),
            "p_entry_date_cutoff": (
                entry_date_cutoff.isoformat() if entry_date_cutoff is not None else None
            ),
        },
    ).execute()
    raw_rows = result.data
    if not isinstance(raw_rows, list):
        raise ValueError("weekly review RPC returned a non-list payload")

    rows: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    for raw in raw_rows:
        if not isinstance(raw, dict):
            raise ValueError("weekly review RPC returned a malformed row")
        entry_id = raw.get("id")
        symbol = raw.get("symbol")
        if not isinstance(entry_id, str) or not entry_id or entry_id in seen_ids:
            raise ValueError("weekly review RPC returned an invalid entry id")
        if not isinstance(symbol, str) or not symbol:
            raise ValueError("weekly review RPC returned an invalid symbol")
        try:
            exit_date = date.fromisoformat(str(raw.get("exit_date")))
        except ValueError as exc:
            raise ValueError("weekly review RPC returned an invalid exit date") from exc
        if not period_start <= exit_date <= period_end:
            raise ValueError("weekly review RPC returned an out-of-period row")
        if entry_date_cutoff is not None:
            try:
                entry_date = date.fromisoformat(str(raw.get("entry_date")))
            except ValueError as exc:
                raise ValueError("weekly review RPC returned an invalid entry date") from exc
            if entry_date < entry_date_cutoff:
                raise ValueError("weekly review RPC returned a history-ineligible row")
        seen_ids.add(entry_id)
        rows.append(dict(raw))
    return rows


def fetch_week_evidence_snapshot(
    client: Any,
    user_id: str,
    week_start: date,
    week_end: date,
    entry_ids: list[str],
    rule_break: str | None,
    entry_date_cutoff: date | None,
) -> list[dict[str, Any]]:
    result = client.rpc(
        "get_journal_weekly_review_evidence",
        {
            "p_user_id": user_id,
            "p_week_start": week_start.isoformat(),
            "p_week_end": week_end.isoformat(),
            "p_entry_ids": entry_ids,
            "p_rule_break": rule_break,
            "p_entry_date_cutoff": (
                entry_date_cutoff.isoformat() if entry_date_cutoff is not None else None
            ),
        },
    ).execute()
    raw_rows = result.data
    if not isinstance(raw_rows, list):
        raise ValueError("weekly evidence RPC returned a non-list payload")

    requested = set(entry_ids)
    rows: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    for raw in raw_rows:
        if not isinstance(raw, dict):
            raise ValueError("weekly evidence RPC returned a malformed row")
        entry_id = raw.get("id")
        if not isinstance(entry_id, str) or entry_id not in requested or entry_id in seen_ids:
            raise ValueError("weekly evidence RPC returned an invalid entry id")
        if raw.get("user_id") != user_id or raw.get("status") != "closed":
            raise ValueError("weekly evidence RPC returned an unauthorized row")
        try:
            exit_date = date.fromisoformat(str(raw.get("exit_date")))
        except ValueError as exc:
            raise ValueError("weekly evidence RPC returned an invalid exit date") from exc
        if not week_start <= exit_date <= week_end:
            raise ValueError("weekly evidence RPC returned an out-of-week row")
        if entry_date_cutoff is not None:
            try:
                entry_date = date.fromisoformat(str(raw.get("entry_date")))
            except ValueError as exc:
                raise ValueError("weekly evidence RPC returned an invalid entry date") from exc
            if entry_date < entry_date_cutoff:
                raise ValueError("weekly evidence RPC returned a history-ineligible row")
        stored_breaks = raw.get("review_rule_breaks")
        if rule_break is not None and (
            not isinstance(stored_breaks, list) or rule_break not in stored_breaks
        ):
            raise ValueError("weekly evidence RPC returned a rule-break mismatch")
        seen_ids.add(entry_id)
        rows.append(dict(raw))
    if seen_ids != requested:
        raise EvidenceScopeMismatch("requested evidence did not fully match the scoped ledger")
    return rows


def _clean_review(row: dict[str, Any]) -> dict[str, Any] | None:
    if row.get("review_schema_version") != 1:
        return None
    planned_setup = row.get("review_planned_setup")
    adherence = row.get("review_setup_adherence")
    rule_breaks = row.get("review_rule_breaks")
    lesson = row.get("review_lesson")
    if (
        not isinstance(planned_setup, str)
        or not planned_setup.strip()
        or len(planned_setup.strip()) > 80
    ):
        return None
    if adherence not in ADHERENCE_VALUES:
        return None
    if (
        not isinstance(rule_breaks, list)
        or len(rule_breaks) > 6
        or any(not isinstance(code, str) or code not in RULE_BREAK_CODES for code in rule_breaks)
    ):
        return None
    if len(rule_breaks) != len(set(rule_breaks)):
        return None
    if adherence in {"followed", "not_applicable"} and rule_breaks:
        return None
    if adherence in {"partial", "not_followed"} and not rule_breaks:
        return None
    if not isinstance(lesson, str) or not lesson.strip() or len(lesson.strip()) > 500:
        return None
    return {
        "planned_setup": planned_setup.strip(),
        "setup_adherence": adherence,
        "rule_breaks": rule_breaks,
        "lesson": lesson.strip(),
    }


def build_weekly_review_response(
    rows: list[dict[str, Any]],
    period_start: date,
    period_end: date,
    *,
    generated_at: datetime | None = None,
) -> dict[str, Any]:
    week_rows: dict[date, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        try:
            exit_date = date.fromisoformat(str(row.get("exit_date")))
        except ValueError:
            continue
        if period_start <= exit_date <= period_end:
            week_start = exit_date - timedelta(days=exit_date.weekday())
            week_rows[week_start].append(row)

    weeks: list[dict[str, Any]] = []
    for week_start in sorted(week_rows, reverse=True):
        entries = week_rows[week_start]
        adherence_counts = {value: 0 for value in ADHERENCE_VALUES}
        breaks: dict[str, list[str]] = defaultdict(list)
        supporting_entries: list[dict[str, Any]] = []
        reviewed = 0

        for row in entries:
            review = _clean_review(row)
            entry_id = str(row.get("id") or "")
            if review is None:
                supporting_entries.append({
                    "entry_id": entry_id,
                    "symbol": str(row.get("symbol") or ""),
                    "exit_date": str(row.get("exit_date") or ""),
                    "planned_setup": None,
                    "review_status": "unreviewed",
                    "setup_adherence": None,
                    "rule_breaks": [],
                    "lesson": None,
                })
                continue

            reviewed += 1
            adherence_counts[review["setup_adherence"]] += 1
            for code in review["rule_breaks"]:
                breaks[code].append(entry_id)
            supporting_entries.append({
                "entry_id": entry_id,
                "symbol": str(row.get("symbol") or ""),
                "exit_date": str(row.get("exit_date") or ""),
                "planned_setup": review["planned_setup"],
                "review_status": "reviewed",
                "setup_adherence": review["setup_adherence"],
                "rule_breaks": review["rule_breaks"],
                "lesson": review["lesson"],
            })

        supporting_entries.sort(key=lambda item: (item["exit_date"], item["entry_id"]))
        weeks.append({
            "week_start": week_start.isoformat(),
            "week_end": (week_start + timedelta(days=6)).isoformat(),
            "closed_trades": len(entries),
            "reviewed_trades": reviewed,
            "unreviewed_trades": len(entries) - reviewed,
            "adherence": {
                **adherence_counts,
                "denominator": reviewed - adherence_counts["not_applicable"],
            },
            "rule_breaks": [
                {"code": code, "count": len(entry_ids), "entry_ids": entry_ids}
                for code, entry_ids in sorted(breaks.items())
            ],
            "supporting_entries": supporting_entries,
        })

    generated = (generated_at or datetime.now(UTC)).astimezone(UTC)
    return {
        "schema_version": 1,
        "generated_at": generated.isoformat().replace("+00:00", "Z"),
        "timezone": WEEK_TIMEZONE,
        "week_basis": WEEK_BASIS,
        "completed_weeks_only": True,
        "period_start": period_start.isoformat(),
        "period_end": period_end.isoformat(),
        "coverage_complete": True,
        "weeks": weeks,
    }
