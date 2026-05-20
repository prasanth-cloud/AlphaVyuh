import asyncio
import os

import pytest
from fastapi import HTTPException

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")

from app.routers import watchlist  # noqa: E402


class _Response:
    def __init__(self, data):
        self.data = data


class _Query:
    def __init__(self, *, data=None, fail=False):
        self._data = data or []
        self._fail = fail

    def select(self, *args, **kwargs):
        return self

    def eq(self, *args, **kwargs):
        return self

    def order(self, *args, **kwargs):
        return self

    def execute(self):
        if self._fail:
            raise RuntimeError("watchlist query down")
        return _Response(self._data)


class _Client:
    def __init__(self, *, watchlists=None, fail=False):
        self._watchlists = watchlists or []
        self._fail = fail

    def table(self, name):
        assert name == "watchlists"
        return _Query(data=self._watchlists, fail=self._fail)


def test_get_watchlists_raises_503_when_admin_client_is_unavailable(monkeypatch):
    monkeypatch.setattr(watchlist, "get_admin_client", lambda: (_ for _ in ()).throw(RuntimeError("db down")))

    with pytest.raises(HTTPException) as exc:
        asyncio.run(watchlist.get_watchlists(user_id="user-1"))

    assert exc.value.status_code == 503
    assert exc.value.detail == "Watchlist shell is temporarily unavailable."


def test_get_watchlists_raises_503_when_shell_query_fails(monkeypatch):
    monkeypatch.setattr(watchlist, "get_admin_client", lambda: _Client(fail=True))

    with pytest.raises(HTTPException) as exc:
        asyncio.run(watchlist.get_watchlists(user_id="user-1"))

    assert exc.value.status_code == 503
    assert exc.value.detail == "Watchlist shell is temporarily unavailable."


def test_get_watchlists_keeps_empty_shell_as_valid_empty_state(monkeypatch):
    monkeypatch.setattr(watchlist, "get_admin_client", lambda: _Client(watchlists=[]))

    result = asyncio.run(watchlist.get_watchlists(user_id="user-1"))

    assert result["watchlists"] == []
    assert result["mode"] == "eod"
