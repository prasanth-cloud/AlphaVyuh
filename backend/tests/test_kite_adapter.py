"""
Unit tests for KiteAdapter.

Tests mock httpx at the transport layer — no real network calls.
Strategy: patch app.brokers.kite.api._request to return fixture data.
"""
from __future__ import annotations

import os
import asyncio
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest

os.environ.setdefault("KITE_API_KEY", "test_api_key")
os.environ.setdefault("KITE_API_SECRET", "test_api_secret")

from app.brokers.adapter import BrokerCredentials, BrokerError
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


class TestOrderMethodsNotImplemented:
    """Order methods are stubbed until feat/broker-connect-ui."""

    def test_place_order_not_implemented(self):
        with pytest.raises(NotImplementedError):
            _run(KiteAdapter().place_order(_creds(), MagicMock()))

    def test_modify_order_not_implemented(self):
        with pytest.raises(NotImplementedError):
            _run(KiteAdapter().modify_order(_creds(), "ord_123", MagicMock()))

    def test_cancel_order_not_implemented(self):
        with pytest.raises(NotImplementedError):
            _run(KiteAdapter().cancel_order(_creds(), "ord_123"))

    def test_get_order_not_implemented(self):
        with pytest.raises(NotImplementedError):
            _run(KiteAdapter().get_order(_creds(), "ord_123"))

    def test_list_orders_not_implemented(self):
        with pytest.raises(NotImplementedError):
            _run(KiteAdapter().list_orders(_creds()))

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
