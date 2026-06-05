import os
from pathlib import Path

import pytest
from fastapi import HTTPException

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")

from app.routers import alerts

REPO_ROOT = Path(__file__).resolve().parents[2]


class _FakeResult:
    def __init__(self, data=None, count=None):
        self.data = data or []
        self.count = count


class _FakeTable:
    def __init__(self, client, name):
        self.client = client
        self.name = name
        self.operation = None
        self.payload = None

    def select(self, *args, **kwargs):
        self.operation = "select"
        return self

    def insert(self, payload):
        self.operation = "insert"
        self.payload = payload
        return self

    def update(self, payload):
        self.operation = "update"
        self.payload = payload
        self.client.updates.append((self.name, payload))
        return self

    def upsert(self, payload, **kwargs):
        self.operation = "upsert"
        self.payload = payload
        self.client.upserts.append((self.name, payload, kwargs))
        return self

    def eq(self, *args, **kwargs):
        return self

    def in_(self, *args, **kwargs):
        return self

    def order(self, *args, **kwargs):
        return self

    def limit(self, *args, **kwargs):
        return self

    def range(self, *args, **kwargs):
        return self

    def single(self):
        return self

    def execute(self):
        if self.name == "scan_alerts" and self.operation == "select":
            return _FakeResult([
                {
                    "id": "alert-1",
                    "user_id": "user-1",
                    "name": "Momentum scan",
                    "filters": {"rsi_min": 60},
                    "sort_by": "volume_ratio",
                    "sort_order": "desc",
                    "is_active": True,
                    "last_match_count": 99,
                }
            ])
        if self.name == "users":
            return _FakeResult([{"id": "user-1", "plan": "pro", "telegram_chat_id": "chat-1"}])
        return _FakeResult([])


class _FakeClient:
    def __init__(self):
        self.upserts = []
        self.updates = []

    def table(self, name):
        return _FakeTable(self, name)


class _FailingTable(_FakeTable):
    def execute(self):
        raise RuntimeError("scan alerts store down")


class _FailingClient(_FakeClient):
    def table(self, name):
        return _FailingTable(self, name)


class _EmptyTable(_FakeTable):
    def execute(self):
        return _FakeResult([])


class _EmptyClient(_FakeClient):
    def table(self, name):
        return _EmptyTable(self, name)


class _RecentMatchTable(_FakeTable):
    def limit(self, value):
        self.client.limits.append((self.name, value))
        return self

    def execute(self):
        if self.name == "scan_alert_matches":
            return _FakeResult(self.client.match_rows)
        return super().execute()


class _RecentMatchClient(_FakeClient):
    def __init__(self, match_rows):
        super().__init__()
        self.match_rows = match_rows
        self.limits = []

    def table(self, name):
        return _RecentMatchTable(self, name)


class _AlertMatchFilterTable(_FakeTable):
    def eq(self, column, value):
        self.client.filters.append((self.name, column, value))
        return self

    def execute(self):
        if self.name == "scan_alerts" and self.operation == "select":
            return _FakeResult([{"id": "alert-1"}])
        if self.name == "scan_alert_matches" and self.operation == "select":
            return _FakeResult([_match_row("alert-1", "2026-05-31")])
        return super().execute()


class _AlertMatchFilterClient(_FakeClient):
    def __init__(self):
        super().__init__()
        self.filters = []

    def table(self, name):
        return _AlertMatchFilterTable(self, name)


def _match_row(alert_id: str, run_date: str) -> dict:
    return {
        "id": f"{alert_id}-{run_date}",
        "alert_id": alert_id,
        "user_id": "user-1",
        "run_date": run_date,
        "symbols": [{"symbol": "RELIANCE"}],
        "match_count": 1,
        "run_status": "success",
        "error_message": None,
        "scan_alerts": {"name": alert_id},
    }


def test_scan_alert_sort_validation_rejects_unknown_sort_key():
    with pytest.raises(HTTPException) as exc_info:
        alerts._validate_sort("unknown_column", "desc")

    assert exc_info.value.status_code == 400
    assert "Invalid sort_by" in str(exc_info.value.detail)


def test_scan_alert_sort_validation_rejects_unknown_sort_order():
    with pytest.raises(HTTPException) as exc_info:
        alerts._validate_sort("volume_ratio", "sideways")

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == "sort_order must be asc or desc"


def test_recent_matches_route_is_not_shadowed_by_dynamic_alert_route():
    paths = [route.path for route in alerts.router.routes]

    recent_index = paths.index("/api/v1/alerts/recent/matches")
    dynamic_index = paths.index("/api/v1/alerts/{alert_id}/matches")

    assert recent_index < dynamic_index


@pytest.mark.anyio
async def test_list_alerts_keeps_empty_alerts_as_valid_empty_state(monkeypatch):
    monkeypatch.setattr(alerts, "get_admin_client", lambda: _EmptyClient())

    result = await alerts.list_alerts(user_id="user-1")

    assert result == {"alerts": []}


@pytest.mark.anyio
async def test_list_alerts_raises_503_when_alert_store_fails(monkeypatch):
    monkeypatch.setattr(alerts, "get_admin_client", lambda: _FailingClient())

    with pytest.raises(HTTPException) as exc_info:
        await alerts.list_alerts(user_id="user-1")

    assert exc_info.value.status_code == 503
    assert exc_info.value.detail == "Scan alerts are temporarily unavailable."


@pytest.mark.anyio
async def test_recent_matches_raises_503_when_match_store_fails(monkeypatch):
    monkeypatch.setattr(alerts, "get_admin_client", lambda: _FailingClient())

    with pytest.raises(HTTPException) as exc_info:
        await alerts.get_recent_matches(user_id="user-1")

    assert exc_info.value.status_code == 503
    assert exc_info.value.detail == "Scan alerts are temporarily unavailable."


@pytest.mark.anyio
async def test_recent_matches_returns_recent_history_per_alert(monkeypatch):
    client = _RecentMatchClient([
        _match_row("alert-1", "2026-05-31"),
        _match_row("alert-2", "2026-05-31"),
        _match_row("alert-1", "2026-05-30"),
        _match_row("alert-2", "2026-05-30"),
        _match_row("alert-1", "2026-05-29"),
    ])
    monkeypatch.setattr(alerts, "get_admin_client", lambda: client)

    result = await alerts.get_recent_matches(user_id="user-1")

    assert [match["id"] for match in result["matches"]] == [
        "alert-1-2026-05-31",
        "alert-2-2026-05-31",
        "alert-1-2026-05-30",
        "alert-2-2026-05-30",
    ]
    assert client.limits == [("scan_alert_matches", 50)]


@pytest.mark.anyio
async def test_recent_matches_can_be_limited_to_latest_run_per_alert(monkeypatch):
    client = _RecentMatchClient([
        _match_row("alert-1", "2026-05-31"),
        _match_row("alert-2", "2026-05-31"),
        _match_row("alert-1", "2026-05-30"),
        _match_row("alert-2", "2026-05-30"),
    ])
    monkeypatch.setattr(alerts, "get_admin_client", lambda: client)

    result = await alerts.get_recent_matches(runs_per_alert=1, user_id="user-1")

    assert [match["id"] for match in result["matches"]] == [
        "alert-1-2026-05-31",
        "alert-2-2026-05-31",
    ]


@pytest.mark.anyio
async def test_alert_match_history_filters_matches_by_user_after_parent_check(monkeypatch):
    client = _AlertMatchFilterClient()
    monkeypatch.setattr(alerts, "get_admin_client", lambda: client)

    result = await alerts.get_alert_matches("alert-1", user_id="user-1")

    assert result["matches"][0]["id"] == "alert-1-2026-05-31"
    assert ("scan_alerts", "id", "alert-1") in client.filters
    assert ("scan_alerts", "user_id", "user-1") in client.filters
    assert ("scan_alert_matches", "alert_id", "alert-1") in client.filters
    assert ("scan_alert_matches", "user_id", "user-1") in client.filters


@pytest.mark.anyio
async def test_update_alert_preserves_missing_alert_404(monkeypatch):
    monkeypatch.setattr(alerts, "get_admin_client", lambda: _EmptyClient())

    with pytest.raises(HTTPException) as exc_info:
        await alerts.update_alert("missing-alert", alerts.UpdateAlertRequest(is_active=False), user_id="user-1")

    assert exc_info.value.status_code == 404
    assert exc_info.value.detail == "Alert not found"


@pytest.mark.anyio
async def test_delete_alert_raises_503_when_alert_store_fails(monkeypatch):
    monkeypatch.setattr(alerts, "get_admin_client", lambda: _FailingClient())

    with pytest.raises(HTTPException) as exc_info:
        await alerts.delete_alert("alert-1", user_id="user-1")

    assert exc_info.value.status_code == 503
    assert exc_info.value.detail == "Scan alerts are temporarily unavailable."


def test_scan_alerts_migration_defines_rls_and_unique_snapshot_constraint():
    sql = (REPO_ROOT / "supabase/migrations/038_scan_alerts.sql").read_text()

    assert "create table if not exists public.scan_alerts" in sql
    assert "create table if not exists public.scan_alert_matches" in sql
    assert "unique (alert_id, run_date)" in sql
    assert "alter table public.scan_alerts enable row level security" in sql
    assert "alter table public.scan_alert_matches enable row level security" in sql
    assert "auth.uid() = user_id" in sql


def test_run_all_alerts_uses_scanner_core_and_persists_current_snapshot(monkeypatch):
    fake_client = _FakeClient()
    calls = []

    async def fake_execute_scan(client, body, *, plan, trade_date, enforce_plan_limit, score_results, include_diagnostics):
        calls.append({
            "plan": plan,
            "trade_date": str(trade_date),
            "page_size": body.page_size,
            "filters": body.filters.model_dump(exclude_none=True),
            "sort_by": body.sort_by,
            "enforce_plan_limit": enforce_plan_limit,
            "score_results": score_results,
            "include_diagnostics": include_diagnostics,
        })
        return {
            "total_matches": 2,
            "results": [
                {"symbol": "AAA", "close": 100, "pct_change": 2.5, "volume_ratio": 3.0, "rsi_14": 72},
                {"symbol": "BBB", "close": 200, "pct_change": 1.5, "volume_ratio": 2.0, "rsi_14": 68},
            ],
        }

    monkeypatch.setattr(alerts, "get_admin_client", lambda: fake_client)
    monkeypatch.setattr(alerts, "_get_user_plan", lambda user_id: "pro")
    monkeypatch.setattr(alerts, "execute_scan", fake_execute_scan)
    monkeypatch.setattr(alerts.settings, "telegram_bot_token", "")

    import asyncio
    result = asyncio.run(alerts.run_all_alerts(__import__("datetime").date(2026, 5, 15)))

    assert result["alerts_run"] == 1
    assert result["total_matches"] == 2
    assert calls == [{
        "plan": "pro",
        "trade_date": "2026-05-15",
        "page_size": 50,
        "filters": {"rsi_min": 60.0},
        "sort_by": "volume_ratio",
        "enforce_plan_limit": False,
        "score_results": False,
        "include_diagnostics": False,
    }]
    match_upsert = fake_client.upserts[0][1]
    assert match_upsert["match_count"] == 2
    assert match_upsert["symbols"][0]["symbol"] == "AAA"
    assert match_upsert["run_status"] == "success"
    alert_update = fake_client.updates[0][1]
    assert alert_update["last_match_count"] == 2
    assert alert_update["last_run_status"] == "success"


def test_telegram_summary_uses_current_run_count_not_stale_alert_count(monkeypatch):
    sent = []

    class _FakeHttp:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def post(self, url, json):
            sent.append(json)

    monkeypatch.setattr(alerts.settings, "telegram_bot_token", "token")
    monkeypatch.setattr(alerts.httpx, "AsyncClient", lambda timeout=10: _FakeHttp())

    summaries = [{
        "user_id": "user-1",
        "name": "Momentum scan",
        "match_count": 3,
        "run_status": "success",
    }]

    import asyncio
    asyncio.run(alerts._send_telegram_summaries(_FakeClient(), summaries, "2026-05-15"))

    assert sent
    assert "3 stocks matched" in sent[0]["text"]
    assert "99" not in sent[0]["text"]
