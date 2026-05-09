import os

import pytest
from fastapi import HTTPException

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")

from app.routers import alerts


def test_telegram_webhook_secret_fails_closed_when_unconfigured(monkeypatch):
    monkeypatch.setattr(alerts.settings, "telegram_webhook_secret", "")

    with pytest.raises(HTTPException) as exc:
        alerts._require_telegram_webhook_secret("presented-secret")

    assert exc.value.status_code == 503
    assert "not configured" in str(exc.value.detail)


def test_telegram_webhook_secret_rejects_missing_or_wrong_secret(monkeypatch):
    monkeypatch.setattr(alerts.settings, "telegram_webhook_secret", "expected-secret")

    with pytest.raises(HTTPException) as missing:
        alerts._require_telegram_webhook_secret(None)
    with pytest.raises(HTTPException) as wrong:
        alerts._require_telegram_webhook_secret("wrong-secret")

    assert missing.value.status_code == 401
    assert wrong.value.status_code == 401


def test_telegram_webhook_secret_accepts_exact_match(monkeypatch):
    monkeypatch.setattr(alerts.settings, "telegram_webhook_secret", "expected-secret")

    alerts._require_telegram_webhook_secret("expected-secret")
