import os

import pytest
from fastapi import HTTPException

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")

from app.routers import ingest


def test_ingest_service_key_fails_closed_when_unconfigured(monkeypatch):
    monkeypatch.setattr(ingest.settings, "ingest_service_key", "")

    with pytest.raises(HTTPException) as exc:
        ingest._require_ingest_service_key(None)

    assert exc.value.status_code == 503
    assert "not configured" in str(exc.value.detail)


def test_ingest_service_key_rejects_missing_or_wrong_key(monkeypatch):
    monkeypatch.setattr(ingest.settings, "ingest_service_key", "expected-key")

    with pytest.raises(HTTPException) as missing:
        ingest._require_ingest_service_key(None)
    with pytest.raises(HTTPException) as wrong:
        ingest._require_ingest_service_key("wrong-key")

    assert missing.value.status_code == 401
    assert wrong.value.status_code == 401


def test_ingest_service_key_accepts_exact_match(monkeypatch):
    monkeypatch.setattr(ingest.settings, "ingest_service_key", "expected-key")

    ingest._require_ingest_service_key("expected-key")
