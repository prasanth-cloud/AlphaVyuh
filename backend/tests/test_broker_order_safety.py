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
from app.brokers.adapter import BrokerCredentials, BrokerOrderId, BrokerProfile, Order, OrderResult  # noqa: E402


class _Query:
    def __init__(self, client, table_name: str):
        self.client = client
        self.table_name = table_name
        self.insert_payload = None
        self.update_payload = None
        self.upsert_payload = None
        self.ilike_value = None
        self.filters = {}
        self.single = False

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, column, value):
        self.filters[column] = value
        return self

    def ilike(self, _column, value):
        self.ilike_value = value.replace("%", "")
        return self

    def order(self, *_args, **_kwargs):
        return self

    def limit(self, *_args, **_kwargs):
        return self

    def maybe_single(self):
        self.single = True
        return self

    def insert(self, payload):
        self.insert_payload = payload
        return self

    def update(self, payload):
        self.update_payload = payload
        self.client.updated.append((self.table_name, payload))
        return self

    def upsert(self, payload, **_kwargs):
        self.upsert_payload = payload
        return self

    def execute(self):
        if self.table_name == "users":
            return type("Result", (), {"data": {"plan": "pro", "plan_expires_at": None}})()
        if self.table_name == "stock_universe":
            return type("Result", (), {"data": {"symbol": "RELIANCE", "company_name": "Reliance Industries", "isin": "INE002A01018"}})()
        if self.table_name == "setups":
            return type("Result", (), {"data": {
                "id": self.filters.get("id", "11111111-1111-4111-8111-111111111111"),
                "user_id": self.filters.get("user_id", "user-1"),
                "symbol": "RELIANCE",
            }})()
        if self.table_name == "trade_journal" and self.insert_payload is not None:
            if self.client.journal_insert_conflict:
                self.client.journal_insert_conflict = False
                self.client.journal_inserts.append(self.insert_payload)
                raise RuntimeError("duplicate key value violates unique constraint")
            self.client.journal_inserts.append(self.insert_payload)
            return type("Result", (), {"data": [{"id": "journal-1", **self.insert_payload}]})()
        if self.table_name == "trade_journal" and self.filters:
            matches = [
                {
                    "id": f"journal-{idx + 1}",
                    "created_at": "2026-05-05T12:00:00+00:00",
                    **row,
                }
                for idx, row in enumerate(self.client.journal_inserts)
                if all(row.get(key) == value for key, value in self.filters.items())
            ]
            return type("Result", (), {"data": (matches[0] if matches else None) if self.single else matches})()
        if self.table_name == "broker_orders" and self.insert_payload is not None:
            row = {"id": f"broker-order-row-{len(self.client.broker_order_inserts) + 1}", **self.insert_payload}
            self.client.broker_order_inserts.append(row)
            return type("Result", (), {"data": [row]})()
        if self.table_name == "broker_orders" and self.update_payload is not None:
            for row in self.client.broker_order_inserts:
                if all(row.get(key) == value for key, value in self.filters.items()):
                    row.update(self.update_payload)
            return type("Result", (), {"data": None})()
        if self.table_name == "broker_orders":
            matches = [
                row for row in self.client.broker_order_inserts
                if all(row.get(key) == value for key, value in self.filters.items())
            ]
            return type("Result", (), {"data": (matches[0] if matches else None) if self.single else matches})()
        if self.table_name == "trade_journal" and self.ilike_value:
            matches = [
                {
                    "id": f"journal-{idx + 1}",
                    "created_at": "2026-05-05T12:00:00+00:00",
                    **row,
                }
                for idx, row in enumerate(self.client.journal_inserts)
                if self.ilike_value in str(row.get("entry_reason", ""))
            ]
            return type("Result", (), {"data": matches})()
        if self.table_name == "workflow_states" and self.upsert_payload is not None:
            self.client.workflow_upserts.append(self.upsert_payload)
            return type("Result", (), {"data": [self.upsert_payload]})()
        if self.table_name == "workflow_states" and self.client.workflow_state is not None:
            return type("Result", (), {"data": self.client.workflow_state})()
        if self.table_name == "broker_connections" and self.upsert_payload is not None:
            self.client.broker_connection_upserts.append(self.upsert_payload)
            broker = self.upsert_payload.get("broker")
            if broker:
                self.client.broker_connection_metadata[broker] = self.upsert_payload.get("metadata")
            return type("Result", (), {"data": [self.upsert_payload]})()
        if self.table_name == "broker_connections":
            broker = self.filters.get("broker")
            metadata = self.client.broker_connection_metadata.get(broker)
            if metadata is not None:
                return type("Result", (), {"data": {"metadata": metadata}})()
            return type("Result", (), {"data": None})()
        return type("Result", (), {"data": None})()


class _FakeSupabase:
    def __init__(self):
        self.journal_inserts = []
        self.workflow_upserts = []
        self.workflow_state = None
        self.updated = []
        self.broker_connection_metadata = {}
        self.broker_connection_upserts = []
        self.broker_order_inserts = []
        self.journal_insert_conflict = False

    def table(self, table_name: str):
        return _Query(self, table_name)


def _live_creds():
    return {
        "broker_type": "zerodha",
        "api_key": "kite-key",
        "access_token": "access-token",
        "expires_at": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
    }


def _upstox_creds():
    return {
        "broker_type": "upstox",
        "api_key": "upstox-key",
        "access_token": "upstox-token",
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


def _live_order():
    order = _order(live_confirmed=True)
    order.setup_id = "11111111-1111-4111-8111-111111111111"
    order.idempotency_key = "22222222-2222-4222-8222-222222222222"
    return order


def _fresh_read_only_smoke(broker: str):
    return {
        "read_only_smoke": {
            "broker": broker,
            "passed": True,
            "checked_at": datetime.now(timezone.utc).isoformat(),
        }
    }


def test_order_from_valid_plan_carries_context_into_journal(monkeypatch):
    client = _FakeSupabase()
    client.workflow_state = {
        "source": "watchlist",
        "setup_type": "breakout",
        "thesis": "Workflow thesis should be overridden by request thesis.",
        "invalidation_rule": "Workflow invalidation should be overridden.",
        "scanner_context": {
            "preset_name": "Trend Template",
            "match_reasons": ["Volume expansion with trend alignment"],
            "setup_grade": "A",
            "setup_score": 84,
            "data_as_of": "2026-05-15",
        },
        "notes": "Workflow note",
    }
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
    assert entry["source_page"] == "watchlist"
    assert entry["source_context"] is None
    assert entry["scanner_context"]["preset_name"] == "Trend Template"
    assert entry["thesis"] == "Breakout holding above prior resistance with rising volume."
    assert entry["invalidation_rule"] == "Exit if price closes below the breakout base."
    assert "Scanner: Trend Template" in entry["entry_reason"]
    assert "Matched: Volume expansion with trend alignment" in entry["entry_reason"]
    assert "Thesis: Breakout holding" in entry["entry_reason"]
    assert "Invalidation: Exit if price closes below" in entry["entry_reason"]
    assert client.workflow_upserts[-1]["scanner_context"]["setup_score"] == 84


def test_repeated_order_intent_reuses_existing_journal_entry(monkeypatch):
    client = _FakeSupabase()
    monkeypatch.setattr(broker_router, "get_admin_client", lambda: client)
    monkeypatch.setattr(broker_router, "_get_user_broker_credentials", lambda *_args: {})
    intent_key = "11111111-1111-4111-8111-111111111111"
    order = _order()
    order.idempotency_key = intent_key

    first = asyncio.run(broker_router.place_order(order, user_id="user-1"))
    second = asyncio.run(broker_router.place_order(order, user_id="user-1"))

    assert first["status"] == "filled"
    assert second["status"] == "deduplicated"
    assert second["journal_id"] == first["journal_id"]
    assert second["broker_order_id"] is None
    assert len(client.journal_inserts) == 1
    assert len(client.workflow_upserts) == 1
    assert f"[{broker_router.ORDER_INTENT_MARKER}:{intent_key}]" in client.journal_inserts[0]["entry_reason"]


def test_reused_order_intent_rejects_materially_changed_order(monkeypatch):
    client = _FakeSupabase()
    monkeypatch.setattr(broker_router, "get_admin_client", lambda: client)
    monkeypatch.setattr(broker_router, "_get_user_broker_credentials", lambda *_args: {})
    intent_key = "11111111-1111-4111-8111-111111111111"
    order = _order()
    order.idempotency_key = intent_key

    asyncio.run(broker_router.place_order(order, user_id="user-1"))
    changed = _order()
    changed.quantity = order.quantity + 1
    changed.idempotency_key = intent_key

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(broker_router.place_order(changed, user_id="user-1"))

    assert exc_info.value.status_code == 409
    assert "different order" in str(exc_info.value.detail)
    assert len(client.journal_inserts) == 1
    assert len(client.workflow_upserts) == 1


def test_unique_journal_intent_conflict_reuses_winning_entry(monkeypatch):
    client = _FakeSupabase()
    client.journal_insert_conflict = True
    monkeypatch.setattr(broker_router, "get_admin_client", lambda: client)
    monkeypatch.setattr(broker_router, "_get_user_broker_credentials", lambda *_args: {})
    intent_key = "44444444-4444-4444-8444-444444444444"
    order = _order()
    order.idempotency_key = intent_key

    result = asyncio.run(broker_router.place_order(order, user_id="user-1"))

    assert result["status"] == "deduplicated"
    assert result["journal_id"] == "journal-1"
    assert len(client.journal_inserts) == 1
    assert client.journal_inserts[0]["order_intent_key"] == intent_key
    assert client.workflow_upserts == []


def test_trade_lesson_generation_does_not_overwrite_user_review():
    client = _FakeSupabase()

    broker_router._trigger_ai_analysis(client, {
        "id": "journal-1",
        "symbol": "RELIANCE",
        "status": "closed",
        "lessons": "User-written process lesson.",
        "pnl": -100,
    })

    assert client.updated == []


def test_professional_access_blocks_live_confirmation_before_broker_call(monkeypatch):
    client = _FakeSupabase()
    monkeypatch.setattr(broker_router, "get_admin_client", lambda: client)
    monkeypatch.setattr(broker_router.settings, "broker_live_orders_enabled", False)
    monkeypatch.setattr(broker_router, "_get_user_broker_credentials", lambda *_args: _live_creds())

    with pytest.raises(HTTPException) as exc:
        asyncio.run(broker_router.place_order(_live_order(), user_id="user-1"))

    assert exc.value.status_code == 403
    assert "Live broker order placement is not enabled" in str(exc.value.detail)
    assert client.journal_inserts == []


def test_free_plan_blocks_live_broker_order_when_execution_enabled(monkeypatch):
    client = _FakeSupabase()
    monkeypatch.setattr(broker_router, "get_admin_client", lambda: client)
    monkeypatch.setattr(broker_router.settings, "broker_live_orders_enabled", True)
    monkeypatch.setattr(broker_router, "_get_user_plan", lambda _user_id: ("free", None))
    monkeypatch.setattr(broker_router, "_get_user_broker_credentials", lambda *_args: _live_creds())

    with pytest.raises(HTTPException) as exc:
        asyncio.run(broker_router.place_order(_live_order(), user_id="user-1"))

    assert exc.value.status_code == 403
    assert exc.value.detail["error"] == "plan_required"
    assert client.journal_inserts == []


def test_live_order_requires_explicit_confirmation(monkeypatch):
    client = _FakeSupabase()
    monkeypatch.setattr(broker_router, "get_admin_client", lambda: client)
    monkeypatch.setattr(broker_router.settings, "broker_live_orders_enabled", True)
    monkeypatch.setattr(broker_router, "_get_user_broker_credentials", lambda *_args: _live_creds())

    with pytest.raises(HTTPException) as exc:
        asyncio.run(broker_router.place_order(_order(live_confirmed=False), user_id="user-1"))

    assert exc.value.status_code == 409
    assert "explicit confirmation" in str(exc.value.detail)
    assert client.journal_inserts == []


def test_confirmed_live_order_requires_durable_setup(monkeypatch):
    client = _FakeSupabase()
    monkeypatch.setattr(broker_router, "get_admin_client", lambda: client)
    monkeypatch.setattr(broker_router.settings, "broker_live_orders_enabled", True)
    monkeypatch.setattr(broker_router, "_get_user_broker_credentials", lambda *_args: _live_creds())

    with pytest.raises(HTTPException) as exc:
        asyncio.run(broker_router.place_order(_order(live_confirmed=True), user_id="user-1"))

    assert exc.value.status_code == 409
    assert "durable setup" in str(exc.value.detail)
    assert client.journal_inserts == []


def test_confirmed_live_order_requires_caller_idempotency_key(monkeypatch):
    client = _FakeSupabase()
    monkeypatch.setattr(broker_router, "get_admin_client", lambda: client)
    monkeypatch.setattr(broker_router.settings, "broker_live_orders_enabled", True)
    monkeypatch.setattr(broker_router, "_get_user_broker_credentials", lambda *_args: _live_creds())
    order = _live_order()
    order.idempotency_key = None

    with pytest.raises(HTTPException) as exc:
        asyncio.run(broker_router.place_order(order, user_id="user-1"))

    assert exc.value.status_code == 409
    assert "idempotency key" in str(exc.value.detail)
    assert client.journal_inserts == []


def test_confirmed_live_order_rejects_missing_credentials_without_simulation(monkeypatch):
    client = _FakeSupabase()
    monkeypatch.setattr(broker_router, "get_admin_client", lambda: client)
    monkeypatch.setattr(broker_router.settings, "broker_live_orders_enabled", True)
    monkeypatch.setattr(broker_router, "_get_user_broker_credentials", lambda *_args: {})

    with pytest.raises(HTTPException) as exc:
        asyncio.run(broker_router.place_order(_live_order(), user_id="user-1"))

    assert exc.value.status_code == 503
    assert "credentials are unavailable" in str(exc.value.detail)
    assert "No simulated order was created" in str(exc.value.detail)
    assert client.journal_inserts == []


def test_confirmed_live_order_rejects_expired_credentials_without_simulation(monkeypatch):
    client = _FakeSupabase()
    expired = _live_creds()
    expired["expires_at"] = (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()
    monkeypatch.setattr(broker_router, "get_admin_client", lambda: client)
    monkeypatch.setattr(broker_router.settings, "broker_live_orders_enabled", True)
    monkeypatch.setattr(broker_router, "_get_user_broker_credentials", lambda *_args: expired)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(broker_router.place_order(_live_order(), user_id="user-1"))

    assert exc.value.status_code == 503
    assert "credentials are unavailable or expired" in str(exc.value.detail)
    assert client.journal_inserts == []


def test_live_confirmed_order_requires_matching_read_only_smoke(monkeypatch):
    client = _FakeSupabase()
    called = {"adapter": False}

    class _Adapter:
        async def place_order(self, *_args, **_kwargs):
            called["adapter"] = True
            raise AssertionError("adapter must not run until read-only smoke passes")

    monkeypatch.setattr(broker_router, "get_admin_client", lambda: client)
    monkeypatch.setattr(broker_router.settings, "broker_live_orders_enabled", True)
    monkeypatch.setattr(broker_router, "_get_user_broker_credentials", lambda *_args: _live_creds())
    monkeypatch.setattr(broker_router, "get_adapter", lambda _broker: _Adapter())

    with pytest.raises(HTTPException) as exc:
        asyncio.run(broker_router.place_order(_live_order(), user_id="user-1"))

    assert exc.value.status_code == 409
    assert "read-only broker smoke passes" in str(exc.value.detail)
    assert called["adapter"] is False
    assert client.journal_inserts == []


def test_live_confirmed_order_requires_smoke_for_same_broker(monkeypatch):
    client = _FakeSupabase()
    client.broker_connection_metadata["zerodha"] = {
        "read_only_smoke": {"broker": "upstox", "passed": True}
    }
    monkeypatch.setattr(broker_router, "get_admin_client", lambda: client)
    monkeypatch.setattr(broker_router.settings, "broker_live_orders_enabled", True)
    monkeypatch.setattr(broker_router, "_get_user_broker_credentials", lambda *_args: _live_creds())

    with pytest.raises(HTTPException) as exc:
        asyncio.run(broker_router.place_order(_live_order(), user_id="user-1"))

    assert exc.value.status_code == 409
    assert "Live zerodha order placement is blocked" in str(exc.value.detail)
    assert client.journal_inserts == []


def test_confirmed_live_order_failure_does_not_create_simulated_journal(monkeypatch):
    client = _FakeSupabase()
    client.broker_connection_metadata["zerodha"] = _fresh_read_only_smoke("zerodha")
    monkeypatch.setattr(broker_router, "get_admin_client", lambda: client)
    monkeypatch.setattr(broker_router.settings, "broker_live_orders_enabled", True)
    monkeypatch.setattr(broker_router, "_get_user_broker_credentials", lambda *_args: _live_creds())

    class _FailingZerodhaAdapter:
        async def place_order(self, *_args, **_kwargs):
            raise broker_router.BrokerError(
                kind="NETWORK",
                broker_id="zerodha",
                message="network",
                retryable=True,
            )

    monkeypatch.setattr(broker_router, "get_adapter", lambda _broker: _FailingZerodhaAdapter())

    with pytest.raises(HTTPException) as exc:
        asyncio.run(broker_router.place_order(_live_order(), user_id="user-1"))

    assert exc.value.status_code == 502
    assert "No simulated order was created" in str(exc.value.detail)
    assert client.journal_inserts == []


def test_confirmed_upstox_pending_order_does_not_create_open_journal(monkeypatch):
    client = _FakeSupabase()
    client.broker_connection_metadata["upstox"] = _fresh_read_only_smoke("upstox")
    captured = {}

    class _FakeUpstoxAdapter:
        async def place_order(self, user_id, creds, order):
            captured["calls"] = captured.get("calls", 0) + 1
            captured["user_id"] = user_id
            captured["creds"] = creds
            captured["order"] = order
            now = datetime.now(timezone.utc)
            return OrderResult(
                order=Order(
                    id=order.idempotency_key,
                    broker_order_id=BrokerOrderId("upstox-order-1"),
                    symbol=order.symbol,
                    exchange=order.exchange,
                    side=order.side,
                    order_type=order.order_type,
                    product=order.product,
                    status="PENDING",
                    quantity=order.quantity,
                    filled_quantity=0,
                    average_price=0,
                    fills=[],
                    child_broker_order_ids=[],
                    placed_at=now,
                    updated_at=now,
                ),
                from_cache=False,
            )

    monkeypatch.setattr(broker_router, "get_admin_client", lambda: client)
    monkeypatch.setattr(broker_router.settings, "broker_live_orders_enabled", True)
    monkeypatch.setattr(
        broker_router,
        "_get_user_broker_credentials",
        lambda _user_id, broker="zerodha": {"broker_type": "upstox"} if broker == "zerodha" else _upstox_creds(),
    )
    monkeypatch.setattr(broker_router, "UpstoxAdapter", _FakeUpstoxAdapter)

    intent_key = "33333333-3333-4333-8333-333333333333"
    order = _live_order()
    order.idempotency_key = intent_key
    repeated_order = _live_order()
    repeated_order.idempotency_key = intent_key
    result = asyncio.run(broker_router.place_order(order, user_id="user-1"))
    repeated = asyncio.run(broker_router.place_order(repeated_order, user_id="user-1"))

    assert result["broker"] == "upstox"
    assert result["broker_order_id"] == "upstox-order-1"
    assert result["status"] == "submitted"
    assert result["execution_status"] == "PENDING"
    assert result["filled_quantity"] == 0
    assert result["requires_reconciliation"] is True
    assert result["journal_id"] is None
    assert result["journal_status"] is None
    assert repeated["status"] == "submitted"
    assert repeated["broker_order_id"] == "upstox-order-1"
    assert captured["calls"] == 1
    assert captured["user_id"] == "user-1"
    assert captured["creds"].broker_id == "upstox"
    assert captured["order"].idempotency_key
    assert captured["order"].extensions.upstox.instrument_token == "NSE_EQ|INE002A01018"
    assert client.journal_inserts == []
    assert len(client.broker_order_inserts) == 1
    assert client.workflow_upserts[-1]["lifecycle"] == "triggered"


def test_confirmed_upstox_partial_fill_records_only_filled_quantity(monkeypatch):
    client = _FakeSupabase()
    client.broker_connection_metadata["upstox"] = _fresh_read_only_smoke("upstox")

    class _FakeUpstoxAdapter:
        async def place_order(self, _user_id, _creds, order):
            now = datetime.now(timezone.utc)
            return OrderResult(
                order=Order(
                    id=order.idempotency_key,
                    broker_order_id=BrokerOrderId("upstox-order-partial"),
                    symbol=order.symbol,
                    exchange=order.exchange,
                    side=order.side,
                    order_type=order.order_type,
                    product=order.product,
                    status="PARTIAL",
                    quantity=order.quantity,
                    filled_quantity=2,
                    average_price=2480,
                    fills=[],
                    child_broker_order_ids=[],
                    placed_at=now,
                    updated_at=now,
                ),
                from_cache=False,
            )

    monkeypatch.setattr(broker_router, "get_admin_client", lambda: client)
    monkeypatch.setattr(broker_router.settings, "broker_live_orders_enabled", True)
    monkeypatch.setattr(
        broker_router,
        "_get_user_broker_credentials",
        lambda _user_id, broker="zerodha": {"broker_type": "upstox"} if broker == "zerodha" else _upstox_creds(),
    )
    monkeypatch.setattr(broker_router, "UpstoxAdapter", _FakeUpstoxAdapter)
    order = _live_order()
    order.quantity = 5

    result = asyncio.run(broker_router.place_order(order, user_id="user-1"))

    assert result["status"] == "partially_filled"
    assert result["execution_status"] == "PARTIAL"
    assert result["filled_quantity"] == 2
    assert result["average_fill_price"] == 2480
    assert result["journal_status"] == "open"
    assert client.journal_inserts[-1]["quantity"] == 2
    assert client.journal_inserts[-1]["entry_price"] == 2480
    assert client.journal_inserts[-1]["risk_reward"] == 3.38
    assert client.workflow_upserts[-1]["position_size"] == 2
    assert client.workflow_upserts[-1]["lifecycle"] == "open"


def test_reconcile_pending_order_creates_journal_after_fill(monkeypatch):
    client = _FakeSupabase()
    client.broker_order_inserts.append({
        "id": "broker-order-row-1",
        "user_id": "user-1",
        "broker": "upstox",
        "broker_order_id": "upstox-order-1",
        "journal_id": None,
        "status": "PENDING",
        "raw_response": {
            "journal_draft": {
                "user_id": "user-1",
                "symbol": "RELIANCE",
                "company_name": "Reliance Industries",
                "trade_type": "long",
                "entry_date": "2026-06-18",
                "entry_price": 2500,
                "quantity": 5,
                "stop_loss": 2400,
                "target_price": 2750,
                "setup_type": "breakout",
                "entry_reason": "Breakout [Upstox · Watchlist]",
                "risk_reward": 2.5,
                "source_page": "watchlist",
                "source_context": "Swing queue",
                "scanner_context": None,
                "thesis": "Base breakout",
                "invalidation_rule": "Close below base",
                "status": "open",
            },
        },
    })

    class _FilledAdapter:
        async def get_order(self, _creds, _broker_order_id):
            now = datetime.now(timezone.utc)
            return Order(
                id=broker_router.IdempotencyKey("11111111-1111-4111-8111-111111111111"),
                broker_order_id=BrokerOrderId("upstox-order-1"),
                symbol="RELIANCE",
                exchange="NSE",
                side="BUY",
                order_type="MARKET",
                product="CNC",
                status="COMPLETE",
                quantity=5,
                filled_quantity=5,
                average_price=2490,
                fills=[],
                child_broker_order_ids=[],
                placed_at=now,
                updated_at=now,
            )

    monkeypatch.setattr(broker_router, "get_admin_client", lambda: client)
    monkeypatch.setattr(broker_router, "_get_user_broker_credentials", lambda *_args: _upstox_creds())
    monkeypatch.setattr(broker_router, "get_adapter", lambda _broker: _FilledAdapter())

    result = asyncio.run(
        broker_router.reconcile_broker_order("upstox-order-1", user_id="user-1")
    )

    assert result["status"] == "filled"
    assert result["execution_status"] == "COMPLETE"
    assert result["journal_id"] == "journal-1"
    assert result["requires_reconciliation"] is False
    assert client.journal_inserts[-1]["quantity"] == 5
    assert client.journal_inserts[-1]["entry_price"] == 2490
    assert client.broker_order_inserts[0]["journal_id"] == "journal-1"
    assert client.broker_order_inserts[0]["status"] == "COMPLETE"
    assert client.workflow_upserts[-1]["lifecycle"] == "open"


def test_broker_activity_normalizes_lifecycle_without_exposing_draft(monkeypatch):
    client = _FakeSupabase()
    client.broker_order_inserts.extend([
        {
            "id": "broker-order-row-1",
            "user_id": "user-1",
            "broker": "upstox",
            "broker_order_id": "upstox-pending",
            "journal_id": None,
            "symbol": "reliance",
            "side": "BUY",
            "quantity": 5,
            "order_type": "LIMIT",
            "price": 2500,
            "status": "PENDING",
            "placed_at": "2026-06-18T14:00:00+00:00",
            "raw_response": {
                "filled_quantity": 0,
                "journal_draft": {"thesis": "must not be returned"},
            },
        },
        {
            "id": "broker-order-row-2",
            "user_id": "user-1",
            "broker": "zerodha",
            "broker_order_id": "kite-complete",
            "journal_id": "journal-1",
            "symbol": "TCS",
            "side": "SELL",
            "quantity": 3,
            "order_type": "MARKET",
            "price": 3500,
            "status": "COMPLETE",
            "placed_at": "2026-06-18T13:00:00+00:00",
            "raw_response": {
                "filled_quantity": 3,
                "average_fill_price": 3492.5,
                "reconciled_at": "2026-06-18T13:01:00+00:00",
            },
        },
    ])
    monkeypatch.setattr(broker_router, "get_admin_client", lambda: client)

    result = asyncio.run(broker_router.broker_order_activity(limit=25, user_id="user-1"))

    assert result["count"] == 2
    pending, complete = result["orders"]
    assert pending["symbol"] == "RELIANCE"
    assert pending["requires_reconciliation"] is True
    assert pending["journal_state"] == "not_created"
    assert "raw_response" not in pending
    assert complete["execution_status"] == "COMPLETE"
    assert complete["filled_quantity"] == 3
    assert complete["average_fill_price"] == 3492.5
    assert complete["journal_state"] == "recorded"


def test_zerodha_import_deduplicates_by_broker_marker(monkeypatch):
    client = _FakeSupabase()
    orders = [
        {
            "status": "COMPLETE",
            "tradingsymbol": "RELIANCE",
            "filled_quantity": 10,
            "average_price": 2500,
            "transaction_type": "BUY",
            "order_id": "kite-order-1",
            "exchange_timestamp": "2026-05-05 10:20:00",
        }
    ]
    monkeypatch.setattr(broker_router, "get_admin_client", lambda: client)
    monkeypatch.setattr(broker_router, "_get_user_broker_credentials", lambda *_args: _live_creds())
    monkeypatch.setattr(broker_router.kite_api, "list_orders", lambda **_kwargs: orders)

    first = asyncio.run(broker_router.import_zerodha_trades(user_id="user-1"))
    second = asyncio.run(broker_router.import_zerodha_trades(user_id="user-1"))

    assert first["imported"] == 1
    assert first["skipped"] == 0
    assert second["imported"] == 0
    assert second["skipped"] == 1
    assert len(client.journal_inserts) == 1
    assert "alphavyuh-broker-import:zerodha:order:kite-order-1" in client.journal_inserts[0]["entry_reason"]


def test_zerodha_import_preserves_read_only_smoke_metadata(monkeypatch):
    client = _FakeSupabase()
    existing_metadata = _fresh_read_only_smoke("zerodha")
    client.broker_connection_metadata["zerodha"] = existing_metadata
    monkeypatch.setattr(broker_router, "get_admin_client", lambda: client)
    monkeypatch.setattr(broker_router, "_get_user_broker_credentials", lambda *_args: _live_creds())
    monkeypatch.setattr(broker_router.kite_api, "list_orders", lambda **_kwargs: [])

    result = asyncio.run(broker_router.import_zerodha_trades(user_id="user-1"))

    assert result["imported"] == 0
    assert client.broker_connection_upserts
    assert client.broker_connection_upserts[-1]["metadata"] == existing_metadata


def test_zerodha_read_only_smoke_never_places_orders(monkeypatch):
    client = _FakeSupabase()
    monkeypatch.setattr(broker_router, "get_admin_client", lambda: client)
    monkeypatch.setattr(broker_router, "_require_broker_plan", lambda _user_id: ("pro", None))
    monkeypatch.setattr(broker_router, "_get_user_broker_credentials", lambda *_args: _live_creds())
    monkeypatch.setattr(broker_router.kite_api, "get_profile", lambda *_args, **_kwargs: {"user_id": "kite-user"})
    monkeypatch.setattr(broker_router.kite_api, "get_positions", lambda *_args, **_kwargs: {"net": [{"tradingsymbol": "RELIANCE"}]})
    monkeypatch.setattr(broker_router.kite_api, "get_holdings", lambda *_args, **_kwargs: [{"tradingsymbol": "INFY"}])
    monkeypatch.setattr(broker_router.kite_api, "list_orders", lambda *_args, **_kwargs: [{"status": "COMPLETE", "order_id": "kite-order-1"}])
    monkeypatch.setattr(broker_router.kite_api, "get_order_trades", lambda *_args, **_kwargs: [{"trade_id": "trade-1"}])

    result = asyncio.run(broker_router.zerodha_read_only_smoke(user_id="user-1"))

    assert result["connected_read_only"] is True
    assert result["checks"]["profile"]["ok"] is True
    assert result["checks"]["positions"]["count"] == 1
    assert result["checks"]["holdings"]["count"] == 1
    assert result["checks"]["orderbook"]["count"] == 1
    assert result["checks"]["tradebook"]["count"] == 1
    assert client.broker_connection_upserts
    metadata = client.broker_connection_upserts[-1]["metadata"]
    assert metadata == {
        "read_only_smoke": {
            "broker": "zerodha",
            "passed": True,
            "checked_at": metadata["read_only_smoke"]["checked_at"],
            "checks": {
                "login_url": {"ok": True},
                "profile": {"ok": True, "user_id_present": True},
                "positions": {"ok": True, "count": 1},
                "holdings": {"ok": True, "count": 1},
                "orderbook": {"ok": True, "count": 1},
                "tradebook": {"ok": True, "count": 1},
            },
        }
    }
    assert "access" not in str(metadata).lower()
    assert "token" not in str(metadata).lower()


def test_broker_status_returns_sanitized_read_only_smoke_checks(monkeypatch):
    client = _FakeSupabase()
    checked_at = datetime.now(timezone.utc).isoformat()
    client.broker_connection_metadata["zerodha"] = {
        "read_only_smoke": {
            "broker": "zerodha",
            "passed": True,
            "checked_at": checked_at,
            "checks": {
                "profile": {"ok": True, "user_id_present": True},
                "holdings": {"ok": True, "count": 2},
                "orderbook": {"ok": True, "count": 5},
            },
        }
    }
    monkeypatch.setattr(broker_router, "get_admin_client", lambda: client)
    monkeypatch.setattr(broker_router, "_get_user_plan", lambda _user_id: ("pro", None))
    monkeypatch.setattr(broker_router, "_broker_env_value", lambda *_args: "kite-key")
    monkeypatch.setattr(broker_router, "_get_stored_credential", lambda _user_id, _broker, key: (
        (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat() if key == "expires_at" else "stored-token"
    ))

    result = asyncio.run(broker_router.broker_status(user_id="user-1"))

    assert result["read_only_smoke_passed"] is True
    assert result["read_only_smoke_fresh"] is True
    assert result["read_only_smoke_checked_at"] == checked_at
    assert result["read_only_smoke_checks"]["profile"]["user_id_present"] is True
    assert result["read_only_smoke_checks"]["holdings"]["count"] == 2
    assert "stored-token" not in str(result)


def test_live_confirmed_order_rejects_stale_read_only_smoke(monkeypatch):
    client = _FakeSupabase()
    client.broker_connection_metadata["zerodha"] = {
        "read_only_smoke": {
            "broker": "zerodha",
            "passed": True,
            "checked_at": (datetime.now(timezone.utc) - timedelta(hours=25)).isoformat(),
        }
    }
    called = {"adapter": False}

    class _Adapter:
        async def place_order(self, *_args, **_kwargs):
            called["adapter"] = True
            raise AssertionError("adapter must not run for stale smoke")

    monkeypatch.setattr(broker_router, "get_admin_client", lambda: client)
    monkeypatch.setattr(broker_router.settings, "broker_live_orders_enabled", True)
    monkeypatch.setattr(broker_router, "_get_user_broker_credentials", lambda *_args: _live_creds())
    monkeypatch.setattr(broker_router, "get_adapter", lambda _broker: _Adapter())

    with pytest.raises(HTTPException) as exc:
        asyncio.run(broker_router.place_order(_live_order(), user_id="user-1"))

    assert exc.value.status_code == 409
    assert "read-only broker smoke passes" in str(exc.value.detail)
    assert called["adapter"] is False
    assert client.journal_inserts == []


def test_broker_status_marks_stale_read_only_smoke_unpassed(monkeypatch):
    client = _FakeSupabase()
    checked_at = (datetime.now(timezone.utc) - timedelta(hours=25)).isoformat()
    client.broker_connection_metadata["zerodha"] = {
        "read_only_smoke": {
            "broker": "zerodha",
            "passed": True,
            "checked_at": checked_at,
            "checks": {"profile": {"ok": True, "user_id_present": True}},
        }
    }
    monkeypatch.setattr(broker_router, "get_admin_client", lambda: client)
    monkeypatch.setattr(broker_router, "_get_user_plan", lambda _user_id: ("pro", None))
    monkeypatch.setattr(broker_router, "_broker_env_value", lambda *_args: "kite-key")
    monkeypatch.setattr(broker_router, "_get_stored_credential", lambda _user_id, _broker, key: (
        (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat() if key == "expires_at" else "stored-token"
    ))

    result = asyncio.run(broker_router.broker_status(user_id="user-1"))

    assert result["read_only_smoke_passed"] is False
    assert result["read_only_smoke_fresh"] is False
    assert result["read_only_smoke_checked_at"] == checked_at
    assert result["live_order_enabled"] is False


def test_broker_status_does_not_enable_orders_without_active_session(monkeypatch):
    client = _FakeSupabase()
    client.broker_connection_metadata["zerodha"] = _fresh_read_only_smoke("zerodha")
    monkeypatch.setattr(broker_router, "get_admin_client", lambda: client)
    monkeypatch.setattr(broker_router.settings, "broker_live_orders_enabled", True)
    monkeypatch.setattr(broker_router, "_get_user_plan", lambda _user_id: ("pro", None))
    monkeypatch.setattr(broker_router, "_broker_env_value", lambda *_args: None)
    monkeypatch.setattr(broker_router, "_get_stored_credential", lambda *_args: None)

    result = asyncio.run(broker_router.broker_status(user_id="user-1"))

    assert result["read_only_smoke_passed"] is True
    assert result["connected"] is False
    assert result["live_order_enabled"] is False


def test_broker_json_callback_rejects_invalid_oauth_state_before_exchange(monkeypatch):
    class _Adapter:
        async def exchange_code(self, _code):
            raise AssertionError("exchange_code must not run for invalid state")

    monkeypatch.setattr(broker_router, "_require_broker_plan", lambda _user_id: ("pro", None))
    monkeypatch.setattr(broker_router, "get_adapter", lambda _broker: _Adapter())

    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            broker_router.broker_oauth_callback(
                "upstox",
                broker_router.BrokerCallbackRequest(code_or_token="oauth-code", state="bad-state"),
                user_id="user-1",
            )
        )

    assert exc.value.status_code == 400
    assert "state expired or invalid" in str(exc.value.detail)


def test_broker_json_callback_accepts_signed_oauth_state(monkeypatch):
    client = _FakeSupabase()
    saved: dict[tuple[str, str], str] = {}

    class _Adapter:
        async def exchange_code(self, code):
            assert code == "oauth-code"
            return BrokerCredentials(
                broker_id="upstox",
                access_token="access-token",
                refresh_token="refresh-token",
                expires_at=datetime(2026, 5, 5, 22, 0, tzinfo=timezone.utc),
            )

        async def get_profile(self, _creds):
            return BrokerProfile(
                broker_id="upstox",
                user_id="broker-user-1",
                display_name="Broker User",
                email="broker@example.test",
            )

    monkeypatch.setattr(broker_router, "get_admin_client", lambda: client)
    monkeypatch.setattr(broker_router, "_require_broker_plan", lambda _user_id: ("pro", None))
    monkeypatch.setattr(broker_router, "get_adapter", lambda _broker: _Adapter())
    monkeypatch.setattr(
        broker_router,
        "upsert_broker_credential",
        lambda user_id, broker, key_name, value: saved.__setitem__((broker, key_name), value),
    )
    state = broker_router.create_broker_oauth_state("user-1", "upstox")

    result = asyncio.run(
        broker_router.broker_oauth_callback(
            "upstox",
            broker_router.BrokerCallbackRequest(code_or_token="oauth-code", state=state),
            user_id="user-1",
        )
    )

    assert result["status"] == "connected"
    assert result["broker"] == "upstox"
    assert saved[("upstox", "access_token")] == "access-token"
    assert saved[("upstox", "refresh_token")] == "refresh-token"
