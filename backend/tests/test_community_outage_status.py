import asyncio
import os

import pytest
from fastapi import HTTPException

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")

from app.routers import community  # noqa: E402


class _Result:
    def __init__(self, data=None):
        self.data = data


class _SharedScreensQuery:
    def __init__(self, data=None, fail=False):
        self.data = data if data is not None else []
        self.fail = fail
        self.selected = None
        self.limit_value = None

    def select(self, columns, **_kwargs):
        self.selected = columns
        return self

    def order(self, *_args, **_kwargs):
        return self

    def limit(self, value, **_kwargs):
        self.limit_value = value
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def execute(self):
        if self.fail:
            raise RuntimeError("shared screens unavailable")
        return _Result(self.data)


class _SharedScreensClient:
    def __init__(self, data=None, fail=False):
        self.data = data
        self.fail = fail
        self.query = None

    def table(self, table_name):
        assert table_name == "shared_screens"
        self.query = _SharedScreensQuery(self.data, self.fail)
        return self.query


def test_list_shared_screens_returns_enveloped_empty_list(monkeypatch):
    monkeypatch.setattr(community, "get_admin_client", lambda: _SharedScreensClient(data=[]))

    assert asyncio.run(community.list_shared_screens()) == {"screens": []}


def test_list_shared_screens_returns_enveloped_rows(monkeypatch):
    rows = [{"id": "screen-1", "title": "VCP leaders", "upvotes": 3}]
    client = _SharedScreensClient(data=rows)
    monkeypatch.setattr(community, "get_admin_client", lambda: client)

    assert asyncio.run(community.list_shared_screens(limit=10, featured=True)) == {"screens": rows}
    assert client.query.limit_value == 10
    assert client.query.selected == "id,screen_id,title,description,tags,upvotes,is_featured,created_at"


def test_list_shared_screens_raises_503_when_store_query_fails(monkeypatch):
    monkeypatch.setattr(community, "get_admin_client", lambda: _SharedScreensClient(fail=True))

    with pytest.raises(HTTPException) as exc:
        asyncio.run(community.list_shared_screens())

    assert exc.value.status_code == 503
    assert exc.value.detail == "Community screens are temporarily unavailable."
