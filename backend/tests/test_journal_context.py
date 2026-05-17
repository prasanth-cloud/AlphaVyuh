import asyncio
import os
from pathlib import Path

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")

from app.routers import journal


class _Result:
    def __init__(self, data=None):
        self.data = data


class _Query:
    def __init__(self, client, table_name: str):
        self.client = client
        self.table_name = table_name
        self.insert_payload = None
        self.update_payload = None

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def maybe_single(self):
        return self

    def insert(self, payload):
        self.insert_payload = payload
        return self

    def update(self, payload):
        self.update_payload = payload
        return self

    def execute(self):
        if self.table_name == "stock_universe":
            return _Result([{"company_name": "Reliance Industries"}])
        if self.table_name == "trade_journal" and self.insert_payload is not None:
            self.client.journal_insert = self.insert_payload
            return _Result([{"id": "journal-1", **self.insert_payload}])
        if self.table_name == "trade_journal" and self.update_payload is not None:
            self.client.journal_update = self.update_payload
            return _Result([{**self.client.existing_entry, **self.update_payload}])
        if self.table_name == "trade_journal":
            return _Result(self.client.existing_entry)
        if self.table_name == "workflow_states":
            self.client.workflow_upserts.append(getattr(self, "upsert_payload", None))
            return _Result([])
        return _Result(None)

    def upsert(self, payload, **_kwargs):
        self.upsert_payload = payload
        return self


class _FakeSupabase:
    def __init__(self):
        self.journal_insert = None
        self.journal_update = None
        self.workflow_upserts = []
        self.existing_entry = {
            "id": "journal-1",
            "user_id": "user-1",
            "symbol": "RELIANCE",
            "trade_type": "long",
            "entry_date": "2026-05-15",
            "entry_price": 2500,
            "quantity": 3,
            "status": "open",
        }

    def table(self, table_name: str):
        return _Query(self, table_name)


def test_create_journal_entry_persists_structured_idea_context(monkeypatch):
    client = _FakeSupabase()
    monkeypatch.setattr(journal, "get_admin_client", lambda: client)

    body = journal.JournalEntry(
        symbol="reliance",
        trade_type="long",
        entry_date="2026-05-15",
        entry_price=2500,
        quantity=3,
        setup_type="breakout",
        stop_loss=2440,
        target_price=2680,
        entry_reason="Scanner shortlist",
        source_page="watchlist",
        source_context="Leaders queue",
        scanner_context={
            "preset_name": "Trend Template",
            "match_reasons": ["Volume expansion"],
            "data_as_of": "2026-05-15",
        },
        thesis="Breakout holding above prior resistance.",
        invalidation_rule="Close below the base.",
    )

    created = asyncio.run(journal.create_entry(body, user_id="user-1"))

    assert created["id"] == "journal-1"
    assert client.journal_insert["source_page"] == "watchlist"
    assert client.journal_insert["source_context"] == "Leaders queue"
    assert client.journal_insert["scanner_context"]["preset_name"] == "Trend Template"
    assert client.journal_insert["thesis"] == "Breakout holding above prior resistance."
    assert client.journal_insert["invalidation_rule"] == "Close below the base."
    assert client.workflow_upserts[-1]["thesis"] == "Breakout holding above prior resistance."
    assert client.workflow_upserts[-1]["scanner_context"]["data_as_of"] == "2026-05-15"


def test_journal_context_migration_adds_trade_and_workflow_context_columns():
    sql = Path("supabase/migrations/039_journal_idea_context.sql").read_text()

    for column in [
        "source_page",
        "source_context",
        "scanner_context",
        "thesis",
        "invalidation_rule",
    ]:
        assert f"add column if not exists {column}" in sql
    assert "trade_journal_source_page_check" in sql
    assert "trade_journal_scanner_context_object_check" in sql
    assert "workflow_states_scanner_context_object_check" in sql


def test_update_journal_entry_accepts_structured_context_without_clobbering_close(monkeypatch):
    client = _FakeSupabase()
    monkeypatch.setattr(journal, "get_admin_client", lambda: client)

    body = journal.JournalUpdate(
        source_context="Updated queue",
        scanner_context={"preset_name": "Box Breakout"},
        thesis="Updated thesis.",
        invalidation_rule="Updated invalidation.",
    )

    updated = asyncio.run(journal.update_entry("journal-1", body, user_id="user-1"))

    assert updated["source_context"] == "Updated queue"
    assert client.journal_update == {
        "source_context": "Updated queue",
        "scanner_context": {"preset_name": "Box Breakout"},
        "thesis": "Updated thesis.",
        "invalidation_rule": "Updated invalidation.",
    }
