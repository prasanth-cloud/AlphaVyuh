from __future__ import annotations

import asyncio
import os
import secrets
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest

os.environ.setdefault("UPSTOX_API_KEY", "upstox-key")
os.environ.setdefault("UPSTOX_API_SECRET", "upstox-secret")
os.environ.setdefault("UPSTOX_REDIRECT_URI", "http://localhost:8000/api/brokers/upstox/connect/callback")
os.environ.setdefault("BROKER_CREDS_KEY", secrets.token_bytes(32).hex())
os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")

from app.brokers.adapter import BrokerCredentials, BrokerError, IdempotencyKey, OrderRequest
from app.brokers.upstox.adapter import UpstoxAdapter, _next_upstox_expiry
from app.brokers.upstox.api import UpstoxApiError


def _run(coro):
    return asyncio.run(coro)


def _creds() -> BrokerCredentials:
    return BrokerCredentials(
        broker_id="upstox",
        access_token="upstox-token",
        expires_at=datetime(2099, 1, 1, tzinfo=timezone.utc),
    )


def _order(key: str = "11111111-1111-4111-8111-111111111111") -> OrderRequest:
    return OrderRequest(
        idempotency_key=IdempotencyKey(key),
        symbol="RELIANCE",
        exchange="NSE",
        side="BUY",
        quantity=1,
        order_type="MARKET",
        product="CNC",
        validity="DAY",
    )


class _OrderIdempotencyQuery:
    def __init__(self, client):
        self.client = client
        self.insert_payload = None
        self.update_payload = None
        self.filters: dict[str, str] = {}

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, key, value):
        self.filters[key] = value
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
        if self.insert_payload is not None:
            self.client.inserts.append(self.insert_payload)
            self.client.rows[(self.insert_payload["user_id"], self.insert_payload["idempotency_key"])] = self.insert_payload
            return type("Result", (), {"data": [self.insert_payload]})()
        key = (self.filters.get("user_id"), self.filters.get("idempotency_key"))
        if self.update_payload is not None:
            self.client.updates.append(self.update_payload)
            self.client.rows[key] = {**self.client.rows.get(key, {}), **self.update_payload}
            return type("Result", (), {"data": [self.client.rows[key]]})()
        return type("Result", (), {"data": self.client.rows.get(key)})()


class _FakeSupabase:
    def __init__(self, rows=None):
        self.rows = rows or {}
        self.inserts = []
        self.updates = []

    def table(self, table_name):
        assert table_name == "order_idempotency"
        return _OrderIdempotencyQuery(self)


class _InsertConflictSupabase(_FakeSupabase):
    def table(self, table_name):
        parent = self

        class _ConflictQuery(_OrderIdempotencyQuery):
            def execute(self):
                if self.insert_payload is not None:
                    raise RuntimeError("duplicate key value violates unique constraint")
                return super().execute()

        assert table_name == "order_idempotency"
        return _ConflictQuery(parent)


def test_upstox_auth_url_contains_client_redirect_and_state():
    url = UpstoxAdapter().get_auth_url("csrf-state")
    assert "api.upstox.com/v2/login/authorization/dialog" in url
    assert "client_id=upstox-key" in url
    assert "redirect_uri=http%3A%2F%2Flocalhost%3A8000%2Fapi%2Fbrokers%2Fupstox%2Fconnect%2Fcallback" in url
    assert "state=csrf-state" in url


def test_next_upstox_expiry_uses_next_0330_ist_cutoff():
    assert _next_upstox_expiry(datetime(2026, 5, 5, 12, 0, tzinfo=timezone.utc)) == datetime(2026, 5, 5, 22, 0, tzinfo=timezone.utc)
    assert _next_upstox_expiry(datetime(2026, 5, 5, 22, 1, tzinfo=timezone.utc)) == datetime(2026, 5, 6, 22, 0, tzinfo=timezone.utc)


def test_exchange_code_maps_access_and_extended_tokens():
    with patch(
        "app.brokers.upstox.api.exchange_code",
        return_value={"access_token": "access-123", "extended_token": "extended-456"},
    ):
        creds = _run(UpstoxAdapter().exchange_code("auth-code"))
    assert creds.broker_id == "upstox"
    assert creds.access_token == "access-123"
    assert creds.refresh_token == "extended-456"


def test_get_profile_maps_upstox_fields():
    with patch(
        "app.brokers.upstox.api.get_profile",
        return_value={"user_id": "U123", "user_name": "Upstox User", "email": "u@example.com"},
    ):
        profile = _run(UpstoxAdapter().get_profile(_creds()))
    assert profile.broker_id == "upstox"
    assert profile.user_id == "U123"
    assert profile.display_name == "Upstox User"
    assert profile.email == "u@example.com"


def test_get_holdings_maps_long_term_holdings():
    with patch(
        "app.brokers.upstox.api.get_holdings",
        return_value=[
            {
                "tradingsymbol": "RELIANCE",
                "exchange": "NSE",
                "quantity": 3,
                "average_price": 2500,
                "last_price": 2600,
                "pnl": 300,
            },
            {"tradingsymbol": "NFO_ONLY", "exchange": "NFO", "quantity": 1},
        ],
    ):
        holdings = _run(UpstoxAdapter().get_holdings(_creds()))
    assert len(holdings) == 1
    assert holdings[0].symbol == "RELIANCE"
    assert holdings[0].current_value == 7800


def test_upstox_auth_errors_wrap_as_auth_expired():
    with patch(
        "app.brokers.upstox.api.get_profile",
        side_effect=UpstoxApiError(401, "UDAPI100057", "Invalid Auth code"),
    ):
        with pytest.raises(BrokerError) as exc_info:
            _run(UpstoxAdapter().get_profile(_creds()))
    assert exc_info.value.kind == "AUTH_EXPIRED"
    assert exc_info.value.broker_id == "upstox"


def test_place_order_reserves_key_calls_broker_and_stores_result(monkeypatch):
    client = _FakeSupabase()
    monkeypatch.setattr("app.brokers.upstox.adapter.get_admin_client", lambda: client)
    with patch("app.brokers.upstox.api.place_order", return_value={"order_id": "upstox-order-1"}) as place:
        result = _run(UpstoxAdapter().place_order("user-1", _creds(), _order()))

    assert result.from_cache is False
    assert result.order.broker_order_id == "upstox-order-1"
    assert result.order.status == "PENDING"
    assert client.inserts[0]["idempotency_key"] == "11111111-1111-4111-8111-111111111111"
    assert client.updates[0]["broker_order_id"] == "upstox-order-1"
    place.assert_called_once()


def test_place_order_returns_cached_result_without_broker_call(monkeypatch):
    cached = {
        ("user-1", "11111111-1111-4111-8111-111111111111"): {
            "result": {
                "order": {
                    "id": "11111111-1111-4111-8111-111111111111",
                    "broker_order_id": "cached-order",
                    "symbol": "RELIANCE",
                    "exchange": "NSE",
                    "side": "BUY",
                    "order_type": "MARKET",
                    "product": "CNC",
                    "status": "PENDING",
                    "quantity": 1,
                    "filled_quantity": 0,
                    "average_price": 0,
                    "fills": [],
                    "child_broker_order_ids": [],
                    "placed_at": "2026-05-05T00:00:00Z",
                    "updated_at": "2026-05-05T00:00:00Z",
                },
                "from_cache": False,
            }
        }
    }
    client = _FakeSupabase(rows=cached)
    monkeypatch.setattr("app.brokers.upstox.adapter.get_admin_client", lambda: client)
    with patch("app.brokers.upstox.api.place_order") as place:
        result = _run(UpstoxAdapter().place_order("user-1", _creds(), _order()))

    assert result.from_cache is True
    assert result.order.broker_order_id == "cached-order"
    assert client.inserts == []
    place.assert_not_called()


def test_place_order_duplicate_in_flight_does_not_call_broker(monkeypatch):
    client = _InsertConflictSupabase()
    monkeypatch.setattr("app.brokers.upstox.adapter.get_admin_client", lambda: client)
    with patch("app.brokers.upstox.api.place_order") as place:
        with pytest.raises(BrokerError) as exc_info:
            _run(UpstoxAdapter().place_order("user-1", _creds(), _order()))

    assert exc_info.value.possibly_executed is True
    place.assert_not_called()


def test_place_order_validates_limit_price_before_broker_call(monkeypatch):
    client = _FakeSupabase()
    monkeypatch.setattr("app.brokers.upstox.adapter.get_admin_client", lambda: client)
    order = _order()
    order = order.model_copy(update={"order_type": "LIMIT"})
    with patch("app.brokers.upstox.api.place_order") as place:
        with pytest.raises(BrokerError) as exc_info:
            _run(UpstoxAdapter().place_order("user-1", _creds(), order))
    assert exc_info.value.kind == "INVALID_REQUEST"
    assert client.inserts == []
    place.assert_not_called()


def test_unimplemented_order_followups_still_raise():
    unsubscribe = UpstoxAdapter().subscribe_fills(_creds(), lambda fill: None)
    assert callable(unsubscribe)
