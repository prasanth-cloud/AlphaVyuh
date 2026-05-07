"""
KiteAdapter — Zerodha Kite Connect v3 implementation of BrokerAdapter.

Token lifetime: access token expires at 06:00 IST daily. No refresh flow —
refresh() raises BrokerError(kind='AUTH_EXPIRED'); caller must redirect to
get_auth_url(). See docs/broker-adapter.md §Kite quirks.

Order methods (place_order, modify_order, cancel_order, get_order, list_orders,
subscribe_fills) raise NotImplementedError — they are implemented in Worktree C
alongside the UI and e2e tests.
"""
from __future__ import annotations

import secrets
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
    ModifyResult,
    Order,
    OrderPatch,
    OrderRequest,
    OrderResult,
    Position,
    Unsubscribe,
)
from app.brokers.kite import api as kite_api
from app.brokers.kite.api import KiteApiError
from app.brokers.kite.types import KiteHolding, KiteProfile

# ─── Kite status → canonical OrderStatus ─────────────────────────────────────

_KITE_STATUS_MAP: dict[str, str] = {
    "OPEN": "OPEN",
    "COMPLETE": "COMPLETE",
    "CANCELLED": "CANCELLED",
    "REJECTED": "REJECTED",
    "TRIGGER PENDING": "PENDING",
    "OPEN PENDING": "PENDING",
    "AMO REQ RECEIVED": "PENDING",
    "MODIFY PENDING": "OPEN",
    "MODIFY AFTER MARKET ORDER REQ RECEIVED": "PENDING",
    "CANCEL PENDING": "OPEN",
    "VALIDATION PENDING": "PENDING",
    "PUT ORDER REQ RECEIVED": "PENDING",
}


def _map_kite_status(raw: str) -> str:
    return _KITE_STATUS_MAP.get(raw.upper(), "UNKNOWN")


class KiteAdapter(BrokerAdapter):

    @property
    def id(self) -> BrokerId:
        return "zerodha"

    @property
    def supports_streaming_fills(self) -> bool:
        # Kite WebSocket Ticker supports live order updates; implemented later.
        return False

    # ─── Auth ─────────────────────────────────────────────────────────────────

    def get_auth_url(self, state: str) -> str:
        return kite_api.get_auth_url(state)

    async def exchange_code(self, code: str) -> BrokerCredentials:
        try:
            data = kite_api.exchange_code(code)
        except KiteApiError as exc:
            raise _wrap(exc, broker_id="zerodha") from exc

        # Kite tokens expire at 06:00 IST the following day. We store the raw
        # login_time here; expiry is enforced on the refresh() path.
        expires_at = datetime.now(timezone.utc).replace(
            hour=0, minute=30, second=0, microsecond=0
        )
        # Advance by one day if we're already past 00:30 UTC (06:00 IST)
        from datetime import timedelta

        if datetime.now(timezone.utc) > expires_at:
            expires_at = expires_at + timedelta(days=1)

        return BrokerCredentials(
            broker_id="zerodha",
            access_token=data["access_token"],
            expires_at=expires_at,
        )

    async def refresh(self, creds: BrokerCredentials) -> BrokerCredentials:
        # Kite has no token refresh — daily re-login required.
        raise BrokerError(
            kind="AUTH_EXPIRED",
            broker_id="zerodha",
            message="Kite access tokens expire daily at 06:00 IST and cannot be refreshed. Redirect user to get_auth_url().",
            retryable=False,
        )

    # ─── Account ──────────────────────────────────────────────────────────────

    async def get_profile(self, creds: BrokerCredentials) -> BrokerProfile:
        try:
            raw = kite_api.get_profile(creds.access_token)
        except KiteApiError as exc:
            raise _wrap(exc, broker_id="zerodha") from exc
        profile = KiteProfile(**raw)
        return BrokerProfile(
            broker_id="zerodha",
            user_id=profile.user_id,
            display_name=profile.user_name,
            email=profile.email,
        )

    async def get_positions(self, creds: BrokerCredentials) -> list[Position]:
        try:
            raw = kite_api.get_positions(creds.access_token)
        except KiteApiError as exc:
            raise _wrap(exc, broker_id="zerodha") from exc
        positions: list[Position] = []
        for item in raw.get("net", []):
            positions.append(
                Position(
                    symbol=item["tradingsymbol"],
                    exchange=item["exchange"],
                    quantity=item["quantity"],
                    average_price=float(item.get("average_price", 0)),
                    pnl=float(item.get("pnl", 0)),
                    day_pnl=float(item.get("day_m2m", 0)),
                )
            )
        return positions

    async def get_holdings(self, creds: BrokerCredentials) -> list[Holding]:
        try:
            raw = kite_api.get_holdings(creds.access_token)
        except KiteApiError as exc:
            raise _wrap(exc, broker_id="zerodha") from exc
        holdings: list[Holding] = []
        for item in raw:
            h = KiteHolding(**item)
            holdings.append(
                Holding(
                    symbol=h.tradingsymbol,
                    exchange=h.exchange,
                    quantity=h.quantity,
                    average_price=h.average_price,
                    current_value=h.last_price * h.quantity,
                    pnl=h.pnl,
                )
            )
        return holdings

    # ─── Orders (Phase C) ─────────────────────────────────────────────────────

    async def place_order(
        self, user_id: str, creds: BrokerCredentials, order: OrderRequest
    ) -> OrderResult:
        raise NotImplementedError("place_order is implemented in feat/broker-connect-ui")

    async def modify_order(
        self,
        creds: BrokerCredentials,
        broker_order_id: BrokerOrderId,
        patch: OrderPatch,
    ) -> ModifyResult:
        raise NotImplementedError("modify_order is implemented in feat/broker-connect-ui")

    async def cancel_order(
        self,
        creds: BrokerCredentials,
        broker_order_id: BrokerOrderId,
    ) -> ModifyResult:
        raise NotImplementedError("cancel_order is implemented in feat/broker-connect-ui")

    async def get_order(
        self,
        creds: BrokerCredentials,
        broker_order_id: BrokerOrderId,
    ) -> Order:
        raise NotImplementedError("get_order is implemented in feat/broker-connect-ui")

    async def list_orders(self, creds: BrokerCredentials) -> list[Order]:
        raise NotImplementedError("list_orders is implemented in feat/broker-connect-ui")

    def subscribe_fills(
        self, creds: BrokerCredentials, on_fill: FillCallback
    ) -> Unsubscribe:
        return lambda: None


# ─── Error mapping ────────────────────────────────────────────────────────────

_KITE_AUTH_ERRORS = {
    "TokenException",
    "SessionException",
    "PermissionException",
}

_KITE_RATE_ERRORS = {"RateLimitException"}


def _wrap(exc: KiteApiError, broker_id: BrokerId) -> BrokerError:
    if exc.error_type in _KITE_AUTH_ERRORS:
        return BrokerError(
            kind="AUTH_EXPIRED",
            broker_id=broker_id,
            message=exc.message,
            retryable=False,
            cause=exc,
            broker_code=exc.error_type,
        )
    if exc.error_type in _KITE_RATE_ERRORS:
        return BrokerError(
            kind="RATE_LIMITED",
            broker_id=broker_id,
            message=exc.message,
            retryable=True,
            retry_after_ms=1000,
            cause=exc,
            broker_code=exc.error_type,
        )
    if exc.status in {500, 502, 503, 504}:
        return BrokerError(
            kind="NETWORK",
            broker_id=broker_id,
            message=exc.message,
            retryable=True,
            possibly_executed=False,
            cause=exc,
            broker_code=exc.error_type,
        )
    return BrokerError(
        kind="UNKNOWN",
        broker_id=broker_id,
        message=exc.message,
        retryable=False,
        cause=exc,
        broker_code=exc.error_type,
    )
