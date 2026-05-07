from datetime import datetime, timedelta, timezone
import asyncio
import os
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from jose import jwt

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")

from app.middleware import auth


def _credentials(token: str) -> HTTPAuthorizationCredentials:
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)


def test_get_current_user_id_validates_local_supabase_jwt(monkeypatch):
    secret = "test-supabase-jwt-secret"
    user_id = "11111111-1111-1111-1111-111111111111"
    token = jwt.encode(
        {
            "sub": user_id,
            "aud": "authenticated",
            "role": "authenticated",
            "exp": datetime.now(timezone.utc) + timedelta(minutes=5),
        },
        secret,
        algorithm="HS256",
    )

    monkeypatch.setattr(auth.settings, "supabase_jwt_secret", secret)

    assert asyncio.run(auth.get_current_user_id(_credentials(token))) == user_id


def test_get_current_user_id_rejects_empty_bearer_tokens():
    with pytest.raises(HTTPException) as exc:
        asyncio.run(auth.get_current_user_id(_credentials("null")))

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

    assert asyncio.run(auth.get_current_user_id(_credentials("opaque-token"))) == user_id


def test_get_current_user_id_hides_provider_errors(monkeypatch):
    class FakeAuth:
        def get_user(self, token):
            raise RuntimeError("provider secret detail")

    monkeypatch.setattr(auth.settings, "supabase_jwt_secret", "")
    monkeypatch.setattr(auth, "get_admin_client", lambda: SimpleNamespace(auth=FakeAuth()))

    with pytest.raises(HTTPException) as exc:
        asyncio.run(auth.get_current_user_id(_credentials("opaque-token")))

    assert exc.value.status_code == 401
    assert exc.value.detail == "Authentication failed"
