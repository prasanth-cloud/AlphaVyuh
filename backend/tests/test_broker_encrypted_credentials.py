import os
import secrets
import asyncio

import pytest
from fastapi import HTTPException

os.environ.setdefault("BROKER_CREDS_KEY", secrets.token_bytes(32).hex())
os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")

from app.routers import broker as broker_router  # noqa: E402
from app.routers import users as users_router  # noqa: E402
from app.brokers.kite.api import KiteApiError  # noqa: E402


class _MaybeSingleQuery:
    def __init__(self, data):
        self._data = data

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def maybe_single(self):
        return self

    def execute(self):
        return type("Result", (), {"data": self._data})()


class _FakeSupabase:
    def __init__(self, data):
        self._data = data

    def table(self, _name):
        return _MaybeSingleQuery(self._data)


class _UpdateQuery:
    def __init__(self, client):
        self.client = client
        self._selecting = False

    def update(self, updates):
        self.client.updated = updates
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def execute(self):
        if self._selecting:
            return type("Result", (), {"data": self.client.user_row})()
        return type("Result", (), {"data": None})()

    def select(self, *_args, **_kwargs):
        self._selecting = True
        return self

    def single(self):
        return self


class _FakeUsersSupabase:
    def __init__(self):
        self.updated = None
        self.user_row = {
            "id": "user-123",
            "email": "user@example.com",
            "full_name": None,
            "avatar_url": None,
            "plan": "free",
            "plan_expires_at": None,
            "onboarding_completed": False,
            "telegram_chat_id": None,
            "broker_type": "zerodha",
            "broker_api_key": "kite-key",
            "broker_connected_at": "2026-04-28T00:00:00",
            "billing_region": "IN",
            "billing_currency": "INR",
            "billing_period": "monthly",
            "referral_code": None,
            "referred_by": None,
            "created_at": "2026-04-28T00:00:00",
        }

    def table(self, _name):
        return _UpdateQuery(self)


def test_user_broker_credentials_prefer_encrypted_store(monkeypatch):
    monkeypatch.setattr(
        broker_router,
        "get_admin_client",
        lambda: _FakeSupabase(
            {
                "broker_type": "zerodha",
                "broker_api_key": "plain-key",
                "broker_api_secret": "plain-secret",
                "broker_access_token": "plain-token",
                "broker_token_expires_at": "plain-expiry",
                "broker_connected_at": "2026-04-27T12:00:00",
            }
        ),
    )

    values = {
        ("zerodha", "api_key"): "encrypted-key",
        ("zerodha", "api_secret"): "encrypted-secret",
        ("zerodha", "access_token"): "encrypted-token",
        ("zerodha", "expires_at"): "encrypted-expiry",
    }
    monkeypatch.setattr(
        broker_router,
        "_get_stored_credential",
        lambda _user_id, broker, key_name: values.get((broker, key_name)),
    )

    creds = broker_router._get_user_broker_credentials("user-123", "zerodha")

    assert creds["api_key"] == "encrypted-key"
    assert creds["api_secret"] == "encrypted-secret"
    assert creds["access_token"] == "encrypted-token"
    assert creds["expires_at"] == "encrypted-expiry"


def test_user_broker_credentials_fall_back_to_legacy_columns(monkeypatch):
    monkeypatch.setattr(
        broker_router,
        "get_admin_client",
        lambda: _FakeSupabase(
            {
                "broker_type": "zerodha",
                "broker_api_key": "plain-key",
                "broker_api_secret": "plain-secret",
                "broker_access_token": "plain-token",
                "broker_token_expires_at": "plain-expiry",
                "broker_connected_at": "2026-04-27T12:00:00",
            }
        ),
    )
    monkeypatch.setattr(broker_router, "_get_stored_credential", lambda *_args: None)

    creds = broker_router._get_user_broker_credentials("user-123", "zerodha")

    assert creds["api_key"] == "plain-key"
    assert creds["api_secret"] == "plain-secret"
    assert creds["access_token"] == "plain-token"
    assert creds["expires_at"] == "plain-expiry"


def test_update_me_does_not_write_plaintext_broker_secret(monkeypatch):
    client = _FakeUsersSupabase()
    saved: dict[tuple[str, str], str] = {}

    monkeypatch.setattr(users_router, "get_admin_client", lambda: client)
    monkeypatch.setattr(
        users_router,
        "upsert_broker_credential",
        lambda _user_id, broker, key_name, value: saved.__setitem__((broker, key_name), value),
    )

    request = users_router.UpdateUserRequest(
        broker_type="zerodha",
        broker_api_key="kite-key",
        broker_api_secret="kite-secret",
    )

    asyncio.run(users_router.update_me(request, user_id="user-123"))

    assert saved[("zerodha", "api_secret")] == "kite-secret"
    assert client.updated["broker_api_secret"] is None


def test_zerodha_callback_does_not_log_or_return_sensitive_provider_message(monkeypatch, caplog):
    secret_message = "bad request_token=req-secret api_secret=kite-secret access_token=broker-token"

    monkeypatch.setattr(broker_router, "get_admin_client", lambda: object())
    monkeypatch.setattr(
        broker_router,
        "_get_user_broker_credentials",
        lambda _user_id, _broker: {"api_key": "kite-key", "api_secret": "kite-secret"},
    )
    monkeypatch.setattr(
        broker_router.kite_api,
        "exchange_code",
        lambda **_kwargs: (_ for _ in ()).throw(KiteApiError(400, "InputException", secret_message)),
    )

    with caplog.at_level("ERROR", logger="app.routers.broker"):
        with pytest.raises(HTTPException) as exc_info:
            asyncio.run(broker_router.zerodha_callback(request_token="req-secret", user_id="user-123"))

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == "Zerodha session failed — check your API key and secret"
    assert "InputException" in caplog.text
    assert "req-secret" not in caplog.text
    assert "kite-secret" not in caplog.text
    assert "broker-token" not in caplog.text
