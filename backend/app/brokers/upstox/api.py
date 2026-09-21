"""Thin httpx wrapper for Upstox API v2."""
from __future__ import annotations

import os
from typing import Any
from urllib.parse import urlencode

import httpx

BASE_URL = "https://api.upstox.com/v2"
ORDER_BASE_URL = "https://api-hft.upstox.com/v2"
AUTH_URL = f"{BASE_URL}/login/authorization/dialog"
TOKEN_URL = f"{BASE_URL}/login/authorization/token"

_RETRY_STATUSES = {500, 502, 503, 504}
_TIMEOUT = httpx.Timeout(10.0, read=30.0)


def _client_id(client_id: str | None = None) -> str:
    return client_id or os.environ["UPSTOX_API_KEY"]


def _redirect_uri(redirect_uri: str | None = None) -> str:
    return redirect_uri or os.environ["UPSTOX_REDIRECT_URI"]


def get_auth_url(
    state: str,
    client_id: str | None = None,
    redirect_uri: str | None = None,
) -> str:
    params = urlencode(
        {
            "client_id": _client_id(client_id),
            "redirect_uri": _redirect_uri(redirect_uri),
            "state": state,
        }
    )
    return f"{AUTH_URL}?{params}"


def exchange_code(
    code: str,
    client_id: str | None = None,
    client_secret: str | None = None,
    redirect_uri: str | None = None,
) -> dict[str, Any]:
    return _request(
        "POST",
        "/login/authorization/token",
        access_token=None,
        data={
            "code": code,
            "client_id": _client_id(client_id),
            "client_secret": client_secret or os.environ["UPSTOX_API_SECRET"],
            "redirect_uri": _redirect_uri(redirect_uri),
            "grant_type": "authorization_code",
        },
        form=True,
    )


def get_profile(access_token: str) -> dict[str, Any]:
    return _request("GET", "/user/profile", access_token=access_token)["data"]


def get_holdings(access_token: str) -> list[dict[str, Any]]:
    return _request("GET", "/portfolio/long-term-holdings", access_token=access_token)["data"]


def get_positions(access_token: str) -> list[dict[str, Any]]:
    return _request("GET", "/portfolio/short-term-positions", access_token=access_token)["data"]


def place_order(access_token: str, payload: dict[str, Any]) -> dict[str, Any]:
    return _request("POST", "/order/place", access_token=access_token, data=payload, base_url=ORDER_BASE_URL)["data"]


def modify_order(access_token: str, payload: dict[str, Any]) -> dict[str, Any]:
    return _request("PUT", "/order/modify", access_token=access_token, data=payload, base_url=ORDER_BASE_URL)["data"]


def cancel_order(access_token: str, order_id: str) -> dict[str, Any]:
    return _request(
        "DELETE",
        "/order/cancel",
        access_token=access_token,
        params={"order_id": order_id},
        base_url=ORDER_BASE_URL,
    )["data"]


def get_order_details(access_token: str, order_id: str) -> dict[str, Any]:
    return _request("GET", "/order/details", access_token=access_token, params={"order_id": order_id})["data"]


def list_orders(access_token: str) -> list[dict[str, Any]]:
    return _request("GET", "/order/retrieve-all", access_token=access_token)["data"]


def get_order_trades(access_token: str, order_id: str) -> list[dict[str, Any]]:
    return _request("GET", "/order/trades", access_token=access_token, params={"order_id": order_id})["data"]


def _headers(access_token: str | None, form: bool = False) -> dict[str, str]:
    headers = {"Accept": "application/json"}
    if form:
        headers["Content-Type"] = "application/x-www-form-urlencoded"
    else:
        headers["Content-Type"] = "application/json"
    if access_token:
        headers["Authorization"] = f"Bearer {access_token}"
    return headers


def _request(
    method: str,
    path: str,
    access_token: str | None,
    data: dict[str, Any] | None = None,
    params: dict[str, Any] | None = None,
    form: bool = False,
    base_url: str = BASE_URL,
) -> dict[str, Any]:
    url = f"{base_url}{path}"
    headers = _headers(access_token, form=form)

    for attempt in range(3):
        try:
            with httpx.Client(timeout=_TIMEOUT) as client:
                resp = client.request(
                    method,
                    url,
                    headers=headers,
                    params=params,
                    data=data if form else None,
                    json=None if form else data,
                )
        except httpx.RequestError as exc:
            if attempt < 2:
                continue
            raise UpstoxApiError(status=503, code="NetworkException", message=str(exc)) from exc

        if resp.status_code in _RETRY_STATUSES and attempt < 2:
            continue

        if not resp.is_success:
            body: dict[str, Any] = {}
            try:
                body = resp.json()
            except Exception:
                pass
            errors = body.get("errors") if isinstance(body.get("errors"), list) else []
            first_error = errors[0] if errors else {}
            raise UpstoxApiError(
                status=resp.status_code,
                code=str(first_error.get("errorCode") or body.get("code") or body.get("status") or "UpstoxApiError"),
                message=str(first_error.get("message") or body.get("message") or resp.text),
            )

        return resp.json()  # type: ignore[return-value]

    raise UpstoxApiError(status=503, code="NetworkException", message="max retries exceeded")


class UpstoxApiError(Exception):
    def __init__(self, status: int, code: str, message: str) -> None:
        self.status = status
        self.code = code
        self.message = message
        super().__init__(f"[{code}] {message} (HTTP {status})")
