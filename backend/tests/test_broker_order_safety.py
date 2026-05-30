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
        self.upsert_payload = None
        self.ilike_value = None
        self.filters = {}

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
        if self.table_name == "users":
            return type("Result", (), {"data": {"plan": "pro", "plan_expires_at": None}})()
        if self.table_name == "stock_universe":
            return type("Result", (), {"data": {"symbol": "RELIANCE", "company_name": "Reliance Industries", "isin": "INE002A01018"}})()
        if self.table_name == "trade_journal" and self.insert_payload is not None:
            self.client.journal_inserts.append(self.insert_payload)
            return type("Result", (), {"data": [{"id": "journal-1", **self.insert_payload}]})()
        if self.table_name == "trade_journal" and self.ilike_value:
            matches = [
                {"id": f"journal-{idx + 1}", "created_at": "2026-05-05T12:00:00+00:00"}
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
        asyncio.run(broker_router.place_order(_order(live_confirmed=True), user_id="user-1"))

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
        asyncio.run(broker_router.place_order(_order(live_confirmed=True), user_id="user-1"))

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
        asyncio.run(broker_router.place_order(_order(live_confirmed=True), user_id="user-1"))

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
        asyncio.run(broker_router.place_order(_order(live_confirmed=True), user_id="user-1"))

    assert exc.value.status_code == 409
    assert "Live zerodha order placement is blocked" in str(exc.value.detail)
    assert client.journal_inserts == []


def test_confirmed_live_order_failure_does_not_create_simulated_journal(monkeypatch):
    client = _FakeSupabase()
    client.broker_connection_metadata["zerodha"] = {
        "read_only_smoke": {"broker": "zerodha", "passed": True}
    }
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
        asyncio.run(broker_router.place_order(_order(live_confirmed=True), user_id="user-1"))

    assert exc.value.status_code == 502
    assert "No simulated order was created" in str(exc.value.detail)
    assert client.journal_inserts == []


def test_confirmed_upstox_order_routes_live_and_creates_journal(monkeypatch):
    client = _FakeSupabase()
    client.broker_connection_metadata["upstox"] = {
        "read_only_smoke": {"broker": "upstox", "passed": True}
    }
    captured = {}

    class _FakeUpstoxAdapter:
        async def place_order(self, user_id, creds, order):
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

    result = asyncio.run(broker_router.place_order(_order(live_confirmed=True), user_id="user-1"))

    assert result["broker"] == "upstox"
    assert result["broker_order_id"] == "upstox-order-1"
    assert result["journal_status"] == "open"
    assert captured["user_id"] == "user-1"
    assert captured["creds"].broker_id == "upstox"
    assert captured["order"].idempotency_key
    assert captured["order"].extensions.upstox.instrument_token == "NSE_EQ|INE002A01018"
    assert client.journal_inserts


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
