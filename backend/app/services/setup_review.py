"""Deterministic, non-advisory setup rule evaluation.

The evaluator accepts plain mappings so it can be used by the API, unit tests,
and future import/replay jobs without coupling the business rules to Supabase.
It only evaluates a user's recorded plan; it never creates a trade signal or
places an order.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from typing import Any

DEFAULT_MIN_PLANNED_RR = 2.0


def default_rule_definitions(
    *,
    min_planned_rr: float = DEFAULT_MIN_PLANNED_RR,
    max_risk_amount: float | None = None,
    max_account_risk_pct: float | None = None,
) -> list[dict[str, Any]]:
    """Return the starter discipline template used for a new rulebook."""
    rules: list[dict[str, Any]] = [
        {
            "code": "plan_geometry",
            "label": "Entry, stop, and target geometry",
            "severity": "block",
            "config": {},
            "enabled": True,
            "sort_order": 10,
        },
        {
            "code": "positive_risk",
            "label": "Positive risk per share",
            "severity": "block",
            "config": {},
            "enabled": True,
            "sort_order": 20,
        },
        {
            "code": "quantity_set",
            "label": "Position size is set",
            "severity": "block",
            "config": {},
            "enabled": True,
            "sort_order": 30,
        },
        {
            "code": "minimum_rr",
            "label": "Minimum planned reward-to-risk",
            "severity": "block",
            "config": {"min_rr": min_planned_rr},
            "enabled": True,
            "sort_order": 40,
        },
        {
            "code": "written_thesis",
            "label": "Written trade thesis",
            "severity": "block",
            "config": {},
            "enabled": True,
            "sort_order": 50,
        },
        {
            "code": "invalidation_defined",
            "label": "Invalidation condition",
            "severity": "check",
            "config": {},
            "enabled": True,
            "sort_order": 60,
        },
    ]
    if max_risk_amount is not None:
        rules.append(
            {
                "code": "max_risk_amount",
                "label": "Maximum planned risk amount",
                "severity": "warn",
                "config": {"max_risk_amount": max_risk_amount},
                "enabled": True,
                "sort_order": 70,
            }
        )
    if max_account_risk_pct is not None:
        rules.append(
            {
                "code": "max_account_risk_pct",
                "label": "Maximum account risk percentage",
                "severity": "warn",
                "config": {"max_account_risk_pct": max_account_risk_pct},
                "enabled": True,
                "sort_order": 80,
            }
        )
    return rules


def _number(value: Any) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    return result if result == result else None


def _entry(setup: Mapping[str, Any]) -> float | None:
    low = _number(setup.get("entry_low"))
    high = _number(setup.get("entry_high"))
    if low is not None and high is not None:
        return (low + high) / 2
    return low if low is not None else high


def _risk_and_reward(setup: Mapping[str, Any]) -> tuple[float | None, float | None]:
    entry = _entry(setup)
    stop = _number(setup.get("stop_price"))
    target = _number(setup.get("target_price"))
    direction = str(setup.get("direction") or "").lower()
    if entry is None or stop is None or target is None:
        return None, None
    if direction == "long":
        return entry - stop, target - entry
    if direction == "short":
        return stop - entry, entry - target
    return None, None


def _rule_result(
    rule: Mapping[str, Any],
    *,
    status: str,
    message: str,
    actual: Any = None,
    expected: Any = None,
) -> dict[str, Any]:
    config = rule.get("config")
    return {
        "code": str(rule.get("code") or "unknown"),
        "label": str(rule.get("label") or rule.get("code") or "Rule"),
        "severity": str(rule.get("severity") or "check"),
        "status": status,
        "message": message,
        "actual": actual,
        "expected": expected,
        "config": config if isinstance(config, dict) else {},
    }


def _evaluate_rule(
    setup: Mapping[str, Any],
    rule: Mapping[str, Any],
    *,
    account_equity: float | None,
) -> dict[str, Any]:
    code = str(rule.get("code") or "").strip().lower()
    config = rule.get("config") if isinstance(rule.get("config"), dict) else {}
    entry = _entry(setup)
    stop = _number(setup.get("stop_price"))
    target = _number(setup.get("target_price"))
    direction = str(setup.get("direction") or "").lower()
    risk, reward = _risk_and_reward(setup)
    planned_rr = (reward / risk) if risk is not None and reward is not None and risk > 0 else None
    quantity = _number(setup.get("planned_quantity"))
    planned_risk = _number(setup.get("planned_risk_amount"))

    if code == "plan_geometry":
        valid = (
            entry is not None
            and stop is not None
            and target is not None
            and direction in {"long", "short"}
            and (
                (direction == "long" and stop < entry < target)
                or (direction == "short" and target < entry < stop)
            )
        )
        return _rule_result(
            rule,
            status="pass" if valid else "fail",
            message="Plan levels match the selected direction." if valid else "Entry, stop, and target must be present and ordered for the selected direction.",
            actual={"direction": direction or None, "entry": entry, "stop": stop, "target": target},
            expected="long: stop < entry < target; short: target < entry < stop",
        )

    if code == "positive_risk":
        valid = risk is not None and risk > 0
        return _rule_result(
            rule,
            status="pass" if valid else "fail",
            message="Risk per share is positive." if valid else "A positive risk distance is required.",
            actual=risk,
            expected="> 0",
        )

    if code == "quantity_set":
        valid = quantity is not None and quantity > 0 and quantity.is_integer()
        return _rule_result(
            rule,
            status="pass" if valid else "fail",
            message="Position size is set." if valid else "Position size must be a positive whole number.",
            actual=quantity,
            expected="positive integer",
        )

    if code == "minimum_rr":
        minimum = _number(config.get("min_rr")) or DEFAULT_MIN_PLANNED_RR
        valid = planned_rr is not None and planned_rr >= minimum
        return _rule_result(
            rule,
            status="pass" if valid else "fail",
            message=f"Planned R:R is {planned_rr:.2f}." if planned_rr is not None else "Planned R:R cannot be calculated.",
            actual=round(planned_rr, 4) if planned_rr is not None else None,
            expected=f">= {minimum:g}",
        )

    if code == "written_thesis":
        thesis = str(setup.get("thesis") or "").strip()
        valid = bool(thesis)
        return _rule_result(
            rule,
            status="pass" if valid else "fail",
            message="Trade thesis is recorded." if valid else "Write the reason for taking the trade.",
            actual=bool(thesis),
            expected=True,
        )

    if code == "invalidation_defined":
        invalidation = str(setup.get("invalidation_reason") or "").strip()
        valid = bool(invalidation)
        return _rule_result(
            rule,
            status="pass" if valid else "fail",
            message="Invalidation condition is recorded." if valid else "Record what would invalidate the plan.",
            actual=bool(invalidation),
            expected=True,
        )

    if code == "max_risk_amount":
        maximum = _number(config.get("max_risk_amount"))
        if maximum is None:
            return _rule_result(rule, status="not_evaluated", message="No maximum risk amount is configured.")
        valid = planned_risk is not None and planned_risk <= maximum
        return _rule_result(
            rule,
            status="pass" if valid else "fail",
            message="Planned risk is within the rulebook budget." if valid else "Planned risk exceeds the rulebook budget.",
            actual=planned_risk,
            expected=f"<= {maximum:g}",
        )

    if code == "max_account_risk_pct":
        maximum = _number(config.get("max_account_risk_pct"))
        equity = _number(account_equity)
        if maximum is None:
            return _rule_result(rule, status="not_evaluated", message="No account risk percentage is configured.")
        if equity is None or equity <= 0:
            return _rule_result(rule, status="not_evaluated", message="Account equity is required to evaluate this rule.", expected=f"<= {maximum:g}%")
        actual = (planned_risk / equity * 100) if planned_risk is not None else None
        valid = actual is not None and actual <= maximum
        return _rule_result(
            rule,
            status="pass" if valid else "fail",
            message="Account risk is within the rulebook budget." if valid else "Account risk exceeds the rulebook budget.",
            actual=round(actual, 4) if actual is not None else None,
            expected=f"<= {maximum:g}%",
        )

    return _rule_result(
        rule,
        status="not_evaluated",
        message="This rule is not supported by the current evaluator.",
    )


def evaluate_setup(
    setup: Mapping[str, Any],
    rules: Iterable[Mapping[str, Any]] | None = None,
    *,
    account_equity: float | None = None,
) -> dict[str, Any]:
    """Evaluate a setup and return a serializable review result."""
    active_rules = [
        rule for rule in (rules or default_rule_definitions())
        if rule.get("enabled", True) is True
    ]
    active_rules.sort(key=lambda rule: int(rule.get("sort_order") or 0))
    results = [
        _evaluate_rule(setup, rule, account_equity=account_equity)
        for rule in active_rules
    ]
    blocking_failures = [
        result for result in results
        if result["status"] == "fail" and result["severity"] == "block"
    ]
    advisory_failures = [
        result for result in results
        if result["status"] == "fail" and result["severity"] in {"warn", "check"}
    ]
    if blocking_failures:
        overall_status = "blocked"
        can_proceed = False
        summary = f"{len(blocking_failures)} hard rule(s) block order review."
    elif advisory_failures:
        overall_status = "warned"
        can_proceed = False
        summary = f"{len(advisory_failures)} rule(s) need review or an override reason."
    else:
        overall_status = "passed"
        can_proceed = True
        summary = "All enabled setup rules pass."

    snapshot_risk, snapshot_reward = _risk_and_reward(setup)
    snapshot_rr = (
        snapshot_reward / snapshot_risk
        if snapshot_risk is not None and snapshot_reward is not None and snapshot_risk > 0
        else None
    )
    input_snapshot = {
        "symbol": str(setup.get("symbol") or "").upper(),
        "direction": setup.get("direction"),
        "entry_low": setup.get("entry_low"),
        "entry_high": setup.get("entry_high"),
        "stop_price": setup.get("stop_price"),
        "target_price": setup.get("target_price"),
        "planned_quantity": setup.get("planned_quantity"),
        "planned_risk_amount": setup.get("planned_risk_amount"),
        "planned_rr": round(snapshot_rr, 4) if snapshot_rr is not None else None,
        "account_equity": account_equity,
    }
    return {
        "overall_status": overall_status,
        "can_proceed": can_proceed,
        "summary": summary,
        "results": results,
        "input_snapshot": input_snapshot,
    }
