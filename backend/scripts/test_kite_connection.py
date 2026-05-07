"""
Verify Zerodha Kite Connect credentials without printing secrets by default.

Usage:
    cd backend
    python scripts/test_kite_connection.py --login-url
    python scripts/test_kite_connection.py --request-token <request_token>
    python scripts/test_kite_connection.py --access-token <access_token>

If KITE_ACCESS_TOKEN is already set in backend/.env, the script can be run with
no flags to verify profile, instruments, quote, and historical candles.
"""
from __future__ import annotations

import argparse
import os
import secrets
import sys
from datetime import date, timedelta
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
load_dotenv(ROOT / ".env")

from app.brokers.kite import api as kite_api  # noqa: E402
from app.brokers.kite.api import KiteApiError  # noqa: E402


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


def _verify(access_token: str, symbol: str) -> None:
    api_key = _require_env("KITE_API_KEY")
    print(f"KITE_API_KEY: {_mask(api_key)}")
    print(f"KITE_ACCESS_TOKEN: {_mask(access_token)}")

    profile = kite_api.get_profile(access_token, api_key=api_key)
    print(f"Profile OK: {profile.get('user_name') or profile.get('user_id')}")

    instruments_csv = kite_api.get_instruments("NSE", access_token=None, api_key=api_key)
    first_line = instruments_csv.splitlines()[0] if instruments_csv else ""
    if "instrument_token" not in first_line:
        raise SystemExit("Instrument dump did not look like Kite CSV data")
    print("NSE instruments OK")

    instrument_key = f"NSE:{symbol.upper()}"
    quote = kite_api.get_quote_ohlc([instrument_key], access_token, api_key=api_key).get(instrument_key)
    if not quote:
        raise SystemExit(f"No quote returned for {instrument_key}")
    print(f"Quote OK: {instrument_key} LTP={quote.get('last_price')}")

    from_date = (date.today() - timedelta(days=14)).isoformat() + " 00:00:00"
    to_date = date.today().isoformat() + " 23:59:59"
    token = quote["instrument_token"]
    candles = kite_api.get_historical_data(access_token, token, "day", from_date, to_date, api_key=api_key)
    if not candles:
        raise SystemExit(f"No historical candles returned for {instrument_key}")
    print(f"Historical OK: {len(candles)} daily candles")


def main() -> None:
    parser = argparse.ArgumentParser(description="Verify Zerodha Kite Connect credentials")
    parser.add_argument("--login-url", action="store_true", help="Print the Kite login URL")
    parser.add_argument("--request-token", help="Exchange a Kite request_token for an access_token")
    parser.add_argument("--access-token", help="Verify using this access token instead of KITE_ACCESS_TOKEN")
    parser.add_argument(
        "--print-access-token",
        action="store_true",
        help="Unsafe debug only: requires ALLOW_PRINT_ACCESS_TOKEN=true",
    )
    parser.add_argument("--symbol", default="RELIANCE", help="NSE symbol to test, default RELIANCE")
    args = parser.parse_args()

    try:
        if args.login_url:
            state = secrets.token_urlsafe(16)
            print(kite_api.get_auth_url(state))
            print("After login, copy only the request_token query param from the redirect URL.")
            return

        if args.request_token:
            _require_env("KITE_API_SECRET")
            session = kite_api.exchange_code(args.request_token)
            access_token = session["access_token"]
            if args.print_access_token and os.getenv("ALLOW_PRINT_ACCESS_TOKEN") != "true":
                raise SystemExit("--print-access-token requires ALLOW_PRINT_ACCESS_TOKEN=true")
            print(f"Access token OK: {access_token if args.print_access_token else _mask(access_token)}")
            print("Add this value to backend/.env as KITE_ACCESS_TOKEN for today's session.")
            _verify(access_token, args.symbol)
            return

        access_token = args.access_token or os.getenv("KITE_ACCESS_TOKEN", "").strip()
        if not access_token:
            raise SystemExit("KITE_ACCESS_TOKEN is missing. Run with --login-url, then --request-token <token>.")
        _verify(access_token, args.symbol)
    except KiteApiError as exc:
        raise SystemExit(f"Kite API error [{exc.error_type}] HTTP {exc.status}: {exc.message}") from exc


if __name__ == "__main__":
    main()
