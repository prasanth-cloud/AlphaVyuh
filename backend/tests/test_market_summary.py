import asyncio
import os

import pytest
from fastapi import HTTPException

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")

from app.routers import stocks  # noqa: E402


def test_market_summary_raises_503_when_database_is_unavailable(monkeypatch):
    monkeypatch.setattr(stocks, "get_admin_client", lambda: (_ for _ in ()).throw(RuntimeError("db down")))

    with pytest.raises(HTTPException) as exc:
        asyncio.run(stocks.get_market_summary())

    assert exc.value.status_code == 503
    assert exc.value.detail == "Market summary is temporarily unavailable."
