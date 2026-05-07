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

from app.brokers.adapter import BrokerCredentials, BrokerError
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
    monkeypatch.setattr(
        brokers_router,
        "upsert_broker_credential",
        lambda user_id, broker, key_name, value: saved.__setitem__((broker, key_name), value),
    )

    response = asyncio.run(
        brokers_router.connect_callback(
            "upstox",
            request_token=None,
            code="oauth-code",
            state="state",
            user_id="user-1",
        )
    )

    assert adapter.code == "oauth-code"
    assert saved[("upstox", "access_token")] == "access-token"
    assert saved[("upstox", "refresh_token")] == "extended-token"
    assert response.status_code == 302
    assert response.headers["location"].endswith("/settings/broker?connected=upstox")


def test_broker_connect_start_reports_missing_configuration(monkeypatch):
    class _MisconfiguredAdapter:
        def get_auth_url(self, _state):
            raise KeyError("UPSTOX_API_KEY")

    monkeypatch.setattr(brokers_router, "get_adapter", lambda broker_id: _MisconfiguredAdapter())

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(brokers_router.connect_start("upstox", user_id="user-1"))

    assert exc_info.value.status_code == 503
    assert "missing UPSTOX_API_KEY" in str(exc_info.value.detail)


def test_broker_connect_callback_sanitizes_provider_error(monkeypatch, caplog):
    class _SensitiveAdapter:
        def get_auth_url(self, _state):
            return "https://upstox.test/login"

        async def exchange_code(self, _code):
            raise BrokerError(
                kind="UNKNOWN",
                broker_id="upstox",
                message="provider echoed code=oauth-secret access_token=broker-token",
                retryable=False,
                broker_code="ProviderError",
            )

    monkeypatch.setattr(brokers_router, "get_adapter", lambda broker_id: _SensitiveAdapter())

    with caplog.at_level("WARNING", logger="app.routers.brokers"):
        with pytest.raises(HTTPException) as exc_info:
            asyncio.run(
                brokers_router.connect_callback(
                    "upstox",
                    request_token=None,
                    code="oauth-secret",
                    state="state",
                    user_id="user-1",
                )
            )

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == "Broker connection failed. Reconnect or try again shortly."
    assert "ProviderError" in caplog.text
    assert "oauth-secret" not in caplog.text
    assert "broker-token" not in caplog.text
