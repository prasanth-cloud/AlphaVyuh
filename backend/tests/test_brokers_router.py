from __future__ import annotations

import asyncio
import os
import secrets
from datetime import datetime, timezone

import pytest
from fastapi import HTTPException

os.environ.setdefault("BROKER_CREDS_KEY", secrets.token_bytes(32).hex())
os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")

from app.brokers.adapter import BrokerCredentials, BrokerProfile
from app.routers import brokers as brokers_router


class _FakeAdapter:
    def __init__(self):
        self.code = None

    def get_auth_url(self, state: str) -> str:
        return f"https://upstox.test/login?state={state}"

    async def exchange_code(self, code: str) -> BrokerCredentials:
        self.code = code
        return BrokerCredentials(
            broker_id="upstox",
            access_token="access-token",
            refresh_token="extended-token",
            expires_at=datetime(2026, 5, 5, 22, 0, tzinfo=timezone.utc),
        )


def test_broker_router_accepts_upstox_oauth_code(monkeypatch):
    saved: dict[tuple[str, str], str] = {}
    adapter = _FakeAdapter()

    monkeypatch.setattr(brokers_router, "get_adapter", lambda broker_id: adapter)
    monkeypatch.setattr(brokers_router, "_require_broker_plan", lambda _user_id: None)
    monkeypatch.setattr(
        brokers_router,
        "upsert_broker_credential",
        lambda user_id, broker, key_name, value: saved.__setitem__((broker, key_name), value),
    )

    state = brokers_router.create_broker_oauth_state("user-1", "upstox")

    response = asyncio.run(
        brokers_router.connect_callback(
            "upstox",
            request_token=None,
            code="oauth-code",
            state=state,
            user_id="user-1",
        )
    )

    assert adapter.code == "oauth-code"
    assert saved[("upstox", "access_token")] == "access-token"
    assert saved[("upstox", "refresh_token")] == "extended-token"
    assert response.status_code == 302
    assert response.headers["location"].endswith("/settings/broker?connected=upstox")


def test_broker_router_rejects_invalid_oauth_state(monkeypatch):
    saved: dict[tuple[str, str], str] = {}
    adapter = _FakeAdapter()

    monkeypatch.setattr(brokers_router, "get_adapter", lambda broker_id: adapter)
    monkeypatch.setattr(brokers_router, "_require_broker_plan", lambda _user_id: None)
    monkeypatch.setattr(
        brokers_router,
        "upsert_broker_credential",
        lambda user_id, broker, key_name, value: saved.__setitem__((broker, key_name), value),
    )

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(
            brokers_router.connect_callback(
                "upstox",
                request_token=None,
                code="oauth-code",
                state="bad-state",
                user_id="user-1",
            )
        )

    assert exc_info.value.status_code == 400
    assert "state expired or invalid" in str(exc_info.value.detail)
    assert adapter.code is None
    assert saved == {}


def test_broker_connect_start_reports_missing_configuration(monkeypatch):
    class _MisconfiguredAdapter:
        def get_auth_url(self, _state):
            raise KeyError("UPSTOX_API_KEY")

    monkeypatch.setattr(brokers_router, "get_adapter", lambda broker_id: _MisconfiguredAdapter())
    monkeypatch.setattr(brokers_router, "_require_broker_plan", lambda _user_id: None)

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(brokers_router.connect_start("upstox", user_id="user-1"))

    assert exc_info.value.status_code == 503
    assert "missing UPSTOX_API_KEY" in str(exc_info.value.detail)


def test_broker_connect_start_requires_paid_plan(monkeypatch):
    monkeypatch.setattr(brokers_router, "_get_user_plan", lambda _user_id: ("free", None))

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(brokers_router.connect_start("upstox", user_id="user-1"))

    assert exc_info.value.status_code == 403
    assert exc_info.value.detail["error"] == "plan_required"


def test_adapter_read_only_smoke_records_active_broker_metadata(monkeypatch):
    captured: dict[str, object] = {}

    class _SmokeAdapter:
        def get_auth_url(self, state: str) -> str:
            assert state
            return "https://upstox.test/login"

        async def get_profile(self, _creds):
            return BrokerProfile(
                broker_id="upstox",
                user_id="upstox-user-1",
                display_name="Upstox User",
                email="user@example.com",
            )

        async def get_positions(self, _creds):
            return []

        async def get_holdings(self, _creds):
            return [object()]

        async def list_orders(self, _creds):
            return []

    monkeypatch.setattr(brokers_router, "get_adapter", lambda broker_id: _SmokeAdapter())
    monkeypatch.setattr(brokers_router, "_require_broker_plan", lambda _user_id: None)
    monkeypatch.setattr(
        brokers_router,
        "_load_creds",
        lambda _user_id, broker: BrokerCredentials(
            broker_id=broker,
            access_token="access-token",
            expires_at=datetime(2026, 5, 5, 22, 0, tzinfo=timezone.utc),
        ),
    )
    monkeypatch.setattr(
        brokers_router,
        "_upsert_broker_connection",
        lambda **kwargs: captured.update(kwargs),
    )

    result = asyncio.run(brokers_router.broker_read_only_smoke("upstox", user_id="user-1"))

    assert result["broker"] == "upstox"
    assert result["connected_read_only"] is True
    assert result["checks"]["profile"]["user_id_present"] is True
    assert result["checks"]["holdings"]["count"] == 1
    assert result["checks"]["tradebook"]["note"] == "No completed order available for tradebook probe."
    assert captured["broker"] == "upstox"
    assert captured["broker_user_id"] == "upstox-user-1"
    metadata = captured["metadata"]["read_only_smoke"]  # type: ignore[index]
    assert metadata["broker"] == "upstox"
    assert metadata["passed"] is True
    assert metadata["checks"]["orderbook"]["count"] == 0
