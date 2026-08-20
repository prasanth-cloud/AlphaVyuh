from __future__ import annotations

import asyncio
import os
from uuid import UUID

import pytest
from fastapi import HTTPException

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")

from app.routers import setup_review as setup_review_router
from app.services.setup_review import default_rule_definitions, evaluate_setup


SETUP_ID = UUID("00000000-0000-4000-8000-000000000001")


def _complete_setup(**overrides):
    setup = {
        "id": str(SETUP_ID),
        "user_id": "user-1",
        "symbol": "TCS",
        "direction": "long",
        "entry_low": 100.0,
        "entry_high": 100.0,
        "stop_price": 95.0,
        "target_price": 110.0,
        "planned_quantity": 10,
        "planned_risk_amount": 50.0,
        "thesis": "Breakout after a controlled pullback.",
        "invalidation_reason": "Close below the base.",
    }
    setup.update(overrides)
    return setup


def test_complete_setup_passes_starter_rules() -> None:
    review = evaluate_setup(_complete_setup(), default_rule_definitions())

    assert review["overall_status"] == "passed"
    assert review["can_proceed"] is True
    assert all(result["status"] == "pass" for result in review["results"])


def test_invalid_geometry_is_a_hard_block() -> None:
    review = evaluate_setup(_complete_setup(target_price=98.0), default_rule_definitions())

    assert review["overall_status"] == "blocked"
    assert review["can_proceed"] is False
    geometry = next(result for result in review["results"] if result["code"] == "plan_geometry")
    assert geometry["severity"] == "block"
    assert geometry["status"] == "fail"


def test_check_failure_needs_override_before_proceeding() -> None:
    rules = default_rule_definitions()
    review = evaluate_setup(_complete_setup(invalidation_reason=""), rules)

    assert review["overall_status"] == "warned"
    assert review["can_proceed"] is False


def test_account_risk_budget_is_evaluated_when_equity_is_available() -> None:
    rules = default_rule_definitions(max_account_risk_pct=1.0)
    review = evaluate_setup(_complete_setup(), rules, account_equity=1_000)

    assert review["overall_status"] == "blocked" or review["overall_status"] == "warned"
    result = next(result for result in review["results"] if result["code"] == "max_account_risk_pct")
    assert result["status"] == "fail"
    assert result["actual"] == 5.0


class _Result:
    def __init__(self, data):
        self.data = data


class _Query:
    def __init__(self, client, table_name):
        self.client = client
        self.table_name = table_name
        self.filters = {}
        self.payload = None
        self.payloads = None
        self.single = False

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, key, value):
        self.filters[key] = value
        return self

    def order(self, *_args, **_kwargs):
        return self

    def limit(self, *_args, **_kwargs):
        return self

    def maybe_single(self):
        self.single = True
        return self

    def insert(self, payload):
        if isinstance(payload, list):
            self.payloads = payload
        else:
            self.payload = payload
        return self

    def upsert(self, payload, **_kwargs):
        if isinstance(payload, list):
            self.payloads = payload
        else:
            self.payload = payload
        return self

    def update(self, payload):
        self.payload = payload
        return self

    def execute(self):
        if self.payload is not None and self.table_name == "rulebooks" and self.filters:
            rows = self.client.rows.get(self.table_name, [])
            matches = [
                row for row in rows
                if all(str(row.get(key)) == str(value) for key, value in self.filters.items())
            ]
            for row in matches:
                row.update(self.payload)
            return _Result(matches)
        if self.payload is not None and self.table_name == "rulebooks":
            row = {"id": "00000000-0000-4000-8000-000000000002", "created_at": "2026-08-20T00:00:00Z", **self.payload}
            self.client.rows[self.table_name] = [row]
            return _Result([row])
        if self.payloads is not None and self.table_name == "rulebook_rules":
            rows = [{"id": f"rule-{index}", **payload} for index, payload in enumerate(self.payloads)]
            self.client.rows[self.table_name] = rows
            return _Result(rows)
        if self.payload is not None and self.table_name == "setup_rule_evaluations":
            row = {"id": "00000000-0000-4000-8000-000000000003", **self.payload}
            self.client.rows[self.table_name] = [row]
            return _Result([row])
        if self.payload is not None and self.table_name == "setups":
            for row in self.client.rows[self.table_name]:
                if all(str(row.get(key)) == str(value) for key, value in self.filters.items()):
                    row.update(self.payload)
            return _Result([])

        rows = self.client.rows.get(self.table_name, [])
        matches = [
            row for row in rows
            if all(str(row.get(key)) == str(value) for key, value in self.filters.items())
        ]
        return _Result((matches[0] if matches else None) if self.single else matches)


class _Client:
    def __init__(self):
        self.rows = {"setups": [_complete_setup()], "rulebooks": [], "rulebook_rules": [], "setup_rule_evaluations": []}

    def table(self, table_name):
        return _Query(self, table_name)


def test_review_endpoint_records_evaluation_and_updates_setup(monkeypatch) -> None:
    client = _Client()
    monkeypatch.setattr(setup_review_router, "get_user_client", lambda _jwt: client)

    result = asyncio.run(
        setup_review_router.review_setup(
            SETUP_ID,
            setup_review_router.SetupReviewRequest(),
            user_id="user-1",
            user_jwt="jwt-user-1",
        )
    )

    assert result["overall_status"] == "passed"
    assert result["can_proceed"] is True
    assert client.rows["setups"][0]["review_status"] == "passed"
    assert client.rows["setup_rule_evaluations"][0]["setup_id"] == str(SETUP_ID)


def test_review_endpoint_requires_override_for_warning(monkeypatch) -> None:
    client = _Client()
    client.rows["setups"][0]["invalidation_reason"] = ""
    monkeypatch.setattr(setup_review_router, "get_user_client", lambda _jwt: client)

    without_override = asyncio.run(
        setup_review_router.review_setup(
            SETUP_ID,
            setup_review_router.SetupReviewRequest(),
            user_id="user-1",
            user_jwt="jwt-user-1",
        )
    )
    with_override = asyncio.run(
        setup_review_router.review_setup(
            SETUP_ID,
            setup_review_router.SetupReviewRequest(override_reason="Invalidation is monitored manually."),
            user_id="user-1",
            user_jwt="jwt-user-1",
        )
    )

    assert without_override["overall_status"] == "warned"
    assert without_override["can_proceed"] is False
    assert with_override["overall_status"] == "warned"
    assert with_override["can_proceed"] is True


def test_review_endpoint_scopes_setup_to_user(monkeypatch) -> None:
    client = _Client()
    monkeypatch.setattr(setup_review_router, "get_user_client", lambda _jwt: client)

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(
            setup_review_router.review_setup(
                SETUP_ID,
                setup_review_router.SetupReviewRequest(),
                user_id="different-user",
                user_jwt="jwt-different-user",
            )
        )

    assert exc_info.value.status_code == 404
