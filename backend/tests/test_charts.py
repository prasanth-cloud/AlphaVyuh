import os

import pytest

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")

from app.routers import charts  # noqa: E402


class _MaybeSingleQuery:
    def select(self, *_args, **_kwargs):
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def maybe_single(self):
        return self

    def execute(self):
        return None


class _FakeSupabase:
    def table(self, _name):
        return _MaybeSingleQuery()


@pytest.mark.anyio
async def test_get_layout_returns_default_when_no_saved_layout(monkeypatch):
    monkeypatch.setattr(charts, "get_admin_client", lambda: _FakeSupabase())

    layout = await charts.get_layout("reliance", user_id="user-123")

    assert layout == {
        "symbol": "RELIANCE",
        "timeframe": "D",
        "indicators": [],
        "drawing_tools": [],
    }
