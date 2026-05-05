import asyncio
import os
import secrets
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException

os.environ.setdefault("BROKER_CREDS_KEY", secrets.token_bytes(32).hex())
os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")

from app.routers import broker as broker_router  # noqa: E402


class _Query:
    def __init__(self, client, table_name: str):
        self.client = client
        self.table_name = table_name
        self.insert_payload = None
        self.upsert_payload = None

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
        self.client.updated.append((self.table_name, payload))
        return self

    def upsert(self, payload, **_kwargs):
        self.upsert_payload = payload
        return self

    def execute(self):
        if self.table_name == "stock_universe":
            return type("Result", (), {"data": {"symbol": "RELIANCE", "company_name": "Reliance Industries"}})()
        if self.table_name == "trade_journal" and self.insert_payload is not None:
            self.client.journal_inserts.append(self.insert_payload)
            return type("Result", (), {"data": [{"id": "journal-1", **self.insert_payload}]})()
        if self.table_name == "workflow_states" and self.upsert_payload is not None:
            self.client.workflow_upserts.append(self.upsert_payload)
            return type("Result", (), {"data": [self.upsert_payload]})()
        return type("Result", (), {"data": None})()


class _FakeSupabase:
    def __init__(self):
        self.journal_inserts = []
        self.workflow_upserts = []
        self.updated = []

    def table(self, table_name: str):
        return _Query(self, table_name)


def _live_creds():
    return {
        "broker_type": "zerodha",
        "api_key": "kite-key",
        "access_token": "access-token",
        "expires_at": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
    }


def _order(live_confirmed: bool = False):
    return broker_router.PlaceOrderRequest(
        symbol="RELIANCE",
        side="buy",
        quantity=1,
        price=2500,
        order_type="market",
        stop_loss=2400,
        target_price=2750,
        source_page="watchlist",
        live_confirmed=live_confirmed,
    )


def test_order_from_valid_plan_carries_context_into_journal(monkeypatch):
    client = _FakeSupabase()
    monkeypatch.setattr(broker_router, "get_admin_client", lambda: client)
    monkeypatch.setattr(broker_router, "_get_user_broker_credentials", lambda *_args: {})

    order = _order()
    order.stop_loss = 2440
    order.target_price = 2680
    order.setup_type = "breakout"
    order.notes = "Scanner shortlist to watchlist queue"
    order.thesis = "Breakout holding above prior resistance with rising volume."
    order.invalidation_rule = "Exit if price closes below the breakout base."

    result = asyncio.run(broker_router.place_order(order, user_id="user-1"))

    assert result["broker"] == "simulated"
    assert result["journal_status"] == "open"
    assert client.journal_inserts
    entry = client.journal_inserts[0]
    assert entry["stop_loss"] == 2440
    assert entry["target_price"] == 2680
    assert entry["setup_type"] == "breakout"
    assert "Thesis: Breakout holding" in entry["entry_reason"]
    assert "Invalidation: Exit if price closes below" in entry["entry_reason"]


def test_live_order_requires_explicit_confirmation(monkeypatch):
    client = _FakeSupabase()
    monkeypatch.setattr(broker_router, "get_admin_client", lambda: client)
    monkeypatch.setattr(broker_router, "_get_user_broker_credentials", lambda *_args: _live_creds())

    with pytest.raises(HTTPException) as exc:
        asyncio.run(broker_router.place_order(_order(live_confirmed=False), user_id="user-1"))

    assert exc.value.status_code == 409
    assert "explicit confirmation" in str(exc.value.detail)
    assert client.journal_inserts == []


def test_confirmed_live_order_failure_does_not_create_simulated_journal(monkeypatch):
    client = _FakeSupabase()
    monkeypatch.setattr(broker_router, "get_admin_client", lambda: client)
    monkeypatch.setattr(broker_router, "_get_user_broker_credentials", lambda *_args: _live_creds())
    monkeypatch.setattr(broker_router, "_place_zerodha_order", lambda *_args, **_kwargs: None)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(broker_router.place_order(_order(live_confirmed=True), user_id="user-1"))

    assert exc.value.status_code == 502
    assert "No simulated order was created" in str(exc.value.detail)
    assert client.journal_inserts == []
