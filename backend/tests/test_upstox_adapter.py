from __future__ import annotations

import asyncio
import os
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest

os.environ.setdefault("UPSTOX_API_KEY", "upstox-key")
os.environ.setdefault("UPSTOX_API_SECRET", "upstox-secret")
os.environ.setdefault("UPSTOX_REDIRECT_URI", "http://localhost:8000/api/brokers/upstox/connect/callback")

from app.brokers.adapter import BrokerCredentials, BrokerError
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


def test_order_methods_remain_unimplemented_until_idempotency_migration():
    with pytest.raises(NotImplementedError):
        _run(UpstoxAdapter().place_order(_creds(), MagicMock()))
    unsubscribe = UpstoxAdapter().subscribe_fills(_creds(), lambda fill: None)
    assert callable(unsubscribe)
