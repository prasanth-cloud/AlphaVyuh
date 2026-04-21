"""
MockAdapter — deterministic in-memory broker for Playwright tests and local dev.

Never makes network calls. State is per-instance (not shared across requests).
Use this as the adapter when MOCK_BROKER=1 is set in the environment.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from app.brokers.adapter import (
    BrokerAdapter,
    BrokerCredentials,
    BrokerError,
    BrokerId,
    BrokerOrderId,
    BrokerProfile,
    Fill,
    FillCallback,
    Holding,
    IdempotencyKey,
    ModifyResult,
    Order,
    OrderPatch,
    OrderRequest,
    OrderResult,
    Position,
    Unsubscribe,
)

_MOCK_TOKEN = "mock_access_token_abc123"
_MOCK_CALLBACK_URL = "http://localhost:8000/api/brokers/mock/connect/callback"


class MockAdapter(BrokerAdapter):
    """
    Returns predictable fixture data for every method.
    Playwright specs import this and swap in place of KiteAdapter.
    """

    def __init__(self) -> None:
        self._orders: dict[str, Order] = {}

    @property
    def id(self) -> BrokerId:
        return "zerodha"

    @property
    def supports_streaming_fills(self) -> bool:
        return False

    # ─── Auth ─────────────────────────────────────────────────────────────────

    def get_auth_url(self, state: str) -> str:
        return f"{_MOCK_CALLBACK_URL}?request_token=mock_request_token&state={state}"

    async def exchange_code(self, code: str) -> BrokerCredentials:
        return BrokerCredentials(
            broker_id="zerodha",
            access_token=_MOCK_TOKEN,
            expires_at=datetime(2099, 1, 1, tzinfo=timezone.utc),
        )

    async def refresh(self, creds: BrokerCredentials) -> BrokerCredentials:
        raise BrokerError(
            kind="AUTH_EXPIRED",
            broker_id="zerodha",
            message="Mock: no refresh, re-login required",
            retryable=False,
        )

    # ─── Account ──────────────────────────────────────────────────────────────

    async def get_profile(self, creds: BrokerCredentials) -> BrokerProfile:
        return BrokerProfile(
            broker_id="zerodha",
            user_id="MOCK_USER",
            display_name="Mock Trader",
            email="mock@alphavyuh.com",
        )

    async def get_positions(self, creds: BrokerCredentials) -> list[Position]:
        return [
            Position(
                symbol="RELIANCE",
                exchange="NSE",
                quantity=10,
                average_price=2500.0,
                pnl=1000.0,
                day_pnl=250.0,
            )
        ]

    async def get_holdings(self, creds: BrokerCredentials) -> list[Holding]:
        return [
            Holding(
                symbol="INFY",
                exchange="NSE",
                quantity=5,
                average_price=1500.0,
                current_value=8000.0,
                pnl=500.0,
            ),
            Holding(
                symbol="TCS",
                exchange="NSE",
                quantity=2,
                average_price=3500.0,
                current_value=7200.0,
                pnl=200.0,
            ),
        ]

    # ─── Orders ───────────────────────────────────────────────────────────────

    async def place_order(
        self, creds: BrokerCredentials, order: OrderRequest
    ) -> OrderResult:
        from datetime import timedelta

        broker_order_id = BrokerOrderId(f"MOCK_ORD_{order.idempotency_key[:8].upper()}")
        now = datetime.now(timezone.utc)
        o = Order(
            id=order.idempotency_key,
            broker_order_id=broker_order_id,
            symbol=order.symbol,
            exchange=order.exchange,
            side=order.side,
            order_type=order.order_type,
            product=order.product,
            status="COMPLETE",
            quantity=order.quantity,
            filled_quantity=order.quantity,
            average_price=order.limit_price or 100.0,
            fills=[],
            child_broker_order_ids=[],
            placed_at=now,
            updated_at=now,
        )
        self._orders[broker_order_id] = o
        return OrderResult(order=o, from_cache=False)

    async def modify_order(
        self,
        creds: BrokerCredentials,
        broker_order_id: BrokerOrderId,
        patch: OrderPatch,
    ) -> ModifyResult:
        order = self._orders.get(broker_order_id)
        if not order:
            raise BrokerError(
                kind="INVALID_REQUEST",
                broker_id="zerodha",
                message=f"Mock: order {broker_order_id} not found",
                retryable=False,
            )
        updated = order.model_copy(update={"updated_at": datetime.now(timezone.utc)})
        self._orders[broker_order_id] = updated
        return ModifyResult(order=updated)

    async def cancel_order(
        self,
        creds: BrokerCredentials,
        broker_order_id: BrokerOrderId,
    ) -> ModifyResult:
        now = datetime.now(timezone.utc)
        order = self._orders.get(broker_order_id)
        if not order:
            raise BrokerError(
                kind="INVALID_REQUEST",
                broker_id="zerodha",
                message=f"Mock: order {broker_order_id} not found",
                retryable=False,
            )
        cancelled = order.model_copy(update={"status": "CANCELLED", "updated_at": now})
        self._orders[broker_order_id] = cancelled
        return ModifyResult(order=cancelled)

    async def get_order(
        self,
        creds: BrokerCredentials,
        broker_order_id: BrokerOrderId,
    ) -> Order:
        order = self._orders.get(broker_order_id)
        if not order:
            raise BrokerError(
                kind="INVALID_REQUEST",
                broker_id="zerodha",
                message=f"Mock: order {broker_order_id} not found",
                retryable=False,
            )
        return order

    async def list_orders(self, creds: BrokerCredentials) -> list[Order]:
        return list(self._orders.values())

    def subscribe_fills(
        self, creds: BrokerCredentials, on_fill: FillCallback
    ) -> Unsubscribe:
        return lambda: None
