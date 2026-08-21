import asyncio
import os

import pytest
from fastapi import HTTPException

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")

from app.routers import journal  # noqa: E402
from app.services.trade_excursion import CapturedIntradayPath  # noqa: E402


class _Response:
    def __init__(self, data):
        self.data = data


class _Query:
    def __init__(self, data):
        self.data = data
        self.upsert_payload = None
        self.upsert_conflict = None

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def maybe_single(self):
        return self

    def upsert(self, payload, on_conflict=None):
        self.upsert_payload = payload
        self.upsert_conflict = on_conflict
        return self

    def execute(self):
        return _Response(self.data)


class _ReadClient:
    def __init__(self, entry):
        self.entry = entry

    def table(self, name):
        assert name == "trade_journal"
        return _Query(self.entry)


class _AdminClient:
    def __init__(self):
        self.path_query = _Query([])

    def table(self, name):
        assert name == "trade_intraday_paths"
        return self.path_query


def _closed_entry():
    return {
        "id": "entry-1",
        "user_id": "user-1",
        "symbol": "RELIANCE",
        "trade_type": "long",
        "entry_date": "2026-08-01",
        "exit_date": "2026-08-01",
        "entry_price": 100,
        "stop_loss": 95,
        "status": "closed",
    }


def test_capture_route_reads_owner_scoped_entry_and_persists_metadata_only(monkeypatch):
    read_client = _ReadClient(_closed_entry())
    admin_client = _AdminClient()
    audits = []

    monkeypatch.setattr(journal, "get_user_client", lambda token: read_client)
    monkeypatch.setattr(journal, "get_admin_client", lambda: admin_client)
    monkeypatch.setattr(journal, "_get_user_plan", lambda _user_id: "pro")
    monkeypatch.setattr(
        journal,
        "capture_zerodha_intraday_path",
        lambda **_kwargs: CapturedIntradayPath(
            symbol="RELIANCE",
            broker="zerodha",
            interval="15minute",
            source="zerodha_kite",
            from_at="2026-08-01T00:00:00+00:00",
            to_at="2026-08-01T18:29:59+00:00",
            bars=[{"time": "2026-08-01T03:45:00+00:00", "open": 100, "high": 105, "low": 98, "close": 103, "volume": 100}],
        ),
    )
    monkeypatch.setattr(journal, "record_broker_audit_event", lambda **kwargs: audits.append(kwargs))

    result = asyncio.run(
        journal.capture_intraday_path(
            "entry-1",
            journal.IntradayPathCaptureRequest(interval="15minute"),
            user_id="user-1",
            user_jwt="user-jwt",
        )
    )

    assert result["journal_id"] == "entry-1"
    assert result["bar_count"] == 1
    assert admin_client.path_query.upsert_conflict == "user_id,journal_id,broker,interval,from_at,to_at"
    assert admin_client.path_query.upsert_payload["user_id"] == "user-1"
    assert admin_client.path_query.upsert_payload["bars"][0]["high"] == 105
    assert "token" not in repr(admin_client.path_query.upsert_payload).lower()
    assert audits[0]["event_type"] == "journal.intraday_path.capture"
    assert audits[0]["metadata"]["bar_count"] == 1


def test_capture_route_blocks_free_plan_before_provider_call(monkeypatch):
    monkeypatch.setattr(journal, "get_user_client", lambda _token: _ReadClient(_closed_entry()))
    monkeypatch.setattr(journal, "_get_user_plan", lambda _user_id: "free")
    provider_called = False

    def provider_should_not_run(**_kwargs):
        nonlocal provider_called
        provider_called = True
        raise AssertionError("provider must be plan-gated")

    monkeypatch.setattr(journal, "capture_zerodha_intraday_path", provider_should_not_run)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            journal.capture_intraday_path(
                "entry-1",
                journal.IntradayPathCaptureRequest(),
                user_id="user-1",
                user_jwt="user-jwt",
            )
        )

    assert exc.value.status_code == 403
    assert provider_called is False
