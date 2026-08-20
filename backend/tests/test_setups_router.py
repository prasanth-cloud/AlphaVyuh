import asyncio
import os

import pytest
from fastapi import HTTPException

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")

from app.routers import setups as setups_router


class _Result:
    def __init__(self, data):
        self.data = data


class _Query:
    def __init__(self, client):
        self.client = client
        self.payload = None
        self.filters = {}
        self.single = False

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, key, value):
        self.filters[key] = value
        return self

    def maybe_single(self):
        self.single = True
        return self

    def order(self, *_args, **_kwargs):
        return self

    def limit(self, *_args, **_kwargs):
        return self

    def insert(self, payload):
        self.payload = payload
        return self

    def update(self, payload):
        self.payload = payload
        return self

    def execute(self):
        if self.payload is not None and self.client.insert_mode:
            row = {"id": "setup-1", "created_at": "2026-08-20T00:00:00Z", **self.payload}
            self.client.rows = [row]
            return _Result([row])
        matches = [
            row for row in self.client.rows
            if all(str(row.get(key)) == str(value) for key, value in self.filters.items())
        ]
        return _Result((matches[0] if matches else None) if self.single else matches)


class _Client:
    def __init__(self):
        self.rows = []
        self.insert_mode = True

    def table(self, _name):
        return _Query(self)


def test_create_setup_derives_reward_to_risk_and_normalizes_symbol() -> None:
    body = setups_router.SetupCreate(
        symbol=" infy ",
        direction="long",
        entry_low=1500,
        entry_high=1510,
        stop_price=1480,
        target_price=1570,
        planned_quantity=2,
        source="chart",
    )

    payload = setups_router._create_payload(body, "user-1")

    assert payload["symbol"] == "INFY"
    assert payload["planned_rr"] == 2.6
    assert payload["planned_risk_amount"] == 50.0
    assert payload["user_id"] == "user-1"


def test_create_setup_rejects_wrong_direction_geometry() -> None:
    body = setups_router.SetupCreate(
        symbol="RELIANCE",
        direction="short",
        entry_low=100,
        entry_high=100,
        stop_price=95,
        target_price=80,
    )

    with pytest.raises(HTTPException) as exc_info:
        setups_router._create_payload(body, "user-1")

    assert exc_info.value.status_code == 422


def test_create_setup_scopes_insert_to_authenticated_user(monkeypatch) -> None:
    client = _Client()
    monkeypatch.setattr(setups_router, "get_user_client", lambda _jwt: client)
    body = setups_router.SetupCreate(
        symbol="TCS",
        direction="long",
        entry_low=3900,
        entry_high=3900,
        stop_price=3800,
        target_price=4200,
        source="chart",
    )

    result = asyncio.run(setups_router.create_setup(body, user_id="user-42", user_jwt="jwt"))

    assert result["id"] == "setup-1"
    assert result["user_id"] == "user-42"
    assert result["symbol"] == "TCS"


def test_get_setup_does_not_return_another_users_setup(monkeypatch) -> None:
    client = _Client()
    client.rows = [{"id": "setup-1", "user_id": "owner", "symbol": "TCS"}]
    client.insert_mode = False
    monkeypatch.setattr(setups_router, "get_user_client", lambda _jwt: client)

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(setups_router.get_setup("00000000-0000-4000-8000-000000000001", user_id="other-user", user_jwt="jwt"))

    assert exc_info.value.status_code == 404
