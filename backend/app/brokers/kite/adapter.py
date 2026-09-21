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
from typing import Any, Optional

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
from app.brokers.kite import api as kite_api
from app.brokers.kite.api import KiteApiError
from app.brokers.kite.types import KiteHolding, KiteProfile
from app.services.supabase import get_admin_client

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
    return _KITE_STATUS_MAP.get(raw.upper(), "PENDING")


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
        cached = _cached_order_result(user_id, order.idempotency_key)
        if cached is not None:
            return cached

        params, variety = _to_kite_order_payload(order)
        try:
            _reserve_order_key(user_id, order)
        except Exception as exc:
            cached = _cached_order_result(user_id, order.idempotency_key)
            if cached is not None:
                return cached
            raise BrokerError(
                kind="UNKNOWN",
                broker_id="zerodha",
                message="Order idempotency key is already reserved and the broker result is not reconciled yet.",
                retryable=False,
                possibly_executed=True,
                cause=exc,
            ) from exc

        try:
            data = kite_api.place_order(creds.access_token, variety=variety, params=params)
        except KiteApiError as exc:
            raise _wrap(exc, broker_id="zerodha") from exc

        broker_order_id = str(data.get("order_id") or data or "")
        if not broker_order_id:
            raise BrokerError(
                kind="BROKER_REJECTED",
                broker_id="zerodha",
                message="Kite order response did not include an order id.",
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

    async def modify_order(
        self,
        creds: BrokerCredentials,
        broker_order_id: BrokerOrderId,
        patch: OrderPatch,
    ) -> ModifyResult:
        current = await self.get_order(creds, broker_order_id)
        params = _to_kite_modify_payload(current, patch)
        try:
            kite_api.modify_order(creds.access_token, "regular", str(broker_order_id), params)
        except KiteApiError as exc:
            raise _wrap(exc, broker_id="zerodha") from exc
        return ModifyResult(order=await self.get_order(creds, broker_order_id))

    async def cancel_order(
        self,
        creds: BrokerCredentials,
        broker_order_id: BrokerOrderId,
    ) -> ModifyResult:
        try:
            kite_api.cancel_order(creds.access_token, "regular", str(broker_order_id))
        except KiteApiError as exc:
            raise _wrap(exc, broker_id="zerodha") from exc
        return ModifyResult(order=await self.get_order(creds, broker_order_id))

    async def get_order(
        self,
        creds: BrokerCredentials,
        broker_order_id: BrokerOrderId,
    ) -> Order:
        try:
            raw_history = kite_api.get_order(creds.access_token, str(broker_order_id))
            trades = kite_api.get_order_trades(creds.access_token, str(broker_order_id))
        except KiteApiError as exc:
            raise _wrap(exc, broker_id="zerodha") from exc
        raw = raw_history[-1] if isinstance(raw_history, list) and raw_history else raw_history
        return _to_order(raw, trades=trades)

    async def list_orders(self, creds: BrokerCredentials) -> list[Order]:
        try:
            rows = kite_api.list_orders(creds.access_token)
        except KiteApiError as exc:
            raise _wrap(exc, broker_id="zerodha") from exc
        # Keep the shared contract equity-only until derivatives have a
        # dedicated instrument/order model. Without this filter, NFO/MCX/CDS
        # orders would be silently relabeled as NSE by _to_order().
        return [
            _to_order(row, trades=[])
            for row in rows
            if str(row.get("exchange") or "").upper() in {"NSE", "BSE"}
        ]

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
            "broker_id": "zerodha",
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


def _to_kite_order_payload(order: OrderRequest) -> tuple[dict[str, Any], str]:
    kite_ext = order.extensions.zerodha if order.extensions else None
    variety = (kite_ext.variety if kite_ext and kite_ext.variety else "regular")
    order_type = "SL-M" if order.order_type == "SL_MARKET" else order.order_type
    params: dict[str, Any] = {
        "exchange": order.exchange,
        "tradingsymbol": order.symbol.upper(),
        "transaction_type": order.side,
        "quantity": order.quantity,
        "product": order.product,
        "order_type": order_type,
        "validity": order.validity,
    }
    if order.order_type in {"LIMIT", "SL"}:
        if order.limit_price is None:
            raise BrokerError(
                kind="INVALID_REQUEST",
                broker_id="zerodha",
                message="Limit price is required for Kite LIMIT and SL orders.",
                retryable=False,
            )
        params["price"] = order.limit_price
    if order.order_type in {"SL", "SL_MARKET"}:
        trigger = order.trigger_price or (kite_ext.trigger_price if kite_ext else None)
        if trigger is None:
            raise BrokerError(
                kind="INVALID_REQUEST",
                broker_id="zerodha",
                message="Trigger price is required for Kite stop-loss orders.",
                retryable=False,
            )
        params["trigger_price"] = trigger
    if kite_ext:
        for key in ("squareoff_absolute", "stoploss_absolute", "trailing_stoploss", "iceberg_legs", "iceberg_quantity"):
            value = getattr(kite_ext, key)
            if value is not None:
                params[key] = value
    return params, variety


def _to_kite_modify_payload(current: Order, patch: OrderPatch) -> dict[str, Any]:
    payload: dict[str, Any] = {}
    if patch.quantity is not None:
        payload["quantity"] = patch.quantity
    if patch.limit_price is not None:
        payload["price"] = patch.limit_price
    if patch.trigger_price is not None:
        payload["trigger_price"] = patch.trigger_price
    if patch.validity is not None:
        payload["validity"] = patch.validity
    if current.order_type in {"LIMIT", "SL"} and "price" not in payload and current.limit_price is None:
        raise BrokerError(
            kind="INVALID_REQUEST",
            broker_id="zerodha",
            message="Kite LIMIT/SL modification requires a limit price.",
            retryable=False,
        )
    return payload


def _to_order(raw: dict[str, Any], trades: list[dict[str, Any]]) -> Order:
    broker_order_id = BrokerOrderId(str(raw.get("order_id") or ""))
    placed_at = _parse_kite_time(raw.get("order_timestamp") or raw.get("exchange_timestamp"))
    updated_at = _parse_kite_time(raw.get("exchange_update_timestamp") or raw.get("exchange_timestamp")) or placed_at
    fills = [_to_fill(trade, broker_order_id) for trade in trades]
    filled_quantity = int(float(raw.get("filled_quantity") or sum(fill.fill_quantity for fill in fills) or 0))
    return Order(
        id=IdempotencyKey(str(raw.get("tag") or broker_order_id)),
        broker_order_id=broker_order_id,
        symbol=str(raw.get("tradingsymbol") or "").upper(),
        exchange="BSE" if str(raw.get("exchange")).upper() == "BSE" else "NSE",
        side="SELL" if str(raw.get("transaction_type")).upper() == "SELL" else "BUY",
        order_type=_order_type_from_kite(raw.get("order_type")),
        product=_product_from_kite(raw.get("product")),
        status=_map_kite_status(str(raw.get("status") or "")),
        quantity=int(float(raw.get("quantity") or 0)),
        filled_quantity=filled_quantity,
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
        symbol=str(raw.get("tradingsymbol") or "").upper(),
        side="SELL" if str(raw.get("transaction_type")).upper() == "SELL" else "BUY",
        fill_quantity=int(float(raw.get("quantity") or 0)),
        fill_price=float(raw.get("average_price") or raw.get("price") or 0),
        filled_at=_parse_kite_time(raw.get("fill_timestamp") or raw.get("exchange_timestamp") or raw.get("order_timestamp")),
    )


def _parse_kite_time(value: Any) -> datetime:
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


def _order_type_from_kite(value: Any) -> str:
    order_type = str(value or "MARKET").upper()
    return "SL_MARKET" if order_type == "SL-M" else order_type


def _product_from_kite(value: Any) -> str:
    return {"CNC": "CNC", "MIS": "MIS", "NRML": "NRML"}.get(str(value or "").upper(), "CNC")


def _optional_price(value: Any) -> float | None:
    price = float(value or 0)
    return price or None
