import os

import pytest
from fastapi import HTTPException

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")

from app.routers import alerts as alerts_router  # noqa: E402
from app.routers import ingest as ingest_router  # noqa: E402
from app.services.supabase import settings  # noqa: E402


class _FakeRequest:
    async def json(self):
        return {"message": {"chat": {"id": 123}, "text": "/help"}}


def test_telegram_webhook_requires_configured_secret(monkeypatch):
    monkeypatch.setattr(settings, "telegram_bot_token", "123:token")
    monkeypatch.setattr(settings, "telegram_webhook_secret", "")

    with pytest.raises(HTTPException) as exc_info:
        import asyncio

        asyncio.run(alerts_router.telegram_webhook(_FakeRequest(), None))

    assert exc_info.value.status_code == 503


def test_telegram_webhook_rejects_wrong_secret(monkeypatch):
    monkeypatch.setattr(settings, "telegram_bot_token", "123:token")
    monkeypatch.setattr(settings, "telegram_webhook_secret", "expected-secret")

    with pytest.raises(HTTPException) as exc_info:
        import asyncio

        asyncio.run(alerts_router.telegram_webhook(_FakeRequest(), "wrong-secret"))

    assert exc_info.value.status_code == 401


def test_refresh_today_fails_closed_without_ingest_service_key(monkeypatch):
    monkeypatch.setattr(settings, "ingest_service_key", "")

    with pytest.raises(HTTPException) as exc_info:
        import asyncio

        asyncio.run(ingest_router.refresh_today(limit=1, x_service_key=None))

    assert exc_info.value.status_code == 401
