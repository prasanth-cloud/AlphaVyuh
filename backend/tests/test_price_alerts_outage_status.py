import os

import pytest
from fastapi import HTTPException

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")

from app.routers import price_alerts  # noqa: E402


class _Result:
    def __init__(self, data=None, *, count=None):
        self.data = data
        self.count = count


class _PriceAlertQuery:
    def __init__(self, rows=None, *, fail=False, fail_insert=False, fail_delete=False, count=0):
        self.rows = rows or []
        self.fail = fail
        self.fail_insert = fail_insert
        self.fail_delete = fail_delete
        self.count = count
        self.operation = "select"
        self.row = None

    def select(self, *_args, **_kwargs):
        self.operation = "select"
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def order(self, *_args, **_kwargs):
        return self

    def insert(self, row):
        self.operation = "insert"
        self.row = row
        return self

    def delete(self):
        self.operation = "delete"
        return self

    def execute(self):
        if self.fail:
            raise RuntimeError("price alerts store down")
        if self.operation == "insert":
            if self.fail_insert:
                raise RuntimeError("price alerts insert down")
            return _Result([{**self.row, "id": "alert-1", "created_at": "2026-05-20T12:00:00Z", "triggered_at": None}])
        if self.operation == "delete":
            if self.fail_delete:
                raise RuntimeError("price alerts delete down")
            return _Result([])
        return _Result(self.rows, count=self.count)


class _PriceAlertClient:
    def __init__(self, rows=None, **kwargs):
        self.rows = rows or []
        self.kwargs = kwargs

    def table(self, table_name):
        assert table_name == "price_alerts"
        return _PriceAlertQuery(self.rows, **self.kwargs)


@pytest.mark.anyio
async def test_list_price_alerts_keeps_empty_alerts_as_valid_empty_state(monkeypatch):
    monkeypatch.setattr(price_alerts, "get_admin_client", lambda: _PriceAlertClient(rows=[]))

    result = await price_alerts.list_price_alerts(user_id="user-123")

    assert result == {"alerts": []}


@pytest.mark.anyio
async def test_list_price_alerts_raises_503_when_store_query_fails(monkeypatch):
    monkeypatch.setattr(price_alerts, "get_admin_client", lambda: _PriceAlertClient(fail=True))

    with pytest.raises(HTTPException) as exc:
        await price_alerts.list_price_alerts(user_id="user-123")

    assert exc.value.status_code == 503
    assert exc.value.detail == "Price alerts are temporarily unavailable."


@pytest.mark.anyio
async def test_create_price_alert_raises_503_when_limit_query_fails(monkeypatch):
    monkeypatch.setattr(price_alerts, "get_admin_client", lambda: _PriceAlertClient(fail=True))
    monkeypatch.setattr(price_alerts, "_get_user_plan", lambda _user_id: "pro")

    with pytest.raises(HTTPException) as exc:
        await price_alerts.create_price_alert(
            price_alerts.CreateAlertRequest(symbol="RELIANCE", condition="above", target_price=2800),
            user_id="user-123",
        )

    assert exc.value.status_code == 503
    assert exc.value.detail == "Price alerts are temporarily unavailable."


@pytest.mark.anyio
async def test_create_price_alert_preserves_plan_limit_error(monkeypatch):
    monkeypatch.setattr(price_alerts, "get_admin_client", lambda: _PriceAlertClient(count=price_alerts.FREE_LIMIT))
    monkeypatch.setattr(price_alerts, "_get_user_plan", lambda _user_id: "free")

    with pytest.raises(HTTPException) as exc:
        await price_alerts.create_price_alert(
            price_alerts.CreateAlertRequest(symbol="RELIANCE", condition="above", target_price=2800),
            user_id="user-123",
        )

    assert exc.value.status_code == 403
    assert exc.value.detail == "Free plan allows max 5 active price alerts."


@pytest.mark.anyio
async def test_delete_price_alert_raises_503_when_store_delete_fails(monkeypatch):
    monkeypatch.setattr(price_alerts, "get_admin_client", lambda: _PriceAlertClient(fail_delete=True))

    with pytest.raises(HTTPException) as exc:
        await price_alerts.delete_price_alert("alert-1", user_id="user-123")

    assert exc.value.status_code == 503
    assert exc.value.detail == "Price alerts are temporarily unavailable."
