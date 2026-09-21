import asyncio
import os
from pathlib import Path
from uuid import UUID

import pytest
from fastapi import HTTPException

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")

from app.routers import trade_reviews  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[2]
MIGRATION = REPO_ROOT / "supabase/migrations/20260820000006_trade_reviews.sql"


class _Result:
    def __init__(self, data):
        self.data = data


class _Query:
    def __init__(self, client, table_name: str):
        self.client = client
        self.table_name = table_name
        self.upsert_payload = None

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def order(self, *_args, **_kwargs):
        return self

    def limit(self, *_args, **_kwargs):
        return self

    def maybe_single(self):
        return self

    def upsert(self, payload, **_kwargs):
        self.upsert_payload = payload
        return self

    def execute(self):
        if self.table_name == "trade_journal":
            return _Result(self.client.entry)
        if self.table_name == "trade_reviews" and self.upsert_payload is not None:
            self.client.review_upsert = self.upsert_payload
            return _Result([self.client.review])
        if self.table_name == "trade_reviews":
            return _Result([self.client.review])
        raise AssertionError(f"Unexpected table: {self.table_name}")


class _Client:
    def __init__(self, *, status_value: str = "closed"):
        self.entry = {
            "id": "11111111-1111-4111-8111-111111111111",
            "user_id": "user-1",
            "status": status_value,
            "setup_id": "22222222-2222-4222-8222-222222222222",
        }
        self.review = {
            "id": "33333333-3333-4333-8333-333333333333",
            "user_id": "user-1",
            "journal_entry_id": self.entry["id"],
            "setup_id": self.entry["setup_id"],
            "status": "completed",
            "plan_adherence": "unknown",
            "mistakes": None,
            "lesson": "Wait for confirmation.",
            "follow_up": None,
            "source": "manual",
            "reviewed_at": "2026-08-20T12:00:00+00:00",
            "created_at": "2026-08-20T12:00:00+00:00",
            "updated_at": "2026-08-20T12:00:00+00:00",
        }
        self.review_upsert = None

    def table(self, table_name: str):
        return _Query(self, table_name)


def test_save_trade_review_uses_user_scoped_client_and_parent_setup(monkeypatch):
    client = _Client()
    monkeypatch.setattr(trade_reviews, "get_user_client", lambda token: client)

    result = asyncio.run(
        trade_reviews.save_trade_review(
            UUID(client.entry["id"]),
            trade_reviews.TradeReviewWrite(
                plan_adherence="partial",
                mistakes="Entered before confirmation.",
                lesson="Wait for confirmation.",
                follow_up="Add a volume check.",
            ),
            user_id="user-1",
            user_jwt="user-jwt",
        )
    )

    assert result["journal_entry_id"] == client.entry["id"]
    assert client.review_upsert == {
        "user_id": "user-1",
        "journal_entry_id": client.entry["id"],
        "setup_id": client.entry["setup_id"],
        "status": "completed",
        "plan_adherence": "partial",
        "mistakes": "Entered before confirmation.",
        "lesson": "Wait for confirmation.",
        "follow_up": "Add a volume check.",
        "source": "manual",
        "reviewed_at": client.review_upsert["reviewed_at"],
    }


def test_save_trade_review_rejects_open_trade(monkeypatch):
    client = _Client(status_value="open")
    monkeypatch.setattr(trade_reviews, "get_user_client", lambda token: client)

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(
            trade_reviews.save_trade_review(
                UUID(client.entry["id"]),
                trade_reviews.TradeReviewWrite(lesson="Not ready to review."),
                user_id="user-1",
                user_jwt="user-jwt",
            )
        )

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == "Trade must be closed before review"
    assert client.review_upsert is None


def test_trade_review_migration_enforces_owner_scope_and_journal_lineage():
    sql = " ".join(MIGRATION.read_text().lower().split())

    assert "create table if not exists public.trade_reviews" in sql
    assert "alter table public.trade_reviews enable row level security" in sql
    assert "create policy trade_reviews_owner" in sql
    assert "using ((select auth.uid()) = user_id)" in sql
    assert "with check ((select auth.uid()) = user_id)" in sql
    assert "unique (user_id, journal_entry_id)" in sql
    assert "foreign key (user_id, journal_entry_id) references public.trade_journal (user_id, id) on delete cascade" in sql
    assert "foreign key (user_id, setup_id) references public.setups (user_id, id) on delete set null" in sql
    assert "create trigger trade_journal_review_sync" in sql
    assert "trade_reviews_user_journal_fkey" in sql
