import asyncio
import os

import pytest
from fastapi import HTTPException

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")

from app.routers import data_health  # noqa: E402


class _Response:
    def __init__(self, data):
        self.data = data


class _Query:
    def __init__(self, *, data=None, fail=False):
        self._data = data or []
        self._fail = fail

    def select(self, *args, **kwargs):
        return self

    def order(self, *args, **kwargs):
        return self

    def limit(self, *args, **kwargs):
        return self

    def execute(self):
        if self._fail:
            raise RuntimeError("ingest runs query down")
        return _Response(self._data)


class _Client:
    def __init__(self, *, runs=None, fail=False):
        self._runs = runs or []
        self._fail = fail

    def table(self, name):
        assert name == "ingest_runs"
        return _Query(data=self._runs, fail=self._fail)


def test_list_recent_runs_raises_503_when_admin_client_is_unavailable(monkeypatch):
    monkeypatch.setattr(data_health, "get_admin_client", lambda: (_ for _ in ()).throw(RuntimeError("db down")))

    with pytest.raises(HTTPException) as exc:
        asyncio.run(data_health.list_recent_runs(user_id="user-1"))

    assert exc.value.status_code == 503
    assert exc.value.detail == "Data refresh run history is temporarily unavailable."


def test_list_recent_runs_raises_503_when_query_fails(monkeypatch):
    monkeypatch.setattr(data_health, "get_admin_client", lambda: _Client(fail=True))

    with pytest.raises(HTTPException) as exc:
        asyncio.run(data_health.list_recent_runs(user_id="user-1"))

    assert exc.value.status_code == 503
    assert exc.value.detail == "Data refresh run history is temporarily unavailable."


def test_list_recent_runs_keeps_empty_history_as_valid_empty_state(monkeypatch):
    monkeypatch.setattr(data_health, "get_admin_client", lambda: _Client(runs=[]))

    result = asyncio.run(data_health.list_recent_runs(user_id="user-1"))

    assert result == {"runs": []}
