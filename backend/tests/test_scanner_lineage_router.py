from __future__ import annotations

import asyncio
import os
from uuid import UUID

import pytest
from fastapi import HTTPException

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")

from app.routers import scanner_lineage as router


RUN_ID = UUID("00000000-0000-4000-8000-000000000010")


class _Result:
    def __init__(self, data):
        self.data = data


class _Query:
    def __init__(self, client, table_name):
        self.client = client
        self.table_name = table_name
        self.filters = {}
        self.payload = None
        self.single = False

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, key, value):
        self.filters[key] = value
        return self

    def order(self, *_args, **_kwargs):
        return self

    def limit(self, *_args, **_kwargs):
        return self

    def insert(self, payload):
        self.payload = payload
        return self

    def update(self, payload):
        self.payload = payload
        return self

    def delete(self):
        self.payload = "__delete__"
        return self

    def execute(self):
        rows = self.client.tables.setdefault(self.table_name, [])
        if self.payload is not None and self.payload != "__delete__":
            payloads = self.payload if isinstance(self.payload, list) else [self.payload]
            created = []
            for payload in payloads:
                row = {
                    "id": self.client.next_id(self.table_name),
                    "created_at": "2026-08-20T00:00:00Z",
                    "updated_at": "2026-08-20T00:00:00Z",
                    **payload,
                }
                rows.append(row)
                created.append(row)
            return _Result(created)
        if self.payload == "__delete__":
            self.client.tables[self.table_name] = [
                row for row in rows if not all(str(row.get(key)) == str(value) for key, value in self.filters.items())
            ]
            return _Result([])
        if self.payload is not None:
            matches = [
                row for row in rows
                if all(str(row.get(key)) == str(value) for key, value in self.filters.items())
            ]
            for row in matches:
                row.update(self.payload)
            return _Result(matches)
        return _Result([
            row for row in rows
            if all(str(row.get(key)) == str(value) for key, value in self.filters.items())
        ])


class _Client:
    def __init__(self):
        self.tables = {"scanner_definitions": [], "scanner_filter_groups": [], "scanner_filters": [], "scanner_runs": [], "scanner_candidates": []}
        self.counters = {}

    def next_id(self, table_name):
        self.counters[table_name] = self.counters.get(table_name, 0) + 1
        return f"{table_name}-{self.counters[table_name]}"

    def table(self, table_name):
        return _Query(self, table_name)


def test_create_definition_persists_owner_scoped_groups_and_filters(monkeypatch):
    client = _Client()
    monkeypatch.setattr(router, "get_admin_client", lambda: client)

    result = asyncio.run(router.create_scanner_definition(
        router.ScannerDefinitionCreate(
            name="Trend template",
            universe="all_nse",
            definition={"sort": "setup_score"},
            groups=[router.ScannerFilterGroupInput(
                filters=[router.ScannerFilterInput(kind="rs_score_min", value={"min": 70})],
            )],
        ),
        user_id="user-1",
    ))

    assert result["definition"]["user_id"] == "user-1"
    assert result["groups"][0]["scanner_definition_id"] == result["definition"]["id"]
    assert result["filters"][0]["user_id"] == "user-1"
    assert result["filters"][0]["kind"] == "rs_score_min"


def test_candidate_list_does_not_cross_user_run_boundary(monkeypatch):
    client = _Client()
    client.tables["scanner_runs"] = [{"id": str(RUN_ID), "user_id": "owner"}]
    monkeypatch.setattr(router, "get_admin_client", lambda: client)

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(router.list_scanner_candidates(RUN_ID, user_id="other-user"))

    assert exc_info.value.status_code == 404
