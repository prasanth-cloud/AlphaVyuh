"""
Unit tests for KiteAdapter.

Tests mock httpx at the transport layer — no real network calls.
Strategy: patch app.brokers.kite.api._request to return fixture data.
"""
from __future__ import annotations

import os
import asyncio
from datetime import datetime, timezone
from unittest.mock import patch

import pytest

os.environ.setdefault("KITE_API_KEY", "test_api_key")
os.environ.setdefault("KITE_API_SECRET", "test_api_secret")

from app.brokers.adapter import BrokerCredentials, BrokerError, IdempotencyKey, OrderRequest
from app.brokers.kite.adapter import KiteAdapter, _map_kite_status
from app.brokers.kite.api import KiteApiError


def _run(coro):
    return asyncio.run(coro)


def _creds() -> BrokerCredentials:
    return BrokerCredentials(
        broker_id="zerodha",
        access_token="test_token",
        expires_at=datetime(2099, 1, 1, tzinfo=timezone.utc),
    )


class TestAdapterIdentity:
    def test_id(self):
        assert KiteAdapter().id == "zerodha"

    def test_no_streaming_fills(self):
        assert KiteAdapter().supports_streaming_fills is False


class TestStatusMapping:
    def test_open(self):
        assert _map_kite_status("OPEN") == "OPEN"

    def test_complete(self):
        assert _map_kite_status("COMPLETE") == "COMPLETE"

    def test_cancelled(self):
        assert _map_kite_status("CANCELLED") == "CANCELLED"

    def test_rejected(self):
        assert _map_kite_status("REJECTED") == "REJECTED"

    def test_trigger_pending(self):
        assert _map_kite_status("TRIGGER PENDING") == "PENDING"

    def test_open_pending(self):
        assert _map_kite_status("OPEN PENDING") == "PENDING"

    def test_amo_req_received(self):
        assert _map_kite_status("AMO REQ RECEIVED") == "PENDING"

    def test_case_insensitive(self):
        assert _map_kite_status("open") == "OPEN"
        assert _map_kite_status("Complete") == "COMPLETE"


class TestGetAuthUrl:
    def test_contains_api_key(self):
        url = KiteAdapter().get_auth_url("csrf_state_abc")
        assert "test_api_key" in url

    def test_contains_state(self):
        url = KiteAdapter().get_auth_url("csrf_state_abc")
        assert "csrf_state_abc" in url

    def test_points_to_kite_login(self):
        url = KiteAdapter().get_auth_url("x")
        assert "kite.zerodha.com" in url


class TestRefreshRaisesAuthExpired:
    def test_refresh_always_raises(self):
        with pytest.raises(BrokerError) as exc_info:
            _run(KiteAdapter().refresh(_creds()))
        err = exc_info.value
        assert err.kind == "AUTH_EXPIRED"
        assert err.broker_id == "zerodha"
        assert err.retryable is False


class TestGetProfile:
    _raw_profile = {
        "user_id": "AB1234",
        "user_name": "Test User",
        "email": "test@example.com",
        "user_type": "individual",
        "broker": "ZERODHA",
    }

    def test_maps_profile_fields(self):
        with patch("app.brokers.kite.api._request", return_value={"data": self._raw_profile}):
            profile = _run(KiteAdapter().get_profile(_creds()))
        assert profile.broker_id == "zerodha"
        assert profile.user_id == "AB1234"
        assert profile.display_name == "Test User"
        assert profile.email == "test@example.com"

    def test_auth_error_raises_broker_error(self):
        with patch(
            "app.brokers.kite.api._request",
            side_effect=KiteApiError(403, "TokenException", "Invalid token"),
        ):
            with pytest.raises(BrokerError) as exc_info:
                _run(KiteAdapter().get_profile(_creds()))
        assert exc_info.value.kind == "AUTH_EXPIRED"

    def test_network_error_raises_broker_error(self):
        with patch(
            "app.brokers.kite.api._request",
            side_effect=KiteApiError(503, "NetworkException", "Service unavailable"),
        ):
            with pytest.raises(BrokerError) as exc_info:
                _run(KiteAdapter().get_profile(_creds()))
        assert exc_info.value.kind == "NETWORK"
        assert exc_info.value.retryable is True


class TestGetHoldings:
    _raw_holdings = [
        {
            "tradingsymbol": "RELIANCE",
            "exchange": "NSE",
            "quantity": 10,
            "average_price": 2500.0,
            "last_price": 2600.0,
            "pnl": 1000.0,
            "day_change": 50.0,
            "day_change_percentage": 1.96,
            "t1_quantity": 0,
            "collateral_quantity": 0,
        }
    ]

    def test_maps_holding_fields(self):
        with patch("app.brokers.kite.api._request", return_value={"data": self._raw_holdings}):
            holdings = _run(KiteAdapter().get_holdings(_creds()))
        assert len(holdings) == 1
        h = holdings[0]
        assert h.symbol == "RELIANCE"
        assert h.exchange == "NSE"
        assert h.quantity == 10
        assert h.average_price == 2500.0
        assert h.current_value == 26000.0  # last_price * quantity
        assert h.pnl == 1000.0

    def test_empty_holdings(self):
        with patch("app.brokers.kite.api._request", return_value={"data": []}):
            holdings = _run(KiteAdapter().get_holdings(_creds()))
        assert holdings == []


class TestGetPositions:
    _raw_positions = {
        "net": [
            {
                "tradingsymbol": "INFY",
                "exchange": "NSE",
                "quantity": 5,
                "average_price": 1500.0,
                "pnl": 250.0,
                "day_m2m": 100.0,
                "product": "CNC",
            }
        ],
        "day": [],
    }

    def test_maps_net_positions(self):
        with patch("app.brokers.kite.api._request", return_value={"data": self._raw_positions}):
            positions = _run(KiteAdapter().get_positions(_creds()))
        assert len(positions) == 1
        p = positions[0]
        assert p.symbol == "INFY"
        assert p.quantity == 5
        assert p.pnl == 250.0
        assert p.day_pnl == 100.0


class _FakeOrderQuery:
    def __init__(self, client):
        self.client = client
        self.insert_payload = None

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def maybe_single(self):
        return self

    def insert(self, payload):
        self.insert_payload = payload
        self.client.inserts.append(payload)
        return self

    def update(self, payload):
        self.client.updates.append(payload)
        return self

    def execute(self):
        return type("Result", (), {"data": None})()


class _FakeOrderDb:
    def __init__(self):
        self.inserts = []
        self.updates = []

    def table(self, _name):
        return _FakeOrderQuery(self)


def _order_request() -> OrderRequest:
    return OrderRequest(
        idempotency_key=IdempotencyKey("11111111-1111-4111-8111-111111111111"),
        symbol="RELIANCE",
        exchange="NSE",
        side="BUY",
        quantity=1,
        order_type="MARKET",
        product="CNC",
        validity="DAY",
    )


class TestOrderMethods:
    def test_place_order_reserves_key_calls_kite_and_stores_result(self, monkeypatch):
        db = _FakeOrderDb()
        monkeypatch.setattr("app.brokers.kite.adapter.get_admin_client", lambda: db)
        with patch("app.brokers.kite.api.place_order", return_value={"order_id": "kite-order-1"}) as place:
            result = _run(KiteAdapter().place_order("user-1", _creds(), _order_request()))

        assert result.order.broker_order_id == "kite-order-1"
        assert result.from_cache is False
        assert db.inserts[0]["broker_id"] == "zerodha"
        assert db.updates[0]["broker_order_id"] == "kite-order-1"
        assert place.call_args.kwargs["params"]["tradingsymbol"] == "RELIANCE"

    def test_list_orders_maps_kite_rows(self):
        row = {
            "order_id": "kite-order-1",
            "tradingsymbol": "RELIANCE",
            "exchange": "NSE",
            "transaction_type": "BUY",
            "order_type": "MARKET",
            "product": "CNC",
            "status": "COMPLETE",
            "quantity": 1,
            "filled_quantity": 1,
            "average_price": 2500,
            "order_timestamp": "2026-05-05 09:20:00",
        }
        with patch("app.brokers.kite.api.list_orders", return_value=[row]):
            orders = _run(KiteAdapter().list_orders(_creds()))
        assert orders[0].broker_order_id == "kite-order-1"
        assert orders[0].status == "COMPLETE"
        assert orders[0].average_price == 2500

    def test_subscribe_fills_returns_callable(self):
        unsubscribe = KiteAdapter().subscribe_fills(_creds(), lambda fill: None)
        assert callable(unsubscribe)
        unsubscribe()  # must not raise


class TestErrorWrapping:
    def test_rate_limit_error_retryable(self):
        with patch(
            "app.brokers.kite.api._request",
            side_effect=KiteApiError(429, "RateLimitException", "Too many requests"),
        ):
            with pytest.raises(BrokerError) as exc_info:
                _run(KiteAdapter().get_profile(_creds()))
        err = exc_info.value
        assert err.kind == "RATE_LIMITED"
        assert err.retryable is True
        assert err.retry_after_ms == 1000

    def test_unknown_error_not_retryable(self):
        with patch(
            "app.brokers.kite.api._request",
            side_effect=KiteApiError(400, "DataException", "Bad symbol"),
        ):
            with pytest.raises(BrokerError) as exc_info:
                _run(KiteAdapter().get_profile(_creds()))
        err = exc_info.value
        assert err.kind == "UNKNOWN"
        assert err.retryable is False
        assert err.broker_code == "DataException"
