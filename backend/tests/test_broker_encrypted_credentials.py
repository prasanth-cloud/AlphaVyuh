import os
import secrets

os.environ.setdefault("BROKER_CREDS_KEY", secrets.token_bytes(32).hex())
os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")

from app.routers import broker as broker_router  # noqa: E402


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
