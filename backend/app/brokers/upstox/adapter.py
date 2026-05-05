"""Upstox API v2 implementation of the broker adapter contract."""
from __future__ import annotations

from datetime import datetime, time, timedelta, timezone

from app.brokers.adapter import (
    BrokerAdapter,
    BrokerCredentials,
    BrokerError,
    BrokerOrderId,
    BrokerProfile,
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
from app.brokers.upstox import api as upstox_api
from app.brokers.upstox.api import UpstoxApiError


class UpstoxAdapter(BrokerAdapter):
    @property
    def id(self):
        return "upstox"

    @property
    def supports_streaming_fills(self) -> bool:
        return False

    def get_auth_url(self, state: str) -> str:
        return upstox_api.get_auth_url(state)

    async def exchange_code(self, code: str) -> BrokerCredentials:
        try:
            data = upstox_api.exchange_code(code)
        except UpstoxApiError as exc:
            raise _wrap(exc) from exc

        access_token = str(data.get("access_token") or "")
        if not access_token:
            raise BrokerError(
                kind="BROKER_REJECTED",
                broker_id="upstox",
                message="Upstox token response did not include an access token.",
                retryable=False,
            )

        return BrokerCredentials(
            broker_id="upstox",
            access_token=access_token,
            refresh_token=data.get("extended_token"),
            expires_at=_next_upstox_expiry(),
        )

    async def refresh(self, creds: BrokerCredentials) -> BrokerCredentials:
        raise BrokerError(
            kind="AUTH_EXPIRED",
            broker_id="upstox",
            message="Upstox access tokens expire around 03:30 IST the next day. Reconnect through OAuth.",
            retryable=False,
        )

    async def get_profile(self, creds: BrokerCredentials) -> BrokerProfile:
        try:
            raw = upstox_api.get_profile(creds.access_token)
        except UpstoxApiError as exc:
            raise _wrap(exc) from exc
        return BrokerProfile(
            broker_id="upstox",
            user_id=str(raw.get("user_id") or ""),
            display_name=str(raw.get("user_name") or raw.get("name") or "Upstox user"),
            email=str(raw.get("email") or ""),
        )

    async def get_positions(self, creds: BrokerCredentials) -> list[Position]:
        return []

    async def get_holdings(self, creds: BrokerCredentials) -> list[Holding]:
        try:
            raw = upstox_api.get_holdings(creds.access_token)
        except UpstoxApiError as exc:
            raise _wrap(exc) from exc

        holdings: list[Holding] = []
        for item in raw:
            exchange = str(item.get("exchange") or "NSE").upper()
            if exchange not in {"NSE", "BSE"}:
                continue
            quantity = int(float(item.get("quantity") or 0))
            last_price = float(item.get("last_price") or item.get("close_price") or 0)
            holdings.append(
                Holding(
                    symbol=str(item.get("tradingsymbol") or item.get("trading_symbol") or "").upper(),
                    exchange=exchange,  # type: ignore[arg-type]
                    quantity=quantity,
                    average_price=float(item.get("average_price") or 0),
                    current_value=last_price * quantity,
                    pnl=float(item.get("pnl") or 0),
                )
            )
        return [h for h in holdings if h.symbol]

    async def place_order(self, creds: BrokerCredentials, order: OrderRequest) -> OrderResult:
        raise NotImplementedError("Upstox order placement remains on the legacy broker order route until adapter idempotency is migrated.")

    async def modify_order(self, creds: BrokerCredentials, broker_order_id: BrokerOrderId, patch: OrderPatch) -> ModifyResult:
        raise NotImplementedError("Upstox order modification is not implemented in the adapter yet.")

    async def cancel_order(self, creds: BrokerCredentials, broker_order_id: BrokerOrderId) -> ModifyResult:
        raise NotImplementedError("Upstox order cancellation is not implemented in the adapter yet.")

    async def get_order(self, creds: BrokerCredentials, broker_order_id: BrokerOrderId) -> Order:
        raise NotImplementedError("Upstox order lookup is not implemented in the adapter yet.")

    async def list_orders(self, creds: BrokerCredentials) -> list[Order]:
        raise NotImplementedError("Upstox order listing is not implemented in the adapter yet.")

    def subscribe_fills(self, creds: BrokerCredentials, on_fill: FillCallback) -> Unsubscribe:
        return lambda: None


def _next_upstox_expiry(now: datetime | None = None) -> datetime:
    """Upstox documents normal access-token expiry as 03:30 IST the next day."""
    now = now or datetime.now(timezone.utc)
    cutoff = datetime.combine(now.date(), time(hour=22, minute=0), tzinfo=timezone.utc)
    if now >= cutoff:
        cutoff += timedelta(days=1)
    return cutoff


def _wrap(exc: UpstoxApiError) -> BrokerError:
    if exc.status in {401, 403} or exc.code in {"UDAPI100057", "UDAPI100069", "UDAPI100070"}:
        return BrokerError(
            kind="AUTH_EXPIRED",
            broker_id="upstox",
            message=exc.message,
            retryable=False,
            cause=exc,
            broker_code=exc.code,
        )
    if exc.status == 429:
        return BrokerError(
            kind="RATE_LIMITED",
            broker_id="upstox",
            message=exc.message,
            retryable=True,
            retry_after_ms=1000,
            cause=exc,
            broker_code=exc.code,
        )
    if exc.status in {500, 502, 503, 504}:
        return BrokerError(
            kind="NETWORK",
            broker_id="upstox",
            message=exc.message,
            retryable=True,
            possibly_executed=False,
            cause=exc,
            broker_code=exc.code,
        )
    return BrokerError(
        kind="UNKNOWN",
        broker_id="upstox",
        message=exc.message,
        retryable=False,
        cause=exc,
        broker_code=exc.code,
    )
