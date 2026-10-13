import base64
import hashlib
import hmac
import json
from datetime import datetime, timedelta, timezone
import asyncio
import os
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")

from app.middleware import auth


def _credentials(token: str) -> HTTPAuthorizationCredentials:
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)


def _base64url(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _signed_jwt(payload: dict, secret: str) -> str:
    normalized_payload = {
        key: int(value.timestamp()) if isinstance(value, datetime) else value
        for key, value in payload.items()
    }
    header = _base64url(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode("utf-8"))
    body = _base64url(json.dumps(normalized_payload, separators=(",", ":")).encode("utf-8"))
    signature = hmac.new(secret.encode("utf-8"), f"{header}.{body}".encode("ascii"), hashlib.sha256).digest()
    return f"{header}.{body}.{_base64url(signature)}"


def test_get_current_user_id_validates_local_supabase_jwt(monkeypatch):
    secret = "test-supabase-jwt-secret-with-enough-entropy"
    user_id = "11111111-1111-1111-1111-111111111111"
    token = _signed_jwt(
        {
            "sub": user_id,
            "aud": "authenticated",
            "role": "authenticated",
            "exp": datetime.now(timezone.utc) + timedelta(minutes=5),
        },
        secret,
    )

    monkeypatch.setattr(auth.settings, "supabase_jwt_secret", secret)

    result = asyncio.run(auth._validate_token(_credentials(token)))
    assert asyncio.run(auth.get_current_user_id(result)) == user_id


def test_get_current_user_id_rejects_empty_bearer_tokens():
    with pytest.raises(HTTPException) as exc:
        asyncio.run(auth._validate_token(_credentials("null")))

    assert exc.value.status_code == 401
    assert exc.value.detail == "No token provided"


def test_get_current_user_id_falls_back_to_supabase_auth(monkeypatch):
    user_id = "22222222-2222-2222-2222-222222222222"

    class FakeAuth:
        def get_user(self, token):
            assert token == "opaque-token"
            return SimpleNamespace(user=SimpleNamespace(id=user_id))

    monkeypatch.setattr(auth.settings, "supabase_jwt_secret", "")
    monkeypatch.setattr(auth, "get_admin_client", lambda: SimpleNamespace(auth=FakeAuth()))

    result = asyncio.run(auth._validate_token(_credentials("opaque-token")))
    assert asyncio.run(auth.get_current_user_id(result)) == user_id


def test_get_current_user_id_hides_provider_errors(monkeypatch):
    class FakeAuth:
        def get_user(self, token):
            raise RuntimeError("provider secret detail")

    monkeypatch.setattr(auth.settings, "supabase_jwt_secret", "")
    monkeypatch.setattr(auth, "get_admin_client", lambda: SimpleNamespace(auth=FakeAuth()))

    with pytest.raises(HTTPException) as exc:
        asyncio.run(auth._validate_token(_credentials("opaque-token")))

    assert exc.value.status_code == 503
    assert exc.value.detail == "Authentication service is temporarily unavailable"


@pytest.mark.parametrize(
    "provider_status,code,message,expected_status",
    [
        (400, "bad_jwt", "Invalid JWT", 401),
        (401, "bad_jwt", "JWT expired", 401),
        (403, "user_banned", "User is banned", 401),
        (403, "", "Service restricted: exceed_db_size_quota", 503),
        (500, "unexpected_failure", "Secret database detail", 503),
        (400, "unexpected_failure", "Secret database detail", 503),
        (408, "request_timeout", "Request timed out", 503),
        (400, "request_timeout", "Request timed out", 503),
        (429, "over_request_rate_limit", "Secret provider detail", 429),
        (400, "over_request_rate_limit", "Secret provider detail", 429),
    ],
)
def test_auth_provider_errors_preserve_credential_and_outage_semantics(
    monkeypatch, provider_status, code, message, expected_status
):
    class ProviderError(Exception):
        status = provider_status

        def __init__(self):
            super().__init__(message)
            self.code = code

    class FakeAuth:
        def get_user(self, token):
            raise ProviderError()

    monkeypatch.setattr(auth.settings, "supabase_jwt_secret", "")
    monkeypatch.setattr(auth, "get_admin_client", lambda: SimpleNamespace(auth=FakeAuth()))

    with pytest.raises(HTTPException) as exc:
        asyncio.run(auth._validate_token(_credentials("opaque-token")))

    assert exc.value.status_code == expected_status
    assert message not in exc.value.detail
    if expected_status == 503:
        assert exc.value.detail == "Authentication service is temporarily unavailable"
    elif expected_status == 429:
        assert exc.value.detail == "Please wait before trying again"
    else:
        assert exc.value.detail == "Authentication failed"


def test_auth_client_initialization_failure_is_not_an_invalid_token(monkeypatch):
    def unavailable_client():
        raise RuntimeError("secret configuration detail")

    monkeypatch.setattr(auth.settings, "supabase_jwt_secret", "")
    monkeypatch.setattr(auth, "get_admin_client", unavailable_client)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(auth._validate_token(_credentials("opaque-token")))

    assert exc.value.status_code == 503
    assert exc.value.detail == "Authentication service is temporarily unavailable"


def test_auth_provider_missing_user_remains_unauthorized(monkeypatch):
    fake_auth = SimpleNamespace(get_user=lambda _token: SimpleNamespace(user=None))
    monkeypatch.setattr(auth.settings, "supabase_jwt_secret", "")
    monkeypatch.setattr(auth, "get_admin_client", lambda: SimpleNamespace(auth=fake_auth))

    with pytest.raises(HTTPException) as exc:
        asyncio.run(auth._validate_token(_credentials("opaque-token")))

    assert exc.value.status_code == 401
    assert exc.value.detail == "Invalid token"
