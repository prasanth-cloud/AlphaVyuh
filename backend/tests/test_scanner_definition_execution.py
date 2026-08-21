"""Tests for normalized scanner-definition execution semantics."""

from __future__ import annotations

import os
import asyncio
from uuid import UUID

import pytest

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")

from app.routers import scanner  # noqa: E402
from app.routers.scanner import ScanFilters, _apply_definition_groups  # noqa: E402
from app.services.scanner_definition import normalize_scanner_definition_groups  # noqa: E402


def _scanner_row(symbol: str, **overrides):
    row = {
        "symbol": symbol,
        "open": 101,
        "high": 110,
        "low": 99,
        "close": 105,
        "prev_close": 100,
        "volume": 100_000,
        "avg_volume_20d": 100_000,
        "avg_volume_50d": 120_000,
        "turnover": 10_000_000,
        "rsi_14": 60,
        "ema_20": 100,
        "ema_50": 95,
        "ema_150": 91,
        "ema_200": 90,
        "ema_200_slope_30d": 2.4,
        "sma_50": 96,
        "sma_150": 92,
        "sma_200": 88,
        "atr_14": 2,
        "week_52_high": 110,
        "week_52_low": 70,
        "rs_score": 80,
        "volume_ratio": 1.0,
        "w52h_pct": None,
        "w52l_pct": None,
        "stock_universe": {
            "company_name": f"{symbol} Ltd",
            "series": "EQ",
            "sector": "Test",
            "is_active": True,
            "market": "NSE",
            "currency": "INR",
            "market_cap_cr": 1200,
            "pe_ratio": 20,
            "roe": 10,
            "roce": 12,
            "debt_to_equity": 0.4,
        },
    }
    row.update(overrides)
    return row


def test_or_group_matches_either_leaf_without_flattening_to_and():
    rows = [
        _scanner_row("PRICE", close=120, rsi_14=40),
        _scanner_row("RSI", close=80, rsi_14=75),
        _scanner_row("NEITHER", close=80, rsi_14=40),
    ]

    results = _apply_definition_groups(
        rows,
        [{
            "operator": "or",
            "filters": [
                {"kind": "price_min", "value": 100},
                {"kind": "rsi_min", "value": 70},
            ],
        }],
        base_filters=ScanFilters(series=["EQ"]),
    )

    assert [result["symbol"] for result in results] == ["PRICE", "RSI"]
    assert any("price_min 100" in reason for reason in results[0]["match_reasons"])
    assert any("rsi_min 70" in reason for reason in results[1]["match_reasons"])


def test_groups_are_combined_with_and():
    rows = [
        _scanner_row("BOTH", close=120, rsi_14=75),
        _scanner_row("FIRST_ONLY", close=120, rsi_14=40),
        _scanner_row("SECOND_ONLY", close=80, rsi_14=75),
    ]

    results = _apply_definition_groups(
        rows,
        [
            {"operator": "or", "filters": [{"kind": "price_min", "value": 100}]},
            {"operator": "and", "filters": [{"kind": "rsi_min", "value": 70}]},
        ],
        base_filters=ScanFilters(series=["EQ"]),
    )

    assert [result["symbol"] for result in results] == ["BOTH"]


def test_definition_normalization_rejects_unsupported_or_empty_filters():
    with pytest.raises(ValueError, match="Unsupported scanner definition filter"):
        normalize_scanner_definition_groups([{
            "operator": "or",
            "filters": [{"kind": "unknown_metric", "value": 1}],
        }])

    with pytest.raises(ValueError, match="at least one filter"):
        normalize_scanner_definition_groups([{"operator": "and", "filters": []}])


class _DefinitionQuery:
    def __init__(self, table_name: str, rows: list[dict]):
        self.table_name = table_name
        self.rows = rows
        self.filters: dict[str, str] = {}

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, key, value):
        self.filters[key] = str(value)
        return self

    def order(self, *_args, **_kwargs):
        return self

    def execute(self):
        return type("Result", (), {
            "data": [
                row for row in self.rows
                if all(str(row.get(key)) == value for key, value in self.filters.items())
            ]
        })()


class _DefinitionClient:
    def __init__(self, definition_id: UUID):
        self.tables = {
            "scanner_definitions": [{
                "id": str(definition_id),
                "user_id": "user-1",
                "universe": "all_nse",
                "definition": {"schema_version": 1},
                "updated_at": "2026-08-20T00:00:00Z",
            }],
            "scanner_filter_groups": [{
                "id": "group-1",
                "user_id": "user-1",
                "scanner_definition_id": str(definition_id),
                "operator": "or",
                "sort_order": 0,
            }],
            "scanner_filters": [{
                "id": "filter-1",
                "user_id": "user-1",
                "group_id": "group-1",
                "kind": "price_min",
                "value": 100,
                "sort_order": 0,
            }],
        }

    def table(self, table_name):
        return _DefinitionQuery(table_name, self.tables.get(table_name, []))


def test_run_scanner_loads_normalized_groups_before_execution(monkeypatch):
    definition_id = UUID("00000000-0000-4000-8000-000000000101")
    client = _DefinitionClient(definition_id)
    captured = {}

    async def fake_execute_scan(client_arg, body, **kwargs):
        captured["client"] = client_arg
        captured["body"] = body
        captured["definition"] = kwargs["definition"]
        return {"results": []}

    monkeypatch.setattr(scanner, "get_admin_client", lambda: client)
    monkeypatch.setattr(scanner, "_get_user_plan", lambda _user_id: "pro")
    monkeypatch.setattr(scanner.scanner_limiter, "is_allowed", lambda _user_id: True)
    monkeypatch.setattr(scanner, "execute_scan", fake_execute_scan)

    result = asyncio.run(scanner.run_scanner(
        scanner.ScanRequest(
            scanner_definition_id=definition_id,
            filters=ScanFilters(series=["EQ"]),
        ),
        user_id="user-1",
        cache_control=None,
    ))

    assert result == {"results": []}
    assert captured["definition"]["groups"][0]["operator"] == "or"
    assert captured["definition"]["groups"][0]["filters"][0]["kind"] == "price_min"
