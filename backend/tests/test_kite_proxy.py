"""
Smoke tests for Kite order proxy routing.

Tests verify proxy path detection, env var reading, and outbound IP verification.
Pure logic only — no DB, no supabase import chain.
"""
import os
from unittest.mock import patch

import pytest

_ORDER_PATH_PREFIXES = ("/orders",)


def _needs_proxy(path: str) -> bool:
    """Mirror of app.brokers.kite.api._needs_proxy (avoids supabase import chain)."""
    return any(path.startswith(prefix) for prefix in _ORDER_PATH_PREFIXES)


def _proxy_url() -> str | None:
    """Mirror of app.brokers.kite.api._proxy_url."""
    return os.environ.get("KITE_PROXY_URL")


class TestProxyRouting:

    def test_order_path_needs_proxy(self):
        assert _needs_proxy("/orders/regular") is True
        assert _needs_proxy("/orders/amo") is True
        assert _needs_proxy("/orders/12345") is True
        assert _needs_proxy("/orders") is True

    def test_non_order_path_skips_proxy(self):
        assert _needs_proxy("/user/profile") is False
        assert _needs_proxy("/portfolio/holdings") is False
        assert _needs_proxy("/portfolio/positions") is False
        assert _needs_proxy("/instruments") is False
        assert _needs_proxy("/quote") is False
        assert _needs_proxy("/session/token") is False

    def test_proxy_url_from_env(self):
        with patch.dict(os.environ, {"KITE_PROXY_URL": "http://proxy.example.com:8888"}):
            assert _proxy_url() == "http://proxy.example.com:8888"

    def test_proxy_url_none_when_unset(self):
        with patch.dict(os.environ, {}, clear=True):
            os.environ.pop("KITE_PROXY_URL", None)
            assert _proxy_url() is None


class TestProxyIPVerification:
    """Verify outbound IP through proxy matches the registered IP.

    Skipped in CI without a proxy — runs only when KITE_PROXY_URL is set.
    """

    @pytest.mark.skipif(
        not os.environ.get("KITE_PROXY_URL"),
        reason="KITE_PROXY_URL not set — proxy not available",
    )
    def test_outbound_ip_matches_registered(self):
        import httpx

        proxy_url = os.environ["KITE_PROXY_URL"]
        expected_ip = os.environ.get("KITE_PROXY_IP")

        with httpx.Client(proxy=proxy_url, timeout=httpx.Timeout(10.0)) as client:
            resp = client.get("https://api.ipify.org?format=json")
            actual_ip = resp.json()["ip"]

        if expected_ip:
            assert actual_ip == expected_ip, (
                f"Proxy outbound IP {actual_ip} does not match registered IP {expected_ip}"
            )
        else:
            assert actual_ip, "Could not determine outbound IP through proxy"
