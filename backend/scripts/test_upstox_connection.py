"""
Verify Upstox OAuth/API credentials without printing secrets or placing orders.

Usage:
    cd backend
    python scripts/test_upstox_connection.py --login-url
    python scripts/test_upstox_connection.py --code <authorization_code>
    python scripts/test_upstox_connection.py --access-token <access_token>

If UPSTOX_ACCESS_TOKEN is already set in backend/.env, the script can be run with
no flags to verify profile, holdings, and today's order book. This script never
places, modifies, or cancels orders.
"""
from __future__ import annotations

import argparse
import os
import secrets
import sys
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
load_dotenv(ROOT / ".env")

from app.brokers.upstox import api as upstox_api  # noqa: E402
from app.brokers.upstox.api import UpstoxApiError  # noqa: E402


def _mask(value: str | None) -> str:
    if not value:
        return "missing"
    if len(value) <= 8:
        return "set"
    return f"{value[:4]}...{value[-4:]}"


def _require_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise SystemExit(f"{name} is missing in backend/.env")
    return value


def _verify(access_token: str, skip_orders: bool) -> None:
    api_key = _require_env("UPSTOX_API_KEY")
    print(f"UPSTOX_API_KEY: {_mask(api_key)}")
    print(f"UPSTOX_ACCESS_TOKEN: {_mask(access_token)}")

    profile = upstox_api.get_profile(access_token)
    print(f"Profile OK: {profile.get('user_name') or profile.get('name') or profile.get('user_id')}")

    holdings = upstox_api.get_holdings(access_token)
    print(f"Holdings OK: {len(holdings)} rows")

    if not skip_orders:
        orders = upstox_api.list_orders(access_token)
        print(f"Order book OK: {len(orders)} rows")


def main() -> None:
    parser = argparse.ArgumentParser(description="Verify Upstox credentials without live order actions")
    parser.add_argument("--login-url", action="store_true", help="Print the Upstox OAuth login URL")
    parser.add_argument("--code", help="Exchange an Upstox authorization code for an access token")
    parser.add_argument("--access-token", help="Verify using this access token instead of UPSTOX_ACCESS_TOKEN")
    parser.add_argument(
        "--print-access-token",
        action="store_true",
        help="Unsafe debug only: requires ALLOW_PRINT_ACCESS_TOKEN=true",
    )
    parser.add_argument("--skip-orders", action="store_true", help="Skip today's order-book read")
    args = parser.parse_args()

    try:
        if args.login_url:
            state = secrets.token_urlsafe(16)
            print(upstox_api.get_auth_url(state))
            print("After login, copy only the code query param from the redirect URL.")
            return

        if args.code:
            _require_env("UPSTOX_API_SECRET")
            session = upstox_api.exchange_code(args.code)
            access_token = session["access_token"]
            if args.print_access_token and os.getenv("ALLOW_PRINT_ACCESS_TOKEN") != "true":
                raise SystemExit("--print-access-token requires ALLOW_PRINT_ACCESS_TOKEN=true")
            print(f"Access token OK: {access_token if args.print_access_token else _mask(access_token)}")
            print("Add this value to backend/.env as UPSTOX_ACCESS_TOKEN for today's session.")
            _verify(access_token, args.skip_orders)
            return

        access_token = args.access_token or os.getenv("UPSTOX_ACCESS_TOKEN", "").strip()
        if not access_token:
            raise SystemExit("UPSTOX_ACCESS_TOKEN is missing. Run with --login-url, then --code <code>.")
        _verify(access_token, args.skip_orders)
    except UpstoxApiError as exc:
        raise SystemExit(f"Upstox API error [{exc.code}] HTTP {exc.status}: {exc.message}") from exc


if __name__ == "__main__":
    main()
