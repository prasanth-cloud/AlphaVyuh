import asyncio
import os

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")

from app.routers import workflow as workflow_router


class _Result:
    def __init__(self, data):
        self.data = data


class _Query:
    def __init__(self, client, table_name):
        self.client = client
        self.table_name = table_name
        self.filters = {}
        self.payload = None
        self.payloads = None
        self.single = False

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, key, value):
        self.filters[key] = value
        return self

    def in_(self, key, values):
        self.filters[key] = values
        return self

    def order(self, *_args, **_kwargs):
        return self

    def limit(self, *_args, **_kwargs):
        return self

    def upsert(self, payload, **_kwargs):
        if isinstance(payload, list):
            self.payloads = payload
        else:
            self.payload = payload
        return self

    def maybe_single(self):
        self.single = True
        return self

    def execute(self):
        if self.payload is not None:
            self.client.upserts.append(self.payload)
            return _Result([self.payload])
        if self.payloads is not None:
            self.client.bulk_upserts.append(self.payloads)
            return _Result(self.payloads)

        rows = self.client.rows.get(self.table_name, [])
        matches = [
            row for row in rows
            if all(
                (row.get(key) in value if isinstance(value, list) else str(row.get(key)) == str(value))
                for key, value in self.filters.items()
            )
        ]
        return _Result(matches[0] if self.single and matches else (None if self.single else matches))


class _Client:
    def __init__(self):
        self.rows = {"setups": [], "workflow_states": []}
        self.upserts = []
        self.bulk_upserts = []

    def table(self, table_name):
        return _Query(self, table_name)


def test_list_states_uses_authenticated_user_client(monkeypatch):
    client = _Client()
    client.rows["workflow_states"] = [{"user_id": "user-1", "symbol": "TCS"}]
    seen = []
    monkeypatch.setattr(workflow_router, "get_user_client", lambda jwt: seen.append(jwt) or client)

    result = asyncio.run(
        workflow_router.list_states(
            symbols="TCS",
            watchlist_id=None,
            user_id="user-1",
            user_jwt="jwt-user-1",
        )
    )

    assert result == {"states": [{"user_id": "user-1", "symbol": "TCS"}]}
    assert seen == ["jwt-user-1"]


def test_upsert_state_validates_and_persists_setup_lineage_with_user_client(monkeypatch):
    client = _Client()
    client.rows["setups"] = [{"id": "setup-1", "user_id": "user-1", "symbol": "TCS"}]
    seen = []
    monkeypatch.setattr(workflow_router, "get_user_client", lambda jwt: seen.append(jwt) or client)
    body = workflow_router.WorkflowStatePatch(
        symbol="TCS",
        setup_id="00000000-0000-4000-8000-000000000001",
        lifecycle="ready",
        source="chart",
    )
    client.rows["setups"][0]["id"] = str(body.setup_id)

    result = asyncio.run(
        workflow_router.upsert_state(
            symbol="TCS",
            body=body,
            user_id="user-1",
            user_jwt="jwt-user-1",
        )
    )

    assert result["user_id"] == "user-1"
    assert result["setup_id"] == str(body.setup_id)
    assert seen == ["jwt-user-1"]
    assert client.upserts[0]["user_id"] == "user-1"
