from __future__ import annotations

import asyncio
import os
import secrets
from datetime import datetime, timezone

os.environ.setdefault("BROKER_CREDS_KEY", secrets.token_bytes(32).hex())
os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")

from app.brokers.adapter import BrokerCredentials
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
