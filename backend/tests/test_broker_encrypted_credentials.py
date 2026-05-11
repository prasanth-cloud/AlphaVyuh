import os
import secrets
import asyncio

os.environ.setdefault("BROKER_CREDS_KEY", secrets.token_bytes(32).hex())
os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")

from app.routers import broker as broker_router  # noqa: E402
from app.routers import users as users_router  # noqa: E402


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


def test_user_broker_credentials_use_platform_app_keys_and_user_tokens(monkeypatch):
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
        ("zerodha", "access_token"): "encrypted-token",
        ("zerodha", "expires_at"): "encrypted-expiry",
    }
    monkeypatch.setattr(
        broker_router,
        "_get_stored_credential",
        lambda _user_id, broker, key_name: values.get((broker, key_name)),
    )
    monkeypatch.setenv("KITE_API_KEY", "platform-key")
    monkeypatch.setenv("KITE_API_SECRET", "platform-secret")

    creds = broker_router._get_user_broker_credentials("user-123", "zerodha")

    assert creds["api_key"] == "platform-key"
    assert creds["api_secret"] == "platform-secret"
    assert creds["access_token"] == "encrypted-token"
    assert creds["expires_at"] == "encrypted-expiry"


def test_user_broker_credentials_do_not_use_legacy_user_app_keys(monkeypatch):
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
    monkeypatch.delenv("KITE_API_KEY", raising=False)
    monkeypatch.delenv("KITE_API_SECRET", raising=False)
    monkeypatch.delenv("ZERODHA_API_KEY", raising=False)
    monkeypatch.delenv("ZERODHA_API_SECRET", raising=False)

    creds = broker_router._get_user_broker_credentials("user-123", "zerodha")

    assert creds["api_key"] is None
    assert creds["api_secret"] is None
    assert creds["access_token"] == "plain-token"
    assert creds["expires_at"] == "plain-expiry"


def test_update_me_rejects_user_submitted_broker_app_credentials(monkeypatch):
    client = _FakeUsersSupabase()

    monkeypatch.setattr(users_router, "get_admin_client", lambda: client)

    request = users_router.UpdateUserRequest(
        broker_type="zerodha",
        broker_api_key="kite-key",
        broker_api_secret="kite-secret",
    )

    try:
        asyncio.run(users_router.update_me(request, user_id="user-123"))
    except Exception as exc:
        assert getattr(exc, "status_code", None) == 400
        assert "managed by AlphaVyuh" in str(getattr(exc, "detail", ""))
    else:
        raise AssertionError("Expected user-submitted broker app keys to be rejected")
    assert client.updated is None


def test_get_me_never_returns_broker_app_secret_fields(monkeypatch):
    client = _FakeUsersSupabase()
    client.user_row["broker_api_secret"] = "kite-secret"
    monkeypatch.setattr(users_router, "get_admin_client", lambda: client)

    response = asyncio.run(users_router.get_me(user_id="user-123"))

    assert "broker_api_key" not in response
    assert "broker_api_secret" not in response
