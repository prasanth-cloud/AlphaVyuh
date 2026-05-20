import asyncio
import os

import pytest
from fastapi import HTTPException

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")

from app.routers import scanner  # noqa: E402


class _FailingQuery:
    def __getattr__(self, _name):
        return lambda *args, **kwargs: self

    def execute(self):
        raise RuntimeError("scanner query down")


class _FailingClient:
    def table(self, _name):
        return _FailingQuery()


def test_run_scanner_raises_503_when_admin_client_is_unavailable(monkeypatch):
    monkeypatch.setattr(scanner.scanner_limiter, "is_allowed", lambda user_id: True)
    monkeypatch.setattr(scanner, "get_admin_client", lambda: (_ for _ in ()).throw(RuntimeError("db down")))

    with pytest.raises(HTTPException) as exc:
        asyncio.run(scanner.run_scanner(scanner.ScanRequest(), user_id="user-1"))

    assert exc.value.status_code == 503
    assert exc.value.detail == "Scanner data is temporarily unavailable."


def test_execute_scan_raises_503_when_trade_date_is_unavailable(monkeypatch):
    monkeypatch.setattr(scanner, "get_latest_complete_trade_date", lambda client: None)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(scanner.execute_scan(object(), scanner.ScanRequest(), plan="pro"))

    assert exc.value.status_code == 503
    assert exc.value.detail == "No complete trade date is available for scanner."


def test_execute_scan_raises_503_when_primary_and_fallback_queries_fail():
    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            scanner.execute_scan(
                _FailingClient(),
                scanner.ScanRequest(),
                plan="pro",
                trade_date="2026-05-19",
            )
        )

    assert exc.value.status_code == 503
    assert exc.value.detail == "Scanner query could not complete; try a narrower preset."
