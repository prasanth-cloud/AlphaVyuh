import asyncio
import json
import os
from copy import deepcopy
from datetime import UTC, date, datetime
from pathlib import Path

import pytest
from fastapi import HTTPException
from pydantic import ValidationError


os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")

from app.routers import journal
from app.services import journal_weekly_review


REPO_ROOT = Path(__file__).resolve().parents[2]
_UNSET = object()


class _Result:
    def __init__(self, data=None):
        self.data = data


class _Query:
    def __init__(self, client):
        self.client = client
        self.filters = {}
        self.lower = None
        self.upper = None
        self.range_bounds = None
        self.update_payload = None

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, field, value):
        self.filters[field] = value
        return self

    def gte(self, field, value):
        assert field == "exit_date"
        self.lower = value
        return self

    def lte(self, field, value):
        assert field == "exit_date"
        self.upper = value
        return self

    def order(self, *_args, **_kwargs):
        return self

    def range(self, start, end):
        self.range_bounds = (start, end)
        self.client.range_calls.append((start, end))
        return self

    def maybe_single(self):
        return self

    def update(self, payload):
        self.update_payload = payload
        return self

    def execute(self):
        if self.client.fail:
            raise RuntimeError("journal database unavailable")
        rows = [deepcopy(row) for row in self.client.rows]
        for field, value in self.filters.items():
            rows = [row for row in rows if row.get(field) == value]
        if self.lower is not None:
            rows = [row for row in rows if str(row.get("exit_date") or "") >= self.lower]
        if self.upper is not None:
            rows = [row for row in rows if str(row.get("exit_date") or "") <= self.upper]

        if self.update_payload is not None:
            self.client.last_update_filters = dict(self.filters)
            if self.client.force_empty_update:
                return _Result([])
            updated = []
            for stored in self.client.rows:
                if all(stored.get(field) == value for field, value in self.filters.items()):
                    stored.update(deepcopy(self.update_payload))
                    stored["updated_at"] = "2026-07-16T13:00:00Z"
                    updated.append(deepcopy(stored))
            return _Result(updated)

        if self.range_bounds is not None:
            start, end = self.range_bounds
            rows = rows[start : end + 1]
        if "id" in self.filters:
            return _Result(rows[0] if rows else None)
        return _Result(rows)


class _Client:
    def __init__(self, rows=None, *, fail=False):
        self.rows = rows or []
        self.fail = fail
        self.force_empty_update = False
        self.last_update_filters = {}
        self.range_calls = []
        self.rpc_calls = []
        self.rpc_override = _UNSET

    def table(self, name):
        assert name == "trade_journal"
        return _Query(self)

    def rpc(self, name, params):
        self.rpc_calls.append((name, deepcopy(params)))
        return _RpcQuery(self, name, params)


class _RpcQuery:
    def __init__(self, client, name, params):
        self.client = client
        self.name = name
        self.params = params

    def execute(self):
        if self.client.fail:
            raise RuntimeError("journal database unavailable")
        if self.client.rpc_override is not _UNSET:
            return _Result(deepcopy(self.client.rpc_override))
        if self.name == "get_journal_weekly_review_rows":
            entry_date_cutoff = self.params["p_entry_date_cutoff"]
            rows = [
                deepcopy(row)
                for row in self.client.rows
                if row.get("user_id") == self.params["p_user_id"]
                and row.get("status") == "closed"
                and self.params["p_period_start"] <= str(row.get("exit_date") or "") <= self.params["p_period_end"]
                and (
                    entry_date_cutoff is None
                    or str(row.get("entry_date") or "") >= entry_date_cutoff
                )
            ]
            return _Result(rows)
        assert self.name == "get_journal_weekly_review_evidence"
        requested = set(self.params["p_entry_ids"])
        rule_break = self.params["p_rule_break"]
        entry_date_cutoff = self.params["p_entry_date_cutoff"]
        rows = [
            deepcopy(row)
            for row in self.client.rows
            if row.get("id") in requested
            and row.get("user_id") == self.params["p_user_id"]
            and row.get("status") == "closed"
            and self.params["p_week_start"] <= str(row.get("exit_date") or "") <= self.params["p_week_end"]
            and (
                entry_date_cutoff is None
                or str(row.get("entry_date") or "") >= entry_date_cutoff
            )
            and (
                rule_break is None
                or rule_break in (row.get("review_rule_breaks") or [])
            )
        ]
        return _Result(rows)


def _review_body(**overrides):
    values = {
        "schema_version": 1,
        "planned_setup": "Breakout",
        "adherence": "followed",
        "rule_breaks": [],
        "lesson": "Wait for the closing confirmation.",
        "expected_updated_at": "2026-07-16T12:00:00Z",
    }
    values.update(overrides)
    return journal.ProcessReviewV1(**values)


def _closed_entry(**overrides):
    row = {
        "id": "journal-1",
        "user_id": "user-1",
        "symbol": "RELIANCE",
        "status": "closed",
        "entry_date": "2026-07-01",
        "exit_date": "2026-07-10",
        "updated_at": "2026-07-16T12:00:00Z",
        "review_schema_version": None,
        "review_planned_setup": None,
        "review_setup_adherence": None,
        "review_rule_breaks": None,
        "review_lesson": None,
    }
    row.update(overrides)
    return row


def test_process_review_is_closed_owner_scoped_server_timed_and_concurrency_safe(monkeypatch):
    user_client = _Client([_closed_entry(lessons="Legacy free-form lesson")])
    admin_client = _Client([_closed_entry(lessons="Legacy free-form lesson")])
    user_tokens = []
    monkeypatch.setattr(
        journal,
        "get_user_client",
        lambda token: user_tokens.append(token) or user_client,
    )
    monkeypatch.setattr(journal, "get_admin_client", lambda: admin_client)

    updated = asyncio.run(
        journal.put_process_review(
            "journal-1", _review_body(), user_id="user-1", user_token="jwt-user-1"
        )
    )

    assert updated["review_schema_version"] == 1
    assert updated["review_lesson"] == "Wait for the closing confirmation."
    assert updated["lessons"] == "Legacy free-form lesson"
    assert updated["planned_setup"] == "Breakout"
    assert updated["setup_adherence"] == "followed"
    assert updated["rule_breaks"] == []
    assert updated["reviewed_at"].endswith("Z")
    assert user_tokens == ["jwt-user-1"]
    assert user_client.last_update_filters == {}
    assert admin_client.last_update_filters == {
        "id": "journal-1",
        "user_id": "user-1",
        "updated_at": "2026-07-16T12:00:00Z",
    }


def test_process_review_rejects_open_cross_user_and_stale_rows(monkeypatch):
    open_client = _Client([_closed_entry(status="open")])
    monkeypatch.setattr(journal, "get_user_client", lambda _token: open_client)
    monkeypatch.setattr(
        journal,
        "get_admin_client",
        lambda: (_ for _ in ()).throw(AssertionError("privileged write must not run")),
    )
    with pytest.raises(HTTPException) as open_error:
        asyncio.run(
            journal.put_process_review(
                "journal-1", _review_body(), user_id="user-1", user_token="jwt-user-1"
            )
        )
    assert open_error.value.status_code == 400

    owner_client = _Client([_closed_entry()])
    monkeypatch.setattr(journal, "get_user_client", lambda _token: owner_client)
    with pytest.raises(HTTPException) as cross_user:
        asyncio.run(
            journal.put_process_review(
                "journal-1", _review_body(), user_id="user-2", user_token="jwt-user-2"
            )
        )
    assert cross_user.value.status_code == 404

    with pytest.raises(HTTPException) as stale:
        asyncio.run(
            journal.put_process_review(
                "journal-1",
                _review_body(expected_updated_at="2026-07-16T11:00:00Z"),
                user_id="user-1",
                user_token="jwt-user-1",
            )
        )
    assert stale.value.status_code == 409

    admin_client = _Client([_closed_entry()])
    admin_client.force_empty_update = True
    monkeypatch.setattr(journal, "get_admin_client", lambda: admin_client)
    with pytest.raises(HTTPException) as raced:
        asyncio.run(
            journal.put_process_review(
                "journal-1", _review_body(), user_id="user-1", user_token="jwt-user-1"
            )
        )
    assert raced.value.status_code == 409


@pytest.mark.parametrize(
    "overrides",
    [
        {"schema_version": 2},
        {"planned_setup": " "},
        {"planned_setup": "x" * 81},
        {"adherence": "maybe"},
        {"adherence": "followed", "rule_breaks": ["entry_outside_plan"]},
        {"adherence": "not_applicable", "rule_breaks": ["other"]},
        {"adherence": "partial", "rule_breaks": []},
        {"adherence": "not_followed", "rule_breaks": []},
        {"adherence": "partial", "rule_breaks": ["other", "other"]},
        {"rule_breaks": ["unknown"]},
        {"lesson": " "},
        {"lesson": "x" * 501},
        {"expected_updated_at": " "},
        {"expected_updated_at": "2026-07-16T12:00:00"},
        {"expected_updated_at": "not-a-timestamp"},
    ],
)
def test_process_review_schema_rejects_malformed_or_inconsistent_payloads(overrides):
    with pytest.raises(ValidationError):
        _review_body(**overrides)


def test_generic_patch_write_sink_remains_owner_scoped_and_checks_result(monkeypatch):
    entry = {
        **_closed_entry(),
        "entry_price": 100,
        "quantity": 1,
        "trade_type": "long",
        "entry_date": "2026-07-01",
    }
    client = _Client([entry])
    monkeypatch.setattr(journal, "get_admin_client", lambda: client)

    asyncio.run(
        journal.update_entry(
            "journal-1", journal.JournalUpdate(lessons="Legacy note"), user_id="user-1"
        )
    )
    assert client.last_update_filters == {"id": "journal-1", "user_id": "user-1"}

    client.force_empty_update = True
    with pytest.raises(HTTPException) as empty_update:
        asyncio.run(
            journal.update_entry(
                "journal-1", journal.JournalUpdate(lessons="Another note"), user_id="user-1"
            )
        )
    assert empty_update.value.status_code == 409


def test_completed_week_boundaries_and_evidence_counts_exclude_current_week_and_pnl():
    # Sunday evening UTC is already Monday in India; use the market date so the
    # just-completed Sunday is included without treating Monday as complete.
    market_date = journal_weekly_review.current_market_date(
        datetime(2026, 7, 12, 20, 0, tzinfo=UTC)
    )
    assert market_date == date(2026, 7, 13)
    _, market_period_end = journal_weekly_review.completed_week_period(market_date, 1)
    assert market_period_end == date(2026, 7, 12)

    period_start, period_end = journal_weekly_review.completed_week_period(
        date(2026, 7, 16), 2
    )
    assert period_start == date(2026, 6, 29)
    assert period_end == date(2026, 7, 12)

    rows = [
        _closed_entry(
            id="followed",
            exit_date="2026-07-06",
            review_schema_version=1,
            review_planned_setup="Breakout",
            review_setup_adherence="followed",
            review_rule_breaks=[],
            review_lesson="Keep the confirmation rule.",
            pnl=999999,
        ),
        _closed_entry(
            id="partial",
            symbol="TCS",
            exit_date="2026-07-12",
            review_schema_version=1,
            review_planned_setup="Pullback",
            review_setup_adherence="partial",
            review_rule_breaks=["entry_outside_plan", "stop_rule_broken"],
            review_lesson="Wait for the planned entry zone.",
            pnl=-999999,
        ),
        _closed_entry(id="unknown", symbol="INFY", exit_date="2026-07-12", lessons="Legacy lesson"),
        _closed_entry(id="current", exit_date="2026-07-13"),
    ]

    result = journal_weekly_review.build_weekly_review_response(
        rows,
        period_start,
        period_end,
        generated_at=datetime(2026, 7, 16, 12, tzinfo=UTC),
    )

    assert result["timezone"] == "Asia/Kolkata"
    assert result["week_basis"] == "exit_date_monday_sunday"
    assert result["period_start"] == "2026-06-29"
    assert result["period_end"] == "2026-07-12"
    week = result["weeks"][0]
    assert week["week_start"] == "2026-07-06"
    assert week["week_end"] == "2026-07-12"
    assert week["closed_trades"] == 3
    assert week["reviewed_trades"] == 2
    assert week["unreviewed_trades"] == 1
    assert week["adherence"] == {
        "followed": 1,
        "partial": 1,
        "not_followed": 0,
        "not_applicable": 0,
        "denominator": 2,
    }
    assert week["rule_breaks"] == [
        {"code": "entry_outside_plan", "count": 1, "entry_ids": ["partial"]},
        {"code": "stop_rule_broken", "count": 1, "entry_ids": ["partial"]},
    ]
    unknown = next(item for item in week["supporting_entries"] if item["entry_id"] == "unknown")
    assert unknown["review_status"] == "unreviewed"
    assert unknown["lesson"] is None
    assert "pnl" not in str(result).lower()
    assert all(item["entry_id"] != "current" for item in week["supporting_entries"])


def test_weekly_snapshot_rpc_fetches_beyond_500_once_and_scopes_owner_period():
    rows = [
        _closed_entry(id=f"entry-{index:03}", exit_date="2026-07-10")
        for index in range(501)
    ]
    rows.extend([
        _closed_entry(id="other-user", user_id="user-2", exit_date="2026-07-10"),
        _closed_entry(id="current-week", exit_date="2026-07-13"),
        _closed_entry(id="open", status="open", exit_date="2026-07-10"),
    ])
    client = _Client(rows)

    fetched = journal_weekly_review.fetch_completed_trade_rows_snapshot(
        client, "user-1", date(2026, 7, 6), date(2026, 7, 12), None
    )

    assert len(fetched) == 501
    assert client.rpc_calls == [
        (
            "get_journal_weekly_review_rows",
            {
                "p_user_id": "user-1",
                "p_period_start": "2026-07-06",
                "p_period_end": "2026-07-12",
                "p_entry_date_cutoff": None,
            },
        )
    ]
    assert {row["id"] for row in fetched} == {f"entry-{index:03}" for index in range(501)}


def test_shared_contract_excludes_not_applicable_from_adherence_denominator():
    contract = json.loads(
        (REPO_ROOT / "tests/fixtures/journal-weekly-review-contract-v1.json").read_text()
    )
    rows = []
    for index, adherence in enumerate(
        ("followed", "partial", "not_followed", "not_applicable")
    ):
        rule_breaks = [] if adherence in {"followed", "not_applicable"} else ["other"]
        rows.append(
            _closed_entry(
                id=f"contract-{index}",
                exit_date="2026-07-10",
                review_schema_version=1,
                review_planned_setup="Contract setup",
                review_setup_adherence=adherence,
                review_rule_breaks=rule_breaks,
                review_lesson="Contract lesson.",
            )
        )

    response = journal_weekly_review.build_weekly_review_response(
        rows,
        date(2026, 7, 6),
        date(2026, 7, 12),
        generated_at=datetime(2026, 7, 16, 12, tzinfo=UTC),
    )

    assert response["schema_version"] == contract["schema_version"]
    assert response["weeks"][0]["reviewed_trades"] == contract["reviewed_trades"]
    assert response["weeks"][0]["adherence"] == contract["adherence"]


def test_weekly_review_outage_returns_503(monkeypatch):
    monkeypatch.setattr(journal, "get_user_client", lambda _token: _Client(fail=True))

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(
            journal.get_weekly_reviews(
                weeks=8, user_id="user-1", user_token="jwt-user-1"
            )
        )

    assert exc_info.value.status_code == 503
    assert exc_info.value.detail == "Weekly journal review is temporarily unavailable."


@pytest.mark.parametrize("payload", [None, {}, ["not-a-row"]])
def test_weekly_review_malformed_snapshot_returns_503(monkeypatch, payload):
    client = _Client()
    client.rpc_override = payload
    monkeypatch.setattr(journal, "get_user_client", lambda _token: client)
    monkeypatch.setattr(journal, "_get_user_plan", lambda _user_id: "premium")

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(
            journal.get_weekly_reviews(
                weeks=8, user_id="user-1", user_token="jwt-user-1"
            )
        )

    assert exc_info.value.status_code == 503
    assert exc_info.value.detail == "Weekly journal review is temporarily unavailable."


@pytest.mark.parametrize(
    ("plan", "expected_closed_trades", "expected_cutoff"),
    [("free", 0, "2026-04-17"), ("premium", 1, None)],
)
def test_weekly_aggregate_applies_plan_history_cutoff_in_snapshot_rpc(
    monkeypatch, plan, expected_closed_trades, expected_cutoff
):
    client = _Client(
        [
            _closed_entry(
                id="old-entry",
                entry_date="2026-01-05",
                exit_date="2026-07-10",
            )
        ]
    )
    plan_calls = []
    user_tokens = []
    monkeypatch.setattr(
        journal,
        "get_user_client",
        lambda token: user_tokens.append(token) or client,
    )
    monkeypatch.setattr(
        journal,
        "_get_user_plan",
        lambda user_id: plan_calls.append(user_id) or plan,
    )
    monkeypatch.setattr(
        journal,
        "_journal_history_cutoff",
        lambda current_plan: date(2026, 4, 17) if current_plan == "free" else None,
    )
    monkeypatch.setattr(journal, "current_market_date", lambda: date(2026, 7, 16))

    response = asyncio.run(
        journal.get_weekly_reviews(
            weeks=1, user_id="user-1", user_token="jwt-user-1"
        )
    )

    assert plan_calls == ["user-1"]
    assert user_tokens == ["jwt-user-1"]
    assert client.rpc_calls == [
        (
            "get_journal_weekly_review_rows",
            {
                "p_user_id": "user-1",
                "p_period_start": "2026-07-06",
                "p_period_end": "2026-07-12",
                "p_entry_date_cutoff": expected_cutoff,
            },
        )
    ]
    actual_closed_trades = response["weeks"][0]["closed_trades"] if response["weeks"] else 0
    assert actual_closed_trades == expected_closed_trades


def _uuid(index: int) -> str:
    return f"00000000-0000-0000-0000-{index:012d}"


def test_weekly_evidence_returns_complete_public_entries(monkeypatch):
    first_id = _uuid(1)
    second_id = _uuid(2)
    client = _Client(
        [
            _closed_entry(
                id=first_id,
                exit_date="2026-07-06",
                review_schema_version=1,
                review_planned_setup="Breakout",
                review_setup_adherence="partial",
                review_rule_breaks=["entry_outside_plan"],
                review_lesson="Wait for the planned entry.",
                lessons="Legacy note remains intact.",
            ),
            _closed_entry(id=second_id, exit_date="2026-07-12", lessons="Legacy only"),
        ]
    )
    user_tokens = []
    monkeypatch.setattr(
        journal,
        "get_user_client",
        lambda token: user_tokens.append(token) or client,
    )
    monkeypatch.setattr(journal, "_get_user_plan", lambda _user_id: "premium")
    monkeypatch.setattr(journal, "current_market_date", lambda: date(2026, 7, 16))

    response = asyncio.run(
        journal.get_weekly_review_evidence(
            week_start="2026-07-06",
            entry_ids=f"{first_id},{second_id},{first_id}",
            rule_break=None,
            user_id="user-1",
            user_token="jwt-user-1",
        )
    )

    assert response["week_start"] == "2026-07-06"
    assert response["week_end"] == "2026-07-12"
    assert response["requested_entry_ids"] == [first_id, second_id]
    assert response["matched_count"] == len(response["entries"]) == 2
    assert response["coverage_complete"] is True
    reviewed = next(entry for entry in response["entries"] if entry["id"] == first_id)
    assert reviewed["planned_setup"] == "Breakout"
    assert reviewed["setup_adherence"] == "partial"
    assert reviewed["rule_breaks"] == ["entry_outside_plan"]
    assert reviewed["review_lesson"] == "Wait for the planned entry."
    assert reviewed["lessons"] == "Legacy note remains intact."
    assert "review_planned_setup" not in reviewed
    assert user_tokens == ["jwt-user-1"]
    assert client.rpc_calls == [
        (
            "get_journal_weekly_review_evidence",
            {
                "p_user_id": "user-1",
                "p_week_start": "2026-07-06",
                "p_week_end": "2026-07-12",
                "p_entry_ids": [first_id, second_id],
                "p_rule_break": None,
                "p_entry_date_cutoff": None,
            },
        )
    ]


@pytest.mark.parametrize(
    ("row_overrides", "rule_break"),
    [
        ({"user_id": "user-2"}, None),
        ({"exit_date": "2026-06-30"}, None),
        ({"status": "open"}, None),
        ({"review_rule_breaks": ["stop_rule_broken"]}, "entry_outside_plan"),
    ],
)
def test_weekly_evidence_rejects_any_scope_mismatch(
    monkeypatch, row_overrides, rule_break
):
    entry_id = _uuid(3)
    client = _Client([_closed_entry(id=entry_id, **{"exit_date": "2026-07-10", **row_overrides})])
    monkeypatch.setattr(journal, "get_user_client", lambda _token: client)
    monkeypatch.setattr(journal, "_get_user_plan", lambda _user_id: "premium")
    monkeypatch.setattr(journal, "current_market_date", lambda: date(2026, 7, 16))

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(
            journal.get_weekly_review_evidence(
                week_start="2026-07-06",
                entry_ids=entry_id,
                rule_break=rule_break,
                user_id="user-1",
                user_token="jwt-user-1",
            )
        )

    assert exc_info.value.status_code == 404


def test_weekly_evidence_rejects_invalid_or_excessive_ids_and_incomplete_weeks(monkeypatch):
    monkeypatch.setattr(journal, "get_user_client", lambda _token: _Client())
    monkeypatch.setattr(journal, "_get_user_plan", lambda _user_id: "premium")
    monkeypatch.setattr(journal, "current_market_date", lambda: date(2026, 7, 16))

    for week_start, entry_ids in (
        ("2026-07-07", _uuid(1)),
        ("2026-07-13", _uuid(1)),
        ("2026-07-06", "not-a-uuid"),
        ("2026-07-06", ",".join(_uuid(index) for index in range(1, 502))),
    ):
        with pytest.raises(HTTPException) as exc_info:
            asyncio.run(
                journal.get_weekly_review_evidence(
                    week_start=week_start,
                    entry_ids=entry_ids,
                    rule_break=None,
                    user_id="user-1",
                    user_token="jwt-user-1",
                )
            )
        assert exc_info.value.status_code == 400


def test_weekly_evidence_malformed_snapshot_returns_503(monkeypatch):
    client = _Client()
    client.rpc_override = {"unexpected": "shape"}
    monkeypatch.setattr(journal, "get_user_client", lambda _token: client)
    monkeypatch.setattr(journal, "_get_user_plan", lambda _user_id: "premium")
    monkeypatch.setattr(journal, "current_market_date", lambda: date(2026, 7, 16))

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(
            journal.get_weekly_review_evidence(
                week_start="2026-07-06",
                entry_ids=_uuid(1),
                rule_break=None,
                user_id="user-1",
                user_token="jwt-user-1",
            )
        )

    assert exc_info.value.status_code == 503


def test_weekly_evidence_accepts_oldest_week_in_twelve_week_window(monkeypatch):
    entry_id = _uuid(10)
    client = _Client(
        [_closed_entry(id=entry_id, entry_date="2026-04-20", exit_date="2026-04-20")]
    )
    monkeypatch.setattr(journal, "get_user_client", lambda _token: client)
    monkeypatch.setattr(journal, "_get_user_plan", lambda _user_id: "premium")
    monkeypatch.setattr(journal, "current_market_date", lambda: date(2026, 7, 16))

    response = asyncio.run(
        journal.get_weekly_review_evidence(
            week_start="2026-04-20",
            entry_ids=entry_id,
            rule_break=None,
            user_id="user-1",
            user_token="jwt-user-1",
        )
    )

    assert response["matched_count"] == 1
    assert len(client.rpc_calls) == 1


def test_weekly_evidence_rejects_week_older_than_twelve_weeks_before_rpc(monkeypatch):
    client = _Client()
    plan_calls = []
    monkeypatch.setattr(journal, "get_user_client", lambda _token: client)
    monkeypatch.setattr(
        journal,
        "_get_user_plan",
        lambda user_id: plan_calls.append(user_id) or "premium",
    )
    monkeypatch.setattr(journal, "current_market_date", lambda: date(2026, 7, 16))

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(
            journal.get_weekly_review_evidence(
                week_start="2026-04-13",
                entry_ids=_uuid(11),
                rule_break=None,
                user_id="user-1",
                user_token="jwt-user-1",
            )
        )

    assert exc_info.value.status_code == 400
    assert client.rpc_calls == []
    assert plan_calls == []


@pytest.mark.parametrize(("plan", "expected_status"), [("free", 404), ("premium", 200)])
def test_weekly_evidence_enforces_free_history_cutoff_at_snapshot_boundary(
    monkeypatch, plan, expected_status
):
    entry_id = _uuid(12)
    client = _Client(
        [_closed_entry(id=entry_id, entry_date="2026-01-05", exit_date="2026-07-10")]
    )
    monkeypatch.setattr(journal, "get_user_client", lambda _token: client)
    monkeypatch.setattr(journal, "_get_user_plan", lambda _user_id: plan)
    monkeypatch.setattr(
        journal,
        "_journal_history_cutoff",
        lambda current_plan: date(2026, 4, 17) if current_plan == "free" else None,
    )
    monkeypatch.setattr(journal, "current_market_date", lambda: date(2026, 7, 16))

    if expected_status == 404:
        with pytest.raises(HTTPException) as exc_info:
            asyncio.run(
                journal.get_weekly_review_evidence(
                    week_start="2026-07-06",
                    entry_ids=entry_id,
                    rule_break=None,
                    user_id="user-1",
                    user_token="jwt-user-1",
                )
            )
        assert exc_info.value.status_code == expected_status
        assert client.rpc_calls[0][1]["p_entry_date_cutoff"] == "2026-04-17"
    else:
        response = asyncio.run(
            journal.get_weekly_review_evidence(
                week_start="2026-07-06",
                entry_ids=entry_id,
                rule_break=None,
                user_id="user-1",
                user_token="jwt-user-1",
            )
        )
        assert response["matched_count"] == 1
        assert client.rpc_calls[0][1]["p_entry_date_cutoff"] is None


def test_process_review_migration_is_nullable_bounded_server_owned_and_rls_scoped():
    sql = (
        REPO_ROOT
        / "supabase/migrations/20260716160000_journal_process_reviews.sql"
    ).read_text()

    for column in (
        "review_schema_version",
        "review_planned_setup",
        "review_setup_adherence",
        "review_rule_breaks",
        "review_lesson",
        "reviewed_at",
    ):
        assert f"add column if not exists {column}" in sql
    column_ddl = sql.split("comment on column", 1)[0]
    assert "default" not in column_ddl.lower()
    assert "backfill" in sql.lower()
    assert "review_setup_adherence in ('followed', 'partial', 'not_followed', 'not_applicable')" in sql
    assert "status = 'closed'" in sql
    for column in (
        "review_schema_version",
        "review_planned_setup",
        "review_setup_adherence",
        "review_rule_breaks",
        "review_lesson",
        "reviewed_at",
    ):
        assert f"{column} is not null" in sql
    for code in journal_weekly_review.RULE_BREAK_CODES:
        assert f"'{code}'" in sql
    assert "cardinality(review_rule_breaks) <= 6" in sql
    assert "TG_OP = 'INSERT'" in sql
    assert "<> 'service_role'" in sql
    assert "before insert or update on public.trade_journal" in sql
    assert "where status = 'closed'" in sql
    for function_signature in (
        "get_journal_weekly_review_rows(uuid, date, date, date)",
        "get_journal_weekly_review_evidence(uuid, date, date, uuid[], text, date)",
    ):
        assert function_signature in sql
    assert sql.count("security invoker") == 2
    assert sql.count("set search_path = public, pg_temp") == 2
    assert sql.count("from public, anon, authenticated") == 2
    assert sql.count("p_user_id = auth.uid()") == 2
    assert sql.count("to authenticated") == 2
    assert "to service_role" not in sql
    assert "jsonb_agg(to_jsonb(journal)" in sql
    assert "journal.entry_date >= p_entry_date_cutoff" in sql
