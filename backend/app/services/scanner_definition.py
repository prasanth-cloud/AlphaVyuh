"""Validation helpers for normalized scanner definitions.

The visual scanner builder deliberately exposes a small, validated EOD filter
set. Keeping the allow-list at the API boundary prevents a definition from
persisting a key that the scanner engine cannot evaluate safely.
"""

from __future__ import annotations

from typing import Any


SCANNER_DEFINITION_NUMERIC_FILTERS = frozenset({
    "price_min",
    "price_max",
    "volume_ratio_min",
    "avg_volume_50d_min",
    "rsi_min",
    "week_52_high_pct_max",
    "rs_score_min",
    "market_cap_min",
    "pe_max",
    "roe_min",
    "roce_min",
    "debt_to_equity_max",
})

SCANNER_DEFINITION_SELECT_FILTERS = {
    "price_vs_sma50": frozenset({"above", "below"}),
    "price_vs_ema50": frozenset({"above", "below"}),
}

SCANNER_DEFINITION_FILTERS = (
    SCANNER_DEFINITION_NUMERIC_FILTERS
    | frozenset(SCANNER_DEFINITION_SELECT_FILTERS)
)


def _unwrap_filter_value(value: Any) -> Any:
    if not isinstance(value, dict):
        return value
    if "value" in value:
        return value["value"]
    if "min" in value and len(value) == 1:
        return value["min"]
    if "max" in value and len(value) == 1:
        return value["max"]
    return value


def normalize_scanner_filter_value(kind: str, value: Any) -> float | str:
    """Return a typed value or raise for an unsupported/malformed filter."""

    if kind not in SCANNER_DEFINITION_FILTERS:
        raise ValueError(f"Unsupported scanner definition filter: {kind}")

    value = _unwrap_filter_value(value)
    if value is None or value == "" or isinstance(value, bool):
        raise ValueError(f"Missing value for scanner definition filter: {kind}")

    if kind in SCANNER_DEFINITION_NUMERIC_FILTERS:
        try:
            number = float(value)
        except (TypeError, ValueError) as exc:
            raise ValueError(f"Numeric value required for scanner definition filter: {kind}") from exc
        if not number == number or number in {float("inf"), float("-inf")}:
            raise ValueError(f"Finite numeric value required for scanner definition filter: {kind}")
        return int(number) if number.is_integer() else number

    normalized = str(value).strip()
    if normalized not in SCANNER_DEFINITION_SELECT_FILTERS[kind]:
        raise ValueError(f"Invalid value for scanner definition filter: {kind}")
    return normalized


def normalize_scanner_definition_groups(groups: Any) -> list[dict[str, Any]]:
    """Validate and normalize the persisted group/filter tree."""

    if not isinstance(groups, list):
        raise ValueError("Scanner definition groups must be a list")

    normalized_groups: list[dict[str, Any]] = []
    for group in groups:
        if not isinstance(group, dict):
            raise ValueError("Scanner definition group must be an object")
        operator = group.get("operator", "and")
        if operator not in {"and", "or"}:
            raise ValueError("Scanner definition group operator must be and or or")
        filters = group.get("filters")
        if not isinstance(filters, list) or not filters:
            raise ValueError("Scanner definition groups must contain at least one filter")

        normalized_filters: list[dict[str, Any]] = []
        for scanner_filter in filters:
            if not isinstance(scanner_filter, dict):
                raise ValueError("Scanner definition filter must be an object")
            kind = scanner_filter.get("kind")
            if not isinstance(kind, str) or not kind.strip():
                raise ValueError("Scanner definition filter kind is required")
            kind = kind.strip()
            normalized_filters.append({
                **scanner_filter,
                "kind": kind,
                "value": normalize_scanner_filter_value(kind, scanner_filter.get("value")),
            })

        normalized_groups.append({
            **group,
            "operator": operator,
            "filters": normalized_filters,
        })

    return normalized_groups
