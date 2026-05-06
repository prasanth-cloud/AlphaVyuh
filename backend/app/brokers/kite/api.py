"""
Thin httpx wrapper for Kite Connect v3.
No business logic — only auth headers, timeouts, and transient-5xx retry.
"""
from __future__ import annotations

import hashlib
import os
from typing import Any

import httpx

BASE_URL = "https://api.kite.trade"
LOGIN_URL = "https://kite.zerodha.com/connect/login"
SESSION_URL = f"{BASE_URL}/session/token"

_RETRY_STATUSES = {500, 502, 503, 504}
_TIMEOUT = httpx.Timeout(10.0, read=30.0)


def _api_key(api_key: str | None = None) -> str:
    return api_key or os.environ["KITE_API_KEY"]


def _checksum(api_key: str, request_token: str, api_secret: str) -> str:
    raw = f"{api_key}{request_token}{api_secret}"
    return hashlib.sha256(raw.encode()).hexdigest()


def get_auth_url(state: str, api_key: str | None = None) -> str:
    return f"{LOGIN_URL}?api_key={_api_key(api_key)}&v=3&state={state}"


def exchange_code(
    request_token: str,
    api_key: str | None = None,
    api_secret: str | None = None,
) -> dict[str, Any]:
    api_key = _api_key(api_key)
    api_secret = api_secret or os.environ["KITE_API_SECRET"]
    cs = _checksum(api_key, request_token, api_secret)
    r = _post(
        "/session/token",
        data={"api_key": api_key, "request_token": request_token, "checksum": cs},
        access_token=None,
        api_key=api_key,
    )
    return r["data"]


def get_profile(access_token: str, api_key: str | None = None) -> dict[str, Any]:
    return _get("/user/profile", access_token, api_key=api_key)["data"]


def get_holdings(access_token: str, api_key: str | None = None) -> list[dict[str, Any]]:
    return _get("/portfolio/holdings", access_token, api_key=api_key)["data"]


def get_positions(access_token: str, api_key: str | None = None) -> dict[str, Any]:
    return _get("/portfolio/positions", access_token, api_key=api_key)["data"]


def place_order(
    access_token: str,
    variety: str,
    params: dict[str, Any],
    api_key: str | None = None,
) -> dict[str, Any]:
    return _post(f"/orders/{variety}", data=params, access_token=access_token, api_key=api_key)["data"]


def modify_order(access_token: str, variety: str, order_id: str, params: dict[str, Any]) -> dict[str, Any]:
    return _put(f"/orders/{variety}/{order_id}", data=params, access_token=access_token)["data"]


def cancel_order(access_token: str, variety: str, order_id: str) -> dict[str, Any]:
    return _delete(f"/orders/{variety}/{order_id}", access_token=access_token)["data"]


def get_order(access_token: str, order_id: str, api_key: str | None = None) -> dict[str, Any]:
    return _get(f"/orders/{order_id}", access_token, api_key=api_key)["data"]


def get_order_trades(access_token: str, order_id: str, api_key: str | None = None) -> list[dict[str, Any]]:
    return _get(f"/orders/{order_id}/trades", access_token, api_key=api_key)["data"]


def list_orders(access_token: str, api_key: str | None = None) -> list[dict[str, Any]]:
    return _get("/orders", access_token, api_key=api_key)["data"]


def get_instruments(exchange: str | None = None, access_token: str | None = None, api_key: str | None = None) -> str:
    path = f"/instruments/{exchange}" if exchange else "/instruments"
    url = f"{BASE_URL}{path}"
    headers = _headers(access_token, api_key=api_key)
    try:
        with httpx.Client(timeout=_TIMEOUT) as client:
            resp = client.get(url, headers=headers)
    except httpx.RequestError as exc:
        raise KiteApiError(status=503, error_type="NetworkException", message=str(exc)) from exc
    if not resp.is_success:
        body: dict[str, Any] = {}
        try:
            body = resp.json()
        except Exception:
            pass
        raise KiteApiError(
            status=resp.status_code,
            error_type=body.get("error_type", "NetworkException"),
            message=body.get("message", resp.text),
        )
    return resp.text


def get_quote_ohlc(instruments: list[str], access_token: str, api_key: str | None = None) -> dict[str, Any]:
    return _get("/quote/ohlc", access_token, api_key=api_key, params={"i": instruments})["data"]


def get_quote(instruments: list[str], access_token: str, api_key: str | None = None) -> dict[str, Any]:
    return _get("/quote", access_token, api_key=api_key, params={"i": instruments})["data"]


def get_historical_data(
    access_token: str,
    instrument_token: int | str,
    interval: str,
    from_date: str,
    to_date: str,
    api_key: str | None = None,
    continuous: bool = False,
    oi: bool = False,
) -> list[list[Any]]:
    data = _get(
        f"/instruments/historical/{instrument_token}/{interval}",
        access_token,
        api_key=api_key,
        params={
            "from": from_date,
            "to": to_date,
            "continuous": 1 if continuous else 0,
            "oi": 1 if oi else 0,
        },
    )
    return data["data"]["candles"]


# ─── HTTP helpers ─────────────────────────────────────────────────────────────


def _headers(access_token: str | None, api_key: str | None = None) -> dict[str, str]:
    resolved_api_key = _api_key(api_key)
    h = {
        "X-Kite-Version": "3",
        "X-Kite-Apikey": resolved_api_key,
    }
    if access_token:
        h["Authorization"] = f"token {resolved_api_key}:{access_token}"
    return h


def _get(
    path: str,
    access_token: str,
    api_key: str | None = None,
    params: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return _request("GET", path, access_token=access_token, api_key=api_key, params=params)


def _post(
    path: str,
    data: dict[str, Any],
    access_token: str | None,
    api_key: str | None = None,
) -> dict[str, Any]:
    return _request("POST", path, access_token=access_token, data=data, api_key=api_key)


def _put(path: str, data: dict[str, Any], access_token: str) -> dict[str, Any]:
    return _request("PUT", path, access_token=access_token, data=data)


def _delete(path: str, access_token: str) -> dict[str, Any]:
    return _request("DELETE", path, access_token=access_token)


def _request(
    method: str,
    path: str,
    access_token: str | None,
    data: dict[str, Any] | None = None,
    api_key: str | None = None,
    params: dict[str, Any] | None = None,
) -> dict[str, Any]:
    url = f"{BASE_URL}{path}"
    headers = _headers(access_token, api_key=api_key)

    for attempt in range(3):
        try:
            with httpx.Client(timeout=_TIMEOUT) as client:
                resp = client.request(method, url, headers=headers, data=data, params=params)
        except httpx.RequestError as exc:
            if attempt < 2:
                continue
            raise KiteApiError(status=503, error_type="NetworkException", message=str(exc)) from exc

        if resp.status_code in _RETRY_STATUSES and attempt < 2:
            continue

        if not resp.is_success:
            body: dict[str, Any] = {}
            try:
                body = resp.json()
            except Exception:
                pass
            raise KiteApiError(
                status=resp.status_code,
                error_type=body.get("error_type", "NetworkException"),
                message=body.get("message", resp.text),
            )

        return resp.json()  # type: ignore[return-value]

    raise KiteApiError(status=503, error_type="NetworkException", message="max retries exceeded")


class KiteApiError(Exception):
    def __init__(self, status: int, error_type: str, message: str) -> None:
        self.status = status
        self.error_type = error_type
        self.message = message
        super().__init__(f"[{error_type}] {message} (HTTP {status})")
