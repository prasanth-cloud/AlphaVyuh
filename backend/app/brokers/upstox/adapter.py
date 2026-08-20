"""Upstox API v2 implementation of the broker adapter contract."""
from __future__ import annotations

from datetime import datetime, time, timedelta, timezone
from typing import Any

from app.brokers.adapter import (
    BrokerAdapter,
    BrokerCredentials,
    BrokerError,
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
from app.brokers.upstox import api as upstox_api
from app.brokers.upstox.api import UpstoxApiError
from app.services.supabase import get_admin_client


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
        try:
            raw = upstox_api.get_positions(creds.access_token)
        except UpstoxApiError as exc:
            raise _wrap(exc) from exc

        positions: list[Position] = []
        for item in raw:
            exchange = str(item.get("exchange") or "").upper()
            # The shared equity contract intentionally excludes derivatives and
            # commodity/currency contracts until their instrument model exists.
            if exchange not in {"NSE", "BSE"}:
                continue
            symbol = str(item.get("trading_symbol") or item.get("tradingsymbol") or "").upper()
            if not symbol:
                continue
            positions.append(
                Position(
                    symbol=symbol,
                    exchange=exchange,  # type: ignore[arg-type]
                    quantity=int(float(item.get("quantity") or 0)),
                    average_price=float(item.get("average_price") or item.get("buy_price") or 0),
                    pnl=float(item.get("pnl") or 0),
                    day_pnl=float(item.get("unrealised") or 0),
                )
            )
        return positions

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

    async def place_order(self, user_id: str, creds: BrokerCredentials, order: OrderRequest) -> OrderResult:
        cached = _cached_order_result(user_id, order.idempotency_key)
        if cached is not None:
            return cached

        payload = _to_upstox_order_payload(order)
        try:
            _reserve_order_key(user_id, order)
        except Exception as exc:
            cached = _cached_order_result(user_id, order.idempotency_key)
            if cached is not None:
                return cached
            raise BrokerError(
                kind="UNKNOWN",
                broker_id="upstox",
                message="Order idempotency key is already reserved and the broker result is not reconciled yet.",
                retryable=False,
                possibly_executed=True,
                cause=exc,
            ) from exc
        try:
            data = upstox_api.place_order(creds.access_token, payload)
        except UpstoxApiError as exc:
            raise _wrap(exc) from exc

        broker_order_id = str(data.get("order_id") or "")
        if not broker_order_id:
            raise BrokerError(
                kind="BROKER_REJECTED",
                broker_id="upstox",
                message="Upstox order response did not include an order id.",
                retryable=False,
            )

        now = datetime.now(timezone.utc)
        placed = Order(
            id=order.idempotency_key,
            broker_order_id=BrokerOrderId(broker_order_id),
            symbol=order.symbol.upper(),
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
            limit_price=order.limit_price,
            trigger_price=order.trigger_price,
            placed_at=now,
            updated_at=now,
        )
        result = OrderResult(order=placed, from_cache=False)
        _store_order_result(user_id, order.idempotency_key, broker_order_id, result)
        return result

    async def modify_order(self, creds: BrokerCredentials, broker_order_id: BrokerOrderId, patch: OrderPatch) -> ModifyResult:
        current = await self.get_order(creds, broker_order_id)
        payload = _to_upstox_modify_payload(broker_order_id, current, patch)
        try:
            upstox_api.modify_order(creds.access_token, payload)
        except UpstoxApiError as exc:
            raise _wrap(exc) from exc
        return ModifyResult(order=await self.get_order(creds, broker_order_id))

    async def cancel_order(self, creds: BrokerCredentials, broker_order_id: BrokerOrderId) -> ModifyResult:
        try:
            upstox_api.cancel_order(creds.access_token, str(broker_order_id))
        except UpstoxApiError as exc:
            raise _wrap(exc) from exc
        return ModifyResult(order=await self.get_order(creds, broker_order_id))

    async def get_order(self, creds: BrokerCredentials, broker_order_id: BrokerOrderId) -> Order:
        try:
            raw = upstox_api.get_order_details(creds.access_token, str(broker_order_id))
            trades = upstox_api.get_order_trades(creds.access_token, str(broker_order_id))
        except UpstoxApiError as exc:
            raise _wrap(exc) from exc
        return _to_order(raw, trades=trades)

    async def list_orders(self, creds: BrokerCredentials) -> list[Order]:
        try:
            rows = upstox_api.list_orders(creds.access_token)
        except UpstoxApiError as exc:
            raise _wrap(exc) from exc
        return [_to_order(row, trades=[]) for row in rows]

    def subscribe_fills(self, creds: BrokerCredentials, on_fill: FillCallback) -> Unsubscribe:
        return lambda: None


def _next_upstox_expiry(now: datetime | None = None) -> datetime:
    """Upstox documents normal access-token expiry as 03:30 IST the next day."""
    now = now or datetime.now(timezone.utc)
    cutoff = datetime.combine(now.date(), time(hour=22, minute=0), tzinfo=timezone.utc)
    if now >= cutoff:
        cutoff += timedelta(days=1)
    return cutoff


def _cached_order_result(user_id: str, idempotency_key: IdempotencyKey) -> OrderResult | None:
    row = (
        get_admin_client()
        .table("order_idempotency")
        .select("result")
        .eq("user_id", user_id)
        .eq("idempotency_key", str(idempotency_key))
        .maybe_single()
        .execute()
    ).data
    if not row or not row.get("result"):
        return None
    cached = OrderResult.model_validate(row["result"])
    return cached.model_copy(update={"from_cache": True})


def _reserve_order_key(user_id: str, order: OrderRequest) -> None:
    get_admin_client().table("order_idempotency").insert(
        {
            "user_id": user_id,
            "idempotency_key": str(order.idempotency_key),
            "broker_id": "upstox",
            "result": None,
        }
    ).execute()


def _store_order_result(
    user_id: str,
    idempotency_key: IdempotencyKey,
    broker_order_id: str,
    result: OrderResult,
) -> None:
    payload = result.model_dump(mode="json")
    get_admin_client().table("order_idempotency").update(
        {"broker_order_id": broker_order_id, "result": payload}
    ).eq("user_id", user_id).eq("idempotency_key", str(idempotency_key)).execute()


def _to_upstox_order_payload(order: OrderRequest) -> dict[str, Any]:
    product = {"CNC": "D", "MIS": "I", "NRML": "D"}[order.product]
    order_type = "SL-M" if order.order_type == "SL_MARKET" else order.order_type
    upstox_ext = order.extensions.upstox if order.extensions else None
    is_amo = bool(upstox_ext and upstox_ext.amo_session)
    instrument_token = (
        upstox_ext.instrument_token
        if upstox_ext and upstox_ext.instrument_token
        else f"{order.exchange}_EQ|{order.symbol.upper()}"
    )
    payload = {
        "quantity": order.quantity,
        "product": product,
        "validity": order.validity,
        "price": order.limit_price if order.order_type in {"LIMIT", "SL"} else 0,
        "tag": "alphavyuh",
        "instrument_token": instrument_token,
        "order_type": order_type,
        "transaction_type": order.side,
        "disclosed_quantity": 0,
        "trigger_price": order.trigger_price or 0,
        "is_amo": is_amo,
        "market_protection": 0,
    }
    if order.order_type in {"LIMIT", "SL"} and not order.limit_price:
        raise BrokerError(
            kind="INVALID_REQUEST",
            broker_id="upstox",
            message="Limit price is required for Upstox LIMIT and SL orders.",
            retryable=False,
        )
    if order.order_type in {"SL", "SL_MARKET"} and not order.trigger_price:
        raise BrokerError(
            kind="INVALID_REQUEST",
            broker_id="upstox",
            message="Trigger price is required for Upstox stop-loss orders.",
            retryable=False,
        )
    return payload


def _to_upstox_modify_payload(broker_order_id: BrokerOrderId, current: Order, patch: OrderPatch) -> dict[str, Any]:
    order_type = "SL-M" if current.order_type == "SL_MARKET" else current.order_type
    quantity = patch.quantity if patch.quantity is not None else current.quantity
    price = patch.limit_price if patch.limit_price is not None else current.limit_price
    trigger_price = patch.trigger_price if patch.trigger_price is not None else current.trigger_price
    payload = {
        "order_id": str(broker_order_id),
        "quantity": quantity,
        "validity": patch.validity or "DAY",
        "price": price if current.order_type in {"LIMIT", "SL"} else 0,
        "order_type": order_type,
        "disclosed_quantity": 0,
        "trigger_price": trigger_price if current.order_type in {"SL", "SL_MARKET"} else 0,
        "market_protection": 0,
    }
    if current.order_type in {"LIMIT", "SL"} and not payload["price"]:
        raise BrokerError(
            kind="INVALID_REQUEST",
            broker_id="upstox",
            message="Upstox LIMIT/SL modification requires a limit price.",
            retryable=False,
        )
    if current.order_type in {"SL", "SL_MARKET"} and not payload["trigger_price"]:
        raise BrokerError(
            kind="INVALID_REQUEST",
            broker_id="upstox",
            message="Upstox SL/SL_MARKET modification requires a trigger price.",
            retryable=False,
        )
    return payload


def _to_order(raw: dict[str, Any], trades: list[dict[str, Any]]) -> Order:
    broker_order_id = BrokerOrderId(str(raw.get("order_id") or ""))
    placed_at = _parse_upstox_time(raw.get("order_timestamp"))
    updated_at = _parse_upstox_time(raw.get("exchange_timestamp")) or placed_at
    fills = [_to_fill(trade, broker_order_id) for trade in trades]
    return Order(
        id=IdempotencyKey(str(raw.get("tag") or raw.get("order_ref_id") or raw.get("guid") or broker_order_id)),
        broker_order_id=broker_order_id,
        symbol=_symbol_from_upstox(raw),
        exchange=_exchange_from_upstox(raw.get("exchange")),
        side="SELL" if str(raw.get("transaction_type")).upper() == "SELL" else "BUY",
        order_type=_order_type_from_upstox(raw.get("order_type")),
        product=_product_from_upstox(raw.get("product")),
        status=_status_from_upstox(raw.get("status")),
        quantity=int(float(raw.get("quantity") or 0)),
        filled_quantity=int(float(raw.get("filled_quantity") or 0)),
        average_price=float(raw.get("average_price") or 0),
        fills=fills,
        child_broker_order_ids=[],
        limit_price=_optional_price(raw.get("price")),
        trigger_price=_optional_price(raw.get("trigger_price")),
        placed_at=placed_at,
        updated_at=updated_at,
        rejection_reason=raw.get("status_message") or raw.get("status_message_raw"),
    )


def _to_fill(raw: dict[str, Any], fallback_order_id: BrokerOrderId) -> Fill:
    broker_order_id = BrokerOrderId(str(raw.get("order_id") or fallback_order_id))
    return Fill(
        trade_id=str(raw.get("trade_id") or raw.get("exchange_order_id") or broker_order_id),
        broker_order_id=broker_order_id,
        symbol=_symbol_from_upstox(raw),
        side="SELL" if str(raw.get("transaction_type")).upper() == "SELL" else "BUY",
        fill_quantity=int(float(raw.get("quantity") or 0)),
        fill_price=float(raw.get("average_price") or 0),
        filled_at=_parse_upstox_time(raw.get("exchange_timestamp")),
    )


def _parse_upstox_time(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if not value:
        return datetime.now(timezone.utc)
    text = str(value)
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%dT%H:%M:%S.%f%z"):
        try:
            parsed = datetime.strptime(text, fmt)
            return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    try:
        parsed = datetime.fromisoformat(text)
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except ValueError:
        return datetime.now(timezone.utc)


def _symbol_from_upstox(raw: dict[str, Any]) -> str:
    symbol = str(raw.get("trading_symbol") or raw.get("tradingsymbol") or raw.get("instrument_token") or "")
    if "|" in symbol:
        symbol = symbol.split("|", 1)[1]
    return symbol.removesuffix("-EQ").upper()


def _exchange_from_upstox(value: Any) -> str:
    exchange = str(value or "NSE").upper()
    if exchange.startswith("BSE"):
        return "BSE"
    return "NSE"


def _product_from_upstox(value: Any) -> str:
    return {"D": "CNC", "I": "MIS", "CO": "MIS", "MTF": "CNC"}.get(str(value or "").upper(), "CNC")


def _order_type_from_upstox(value: Any) -> str:
    order_type = str(value or "MARKET").upper()
    return "SL_MARKET" if order_type == "SL-M" else order_type


def _status_from_upstox(value: Any) -> str:
    status = str(value or "").lower()
    if "complete" in status or status == "filled":
        return "COMPLETE"
    if "partial" in status:
        return "PARTIAL"
    if "cancel" in status:
        return "CANCELLED"
    if "reject" in status:
        return "REJECTED"
    if "open" in status:
        return "OPEN"
    return "PENDING"


def _optional_price(value: Any) -> float | None:
    price = float(value or 0)
    return price or None


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
