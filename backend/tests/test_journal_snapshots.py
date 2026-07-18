import asyncio
import json
import os
from copy import deepcopy
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from fastapi import HTTPException


os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")

from app.routers import journal
from app.services import journal_snapshots


REPO_ROOT = Path(__file__).resolve().parents[2]
NOW = datetime.now(UTC)


class _Request:
    def __init__(self, content_length: str | None = None):
        self.headers = {"content-length": content_length} if content_length is not None else {}


class _Result:
    def __init__(self, data=None):
        self.data = data


class _Query:
    def __init__(self, client, table_name):
        self.client = client
        self.table_name = table_name
        self.filters = {}
        self.null_filters = set()
        self.update_payload = None
        self.delete_requested = False

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, field, value):
        self.filters[field] = value
        return self

    def is_(self, field, value):
        if value == "null":
            self.null_filters.add(field)
        return self

    def maybe_single(self):
        return self

    def update(self, payload):
        self.update_payload = payload
        return self

    def delete(self):
        self.delete_requested = True
        return self

    def execute(self):
        if self.table_name != "trade_journal":
            return _Result(None)
        entry = self.client.entries.get(self.filters.get("id"))
        if entry is None or (
            "user_id" in self.filters and entry.get("user_id") != self.filters["user_id"]
        ):
            return _Result(None)
        if self.update_payload is not None:
            self.client.update_attempted = True
            if self.client.delete_during_update:
                del self.client.entries[entry["id"]]
                raise RuntimeError("row deleted during update")
            if self.client.fail_update_before_commit:
                raise RuntimeError("database update failed")
            if any(entry.get(field) is not None for field in self.null_filters):
                return _Result([])
            entry.update(deepcopy(self.update_payload))
            if self.client.fail_update_after_commit:
                raise RuntimeError("database response lost after commit")
            return _Result([deepcopy(entry)])
        if self.delete_requested:
            if self.client.fail_delete:
                raise RuntimeError("database delete failed")
            del self.client.entries[entry["id"]]
            return _Result([deepcopy(entry)])
        if self.client.fail_confirmation_read and self.client.update_attempted:
            raise RuntimeError("database confirmation unavailable")
        return _Result(deepcopy(entry))


class _Bucket:
    def __init__(self, client):
        self.client = client

    def upload(self, path, payload, _options):
        if self.client.fail_upload:
            raise RuntimeError("storage unavailable")
        if path in self.client.objects:
            raise RuntimeError("object already exists")
        self.client.objects[path] = bytes(payload)

    def download(self, path):
        if path not in self.client.objects:
            raise RuntimeError("object missing")
        return self.client.objects[path]

    def remove(self, paths):
        self.client.remove_attempts.append(list(paths))
        if self.client.fail_remove:
            raise RuntimeError("storage unavailable")
        for path in paths:
            self.client.objects.pop(path, None)


class _Storage:
    def __init__(self, client):
        self.client = client

    def from_(self, bucket):
        assert bucket == journal_snapshots.SNAPSHOT_BUCKET
        return _Bucket(self.client)


class _RpcQuery:
    def __init__(self, client, function_name, params):
        self.client = client
        self.function_name = function_name
        self.params = params

    def execute(self):
        assert self.function_name == "delete_trade_journal_with_snapshot_paths"
        if self.client.fail_delete:
            raise RuntimeError("database delete failed")
        entry = self.client.entries.get(self.params["p_entry_id"])
        if entry is None or entry["user_id"] != self.params["p_user_id"]:
            return _Result([])
        if self.client.attach_path_before_atomic_delete:
            path = f"{entry['user_id']}/{entry['id']}.json"
            entry["snapshot_state_path"] = path
            entry["snapshot_state_version"] = 1
            entry["snapshot_captured_at"] = NOW.isoformat()
            self.client.objects[path] = b"{}"
        deleted = {
            "snapshot_state_path": entry.get("snapshot_state_path"),
            "snapshot_image_path": entry.get("snapshot_image_path"),
        }
        del self.client.entries[entry["id"]]
        return _Result([deleted])


class _FakeSupabase:
    def __init__(self, *, created_at: datetime | None = None):
        self.entries = {
            "journal-1": {
                "id": "journal-1",
                "user_id": "user-1",
                "symbol": "RELIANCE",
                "entry_price": 2850.5,
                "created_at": (created_at or (NOW - timedelta(minutes=1))).isoformat(),
                "snapshot_image_path": None,
                "snapshot_state_path": None,
                "snapshot_state_version": None,
                "snapshot_captured_at": None,
            }
        }
        self.objects = {}
        self.fail_upload = False
        self.fail_remove = False
        self.remove_attempts = []
        self.update_attempted = False
        self.fail_update_before_commit = False
        self.fail_update_after_commit = False
        self.fail_confirmation_read = False
        self.delete_during_update = False
        self.fail_delete = False
        self.attach_path_before_atomic_delete = False
        self.storage = _Storage(self)

    def table(self, table_name):
        return _Query(self, table_name)

    def rpc(self, function_name, params):
        return _RpcQuery(self, function_name, params)


def _state(**overrides):
    state = {
        "schema_version": 1,
        "symbol": "RELIANCE",
        "timeframe": "D",
        "range_label": "6M",
        "chart_type": "candles",
        "visible_range": {"from": 10.5, "to": 130.25},
        "indicators": ["EMA 20", "EMA 50"],
        "drawings": [{"type": "horizontal", "price": 2840.5}],
        "entry_price": 2850.5,
        "last_bar_time": "2026-07-15",
        "data_source": "NSE official EOD",
        "data_mode": "eod",
        "data_as_of": "2026-07-15",
        "captured_at": (NOW - timedelta(seconds=10)).isoformat().replace("+00:00", "Z"),
    }
    state.update(overrides)
    return state


def test_owned_entry_snapshot_is_private_deterministic_and_first_write_wins():
    client = _FakeSupabase()

    first, created = journal_snapshots.attach_snapshot(
        client, "user-1", "journal-1", _state(), now=NOW
    )

    path = "user-1/journal-1.json"
    assert created is True
    assert first["symbol"] == "RELIANCE"
    stored = json.loads(client.objects[path])
    assert stored["captured_at"] == NOW.isoformat().replace("+00:00", "Z")
    assert stored["observed_at_client"] == _state()["captured_at"]
    assert stored["entry_price"] == 2850.5
    assert client.entries["journal-1"]["snapshot_state_path"] == path

    replacement = _state(
        captured_at=(NOW + timedelta(hours=1)).isoformat(), entry_price=2900
    )
    second, created_again = journal_snapshots.attach_snapshot(
        client, "user-1", "journal-1", replacement, now=NOW
    )

    assert created_again is False
    assert second == first
    assert json.loads(client.objects[path])["entry_price"] == 2850.5
    assert journal_snapshots.read_snapshot(client, "user-1", "journal-1") == first


@pytest.mark.parametrize("operation", ["attach", "read", "cleanup_paths"])
def test_cross_user_snapshot_operations_are_indistinguishable_from_missing(operation):
    client = _FakeSupabase()

    with pytest.raises(journal_snapshots.JournalEntryNotFound):
        if operation == "attach":
            journal_snapshots.attach_snapshot(
                client, "user-2", "journal-1", _state(), now=NOW
            )
        elif operation == "read":
            journal_snapshots.read_snapshot(client, "user-2", "journal-1")
        else:
            journal_snapshots.owned_snapshot_paths(client, "user-2", "journal-1")

    assert client.objects == {}


def test_snapshot_rejects_symbol_mismatch_malformed_shape_and_oversized_payload():
    client = _FakeSupabase()

    with pytest.raises(journal_snapshots.InvalidJournalSnapshot, match="symbol"):
        journal_snapshots.attach_snapshot(
            client, "user-1", "journal-1", _state(symbol="TCS"), now=NOW
        )
    with pytest.raises(journal_snapshots.InvalidJournalSnapshot, match="missing required"):
        journal_snapshots.attach_snapshot(
            client, "user-1", "journal-1", {"schema_version": 1}, now=NOW
        )
    with pytest.raises(journal_snapshots.InvalidJournalSnapshot, match="exceeds"):
        journal_snapshots.attach_snapshot(
            client,
            "user-1",
            "journal-1",
            _state(drawings=[{"notes": "x" * 65_536}]),
            now=NOW,
        )


def test_snapshot_rejects_delayed_future_and_price_mismatched_attachments():
    delayed = _FakeSupabase(created_at=NOW - timedelta(minutes=16))
    with pytest.raises(journal_snapshots.InvalidJournalSnapshot, match="window"):
        journal_snapshots.attach_snapshot(
            delayed, "user-1", "journal-1", _state(), now=NOW
        )

    future_client = _FakeSupabase()
    with pytest.raises(journal_snapshots.InvalidJournalSnapshot, match="future"):
        journal_snapshots.attach_snapshot(
            future_client,
            "user-1",
            "journal-1",
            _state(captured_at=(NOW + timedelta(minutes=6)).isoformat()),
            now=NOW,
        )

    mismatched_price = _FakeSupabase()
    with pytest.raises(journal_snapshots.InvalidJournalSnapshot, match="entry_price"):
        journal_snapshots.attach_snapshot(
            mismatched_price,
            "user-1",
            "journal-1",
            _state(entry_price=2851),
            now=NOW,
        )


def test_ambiguous_update_preserves_committed_or_unconfirmed_object():
    committed = _FakeSupabase()
    committed.fail_update_after_commit = True

    state, created = journal_snapshots.attach_snapshot(
        committed, "user-1", "journal-1", _state(), now=NOW
    )

    assert created is True
    assert state["captured_at"] == NOW.isoformat().replace("+00:00", "Z")
    assert committed.entries["journal-1"]["snapshot_state_path"] == "user-1/journal-1.json"
    assert "user-1/journal-1.json" in committed.objects
    assert committed.remove_attempts == []

    unconfirmed = _FakeSupabase()
    unconfirmed.fail_update_before_commit = True
    unconfirmed.fail_confirmation_read = True
    with pytest.raises(journal_snapshots.JournalSnapshotUnavailable, match="confirmed"):
        journal_snapshots.attach_snapshot(
            unconfirmed, "user-1", "journal-1", _state(), now=NOW
        )
    assert "user-1/journal-1.json" in unconfirmed.objects
    assert unconfirmed.remove_attempts == []


def test_failed_update_cleans_only_proven_unclaimed_or_deleted_entry_objects():
    unclaimed = _FakeSupabase()
    unclaimed.fail_update_before_commit = True
    with pytest.raises(journal_snapshots.JournalSnapshotUnavailable):
        journal_snapshots.attach_snapshot(
            unclaimed, "user-1", "journal-1", _state(), now=NOW
        )
    assert unclaimed.objects == {}
    assert unclaimed.remove_attempts == [["user-1/journal-1.json"]]

    deleted = _FakeSupabase()
    deleted.delete_during_update = True
    with pytest.raises(journal_snapshots.JournalEntryNotFound):
        journal_snapshots.attach_snapshot(
            deleted, "user-1", "journal-1", _state(), now=NOW
        )
    assert deleted.objects == {}
    assert deleted.remove_attempts == [["user-1/journal-1.json"]]


def test_router_returns_not_found_for_cross_user_snapshot_access(monkeypatch):
    client = _FakeSupabase()
    monkeypatch.setattr(journal, "get_user_client", lambda token: client)
    monkeypatch.setattr(
        journal,
        "get_admin_client",
        lambda: (_ for _ in ()).throw(AssertionError("read must not use service role")),
    )

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(journal.get_snapshot("journal-1", user_id="user-2", user_token="jwt-2"))

    assert exc_info.value.status_code == 404
    assert exc_info.value.detail == "Entry not found"

    monkeypatch.setattr(journal, "get_admin_client", lambda: client)
    with pytest.raises(HTTPException) as upload_exc:
        asyncio.run(
            journal.create_snapshot(
                "journal-1",
                _Request(),
                journal.JournalSnapshotCreate(state=_state()),
                user_id="user-2",
                user_token="jwt-2",
            )
        )
    assert upload_exc.value.status_code == 404


def test_snapshot_attach_requires_rls_scoped_ownership_before_admin_write(monkeypatch):
    admin_client = _FakeSupabase()
    user_client = _FakeSupabase()
    user_client.entries = {}
    seen_tokens = []
    monkeypatch.setattr(journal, "get_admin_client", lambda: admin_client)
    monkeypatch.setattr(
        journal,
        "get_user_client",
        lambda token: seen_tokens.append(token) or user_client,
    )

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(
            journal.create_snapshot(
                "journal-1",
                _Request(),
                journal.JournalSnapshotCreate(state=_state()),
                user_id="user-1",
                user_token="jwt-1",
            )
        )

    assert exc_info.value.status_code == 404
    assert seen_tokens == ["jwt-1"]
    assert admin_client.update_attempted is False
    assert admin_client.objects == {}


def test_snapshot_route_returns_private_read_descriptor_and_maps_storage_failure(monkeypatch):
    client = _FakeSupabase()
    monkeypatch.setattr(journal, "get_admin_client", lambda: client)
    monkeypatch.setattr(journal, "get_user_client", lambda token: client)

    created = asyncio.run(
        journal.create_snapshot(
            "journal-1",
            _Request(),
            journal.JournalSnapshotCreate(state=_state(data_mode="fallback")),
            user_id="user-1",
            user_token="jwt-1",
        )
    )

    assert created["available"] is True
    assert created["storage_path"] == "user-1/journal-1.json"
    assert created["image_available"] is False
    assert created["already_captured"] is False

    monkeypatch.setattr(
        journal,
        "get_admin_client",
        lambda: (_ for _ in ()).throw(AssertionError("read must not use service role")),
    )
    read_back = asyncio.run(
        journal.get_snapshot("journal-1", user_id="user-1", user_token="jwt-1")
    )
    assert read_back["state"] == created["state"]
    assert read_back["storage_path"] == "user-1/journal-1.json"

    other = _FakeSupabase()
    other.fail_upload = True
    monkeypatch.setattr(journal, "get_admin_client", lambda: other)
    monkeypatch.setattr(journal, "get_user_client", lambda token: other)
    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(
            journal.create_snapshot(
                "journal-1",
                _Request(),
                journal.JournalSnapshotCreate(state=_state()),
                user_id="user-1",
                user_token="jwt-1",
            )
        )
    assert exc_info.value.status_code == 503
    assert other.entries["journal-1"]["snapshot_state_path"] is None


def test_snapshot_route_prechecks_content_length_and_rate_limits(monkeypatch):
    client = _FakeSupabase()
    monkeypatch.setattr(journal, "get_admin_client", lambda: client)
    monkeypatch.setattr(journal, "get_user_client", lambda token: client)
    monkeypatch.setattr(
        journal,
        "journal_snapshot_limiter",
        journal.RateLimiter(max_calls=10, period=60),
    )

    with pytest.raises(HTTPException) as oversized:
        asyncio.run(
            journal.create_snapshot(
                "journal-1",
                _Request(str(journal.MAX_SNAPSHOT_REQUEST_BYTES + 1)),
                journal.JournalSnapshotCreate(state=_state()),
                user_id="user-1",
                user_token="jwt-1",
            )
        )
    assert oversized.value.status_code == 413
    assert client.objects == {}

    monkeypatch.setattr(
        journal,
        "journal_snapshot_limiter",
        journal.RateLimiter(max_calls=1, period=60),
    )
    asyncio.run(
        journal.create_snapshot(
            "journal-1",
            _Request(),
            journal.JournalSnapshotCreate(state=_state()),
            user_id="user-1",
            user_token="jwt-1",
        )
    )
    with pytest.raises(HTTPException) as limited:
        asyncio.run(
            journal.create_snapshot(
                "journal-1",
                _Request(),
                journal.JournalSnapshotCreate(state=_state()),
                user_id="user-1",
                user_token="jwt-1",
            )
        )
    assert limited.value.status_code == 429
    assert limited.value.headers["Retry-After"]


def test_delete_attempts_snapshot_cleanup_but_storage_failure_does_not_block_row_delete(monkeypatch):
    client = _FakeSupabase()
    client.entries["journal-1"]["snapshot_state_path"] = "user-1/journal-1.json"
    client.entries["journal-1"]["snapshot_state_version"] = 1
    client.entries["journal-1"]["snapshot_captured_at"] = "2026-07-16T14:30:00Z"
    client.objects["user-1/journal-1.json"] = b"{}"
    client.fail_remove = True
    monkeypatch.setattr(journal, "get_admin_client", lambda: client)

    result = asyncio.run(journal.delete_entry("journal-1", user_id="user-1"))

    assert result == {"message": "Deleted"}
    assert "journal-1" not in client.entries
    assert client.remove_attempts == [["user-1/journal-1.json"]]


def test_delete_failure_keeps_live_snapshot_pointer_and_skips_storage_cleanup(monkeypatch):
    client = _FakeSupabase()
    path = "user-1/journal-1.json"
    client.entries["journal-1"]["snapshot_state_path"] = path
    client.entries["journal-1"]["snapshot_state_version"] = 1
    client.entries["journal-1"]["snapshot_captured_at"] = NOW.isoformat()
    client.objects[path] = b"{}"
    client.fail_delete = True
    monkeypatch.setattr(journal, "get_admin_client", lambda: client)

    with pytest.raises(RuntimeError, match="database delete failed"):
        asyncio.run(journal.delete_entry("journal-1", user_id="user-1"))

    assert client.entries["journal-1"]["snapshot_state_path"] == path
    assert path in client.objects
    assert client.remove_attempts == []


def test_atomic_delete_returns_snapshot_committed_by_racing_attach(monkeypatch):
    client = _FakeSupabase()
    client.attach_path_before_atomic_delete = True
    monkeypatch.setattr(journal, "get_admin_client", lambda: client)

    result = asyncio.run(journal.delete_entry("journal-1", user_id="user-1"))

    path = "user-1/journal-1.json"
    assert result == {"message": "Deleted"}
    assert "journal-1" not in client.entries
    assert path not in client.objects
    assert client.remove_attempts == [[path]]


def test_snapshot_migration_is_private_and_enforces_first_write_immutability():
    sql = (
        REPO_ROOT
        / "supabase/migrations/20260716120000_journal_snapshot_state.sql"
    ).read_text()

    assert "snapshot_image_path text" in sql
    assert "snapshot_state_path text" in sql
    assert "'trade-snapshots'" in sql
    assert "file_size_limit" in sql
    assert "65536" in sql
    assert "array['application/json']::text[]" in sql
    assert "prevent_journal_snapshot_rewrite" in sql
    assert "auth.role()" in sql
    assert "<> 'service_role'" in sql
    assert "snapshot metadata is server-owned" in sql
    assert "TG_OP = 'INSERT'" in sql
    assert "before insert or update on public.trade_journal" in sql
    assert "delete_trade_journal_with_snapshot_paths" in sql
    assert "delete from public.trade_journal as journal" in sql
    assert "returning journal.snapshot_state_path, journal.snapshot_image_path" in sql
    assert "from public, anon, authenticated" in sql
    assert "to service_role" in sql
    assert "for select" in sql
    assert "for update" not in sql
