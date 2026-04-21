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


def _api_key() -> str:
    return os.environ["KITE_API_KEY"]


def _checksum(api_key: str, request_token: str, api_secret: str) -> str:
    raw = f"{api_key}{request_token}{api_secret}"
    return hashlib.sha256(raw.encode()).hexdigest()


def get_auth_url(state: str) -> str:
    return f"{LOGIN_URL}?api_key={_api_key()}&v=3&state={state}"


def exchange_code(request_token: str) -> dict[str, Any]:
    api_key = _api_key()
    api_secret = os.environ["KITE_API_SECRET"]
    cs = _checksum(api_key, request_token, api_secret)
    r = _post(
        "/session/token",
        data={"api_key": api_key, "request_token": request_token, "checksum": cs},
        access_token=None,
    )
    return r["data"]


def get_profile(access_token: str) -> dict[str, Any]:
    return _get("/user/profile", access_token)["data"]


def get_holdings(access_token: str) -> list[dict[str, Any]]:
    return _get("/portfolio/holdings", access_token)["data"]


def get_positions(access_token: str) -> dict[str, Any]:
    return _get("/portfolio/positions", access_token)["data"]


def place_order(access_token: str, variety: str, params: dict[str, Any]) -> dict[str, Any]:
    return _post(f"/orders/{variety}", data=params, access_token=access_token)["data"]


def modify_order(access_token: str, variety: str, order_id: str, params: dict[str, Any]) -> dict[str, Any]:
    return _put(f"/orders/{variety}/{order_id}", data=params, access_token=access_token)["data"]


def cancel_order(access_token: str, variety: str, order_id: str) -> dict[str, Any]:
    return _delete(f"/orders/{variety}/{order_id}", access_token=access_token)["data"]


def get_order(access_token: str, order_id: str) -> dict[str, Any]:
    return _get(f"/orders/{order_id}", access_token)["data"]


def get_order_trades(access_token: str, order_id: str) -> list[dict[str, Any]]:
    return _get(f"/orders/{order_id}/trades", access_token)["data"]


def list_orders(access_token: str) -> list[dict[str, Any]]:
    return _get("/orders", access_token)["data"]


# ─── HTTP helpers ─────────────────────────────────────────────────────────────


def _headers(access_token: str | None) -> dict[str, str]:
    h = {
        "X-Kite-Version": "3",
        "X-Kite-Apikey": _api_key(),
    }
    if access_token:
        h["Authorization"] = f"token {_api_key()}:{access_token}"
    return h


def _get(path: str, access_token: str) -> dict[str, Any]:
    return _request("GET", path, access_token=access_token)


def _post(path: str, data: dict[str, Any], access_token: str | None) -> dict[str, Any]:
    return _request("POST", path, access_token=access_token, data=data)


def _put(path: str, data: dict[str, Any], access_token: str) -> dict[str, Any]:
    return _request("PUT", path, access_token=access_token, data=data)


def _delete(path: str, access_token: str) -> dict[str, Any]:
    return _request("DELETE", path, access_token=access_token)


def _request(
    method: str,
    path: str,
    access_token: str | None,
    data: dict[str, Any] | None = None,
) -> dict[str, Any]:
    url = f"{BASE_URL}{path}"
    headers = _headers(access_token)

    for attempt in range(3):
        with httpx.Client(timeout=_TIMEOUT) as client:
            resp = client.request(method, url, headers=headers, data=data)

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
