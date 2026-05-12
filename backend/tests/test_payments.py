"""Tests for payment plan pricing and signature verification."""
import hashlib
import hmac
import os

import pytest
from fastapi import HTTPException

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")

from app.routers import payments  # noqa: E402


# ── Plan prices ────────────────────────────────────────────────────────────────

PLAN_PRICES = {
    ("pro",   "INR", "monthly"): {"amount": 199900,  "days": 30},
    ("pro",   "INR", "annual"):  {"amount": 1999900, "days": 365},
    ("elite", "INR", "monthly"): {"amount": 499900,  "days": 30},
    ("elite", "INR", "annual"):  {"amount": 4999900, "days": 365},
    ("pro",   "USD", "monthly"): {"amount": 2900,    "days": 30},
    ("pro",   "USD", "annual"):  {"amount": 27900,   "days": 365},
    ("elite", "USD", "monthly"): {"amount": 6900,    "days": 30},
    ("elite", "USD", "annual"):  {"amount": 69900,   "days": 365},
}


class TestPlanPrices:
    def test_all_combinations_present(self):
        plans = ["pro", "elite"]
        currencies = ["INR", "USD"]
        periods = ["monthly", "annual"]
        for plan in plans:
            for curr in currencies:
                for period in periods:
                    assert (plan, curr, period) in PLAN_PRICES

    def test_annual_costs_more_than_monthly(self):
        for plan in ["pro", "elite"]:
            for curr in ["INR", "USD"]:
                monthly = PLAN_PRICES[(plan, curr, "monthly")]["amount"]
                annual = PLAN_PRICES[(plan, curr, "annual")]["amount"]
                assert annual > monthly * 8  # annual costs more than 8 months

    def test_annual_less_than_12_months(self):
        for plan in ["pro", "elite"]:
            for curr in ["INR", "USD"]:
                monthly = PLAN_PRICES[(plan, curr, "monthly")]["amount"]
                annual = PLAN_PRICES[(plan, curr, "annual")]["amount"]
                assert annual < monthly * 12  # annual saves something

    def test_days_for_monthly(self):
        for key, val in PLAN_PRICES.items():
            if key[2] == "monthly":
                assert val["days"] == 30

    def test_days_for_annual(self):
        for key, val in PLAN_PRICES.items():
            if key[2] == "annual":
                assert val["days"] == 365

    def test_elite_costs_more_than_pro(self):
        for curr in ["INR", "USD"]:
            for period in ["monthly", "annual"]:
                pro = PLAN_PRICES[("pro", curr, period)]["amount"]
                elite = PLAN_PRICES[("elite", curr, period)]["amount"]
                assert elite > pro


class TestPaymentSignature:
    """Test Razorpay HMAC-SHA256 signature verification logic."""

    def _make_sig(self, order_id: str, payment_id: str, secret: str) -> str:
        body = f"{order_id}|{payment_id}"
        return hmac.new(secret.encode(), body.encode(), hashlib.sha256).hexdigest()

    def test_valid_signature(self):
        secret = "test_secret_key"
        order_id = "order_abc123"
        payment_id = "pay_xyz789"
        sig = self._make_sig(order_id, payment_id, secret)
        body = f"{order_id}|{payment_id}"
        expected = hmac.new(secret.encode(), body.encode(), hashlib.sha256).hexdigest()
        assert hmac.compare_digest(sig, expected)

    def test_invalid_signature_rejected(self):
        secret = "test_secret_key"
        order_id = "order_abc123"
        payment_id = "pay_xyz789"
        tampered_sig = "0000000000000000000000000000000000000000000000000000000000000000"
        body = f"{order_id}|{payment_id}"
        expected = hmac.new(secret.encode(), body.encode(), hashlib.sha256).hexdigest()
        assert not hmac.compare_digest(tampered_sig, expected)

    def test_wrong_secret_rejected(self):
        order_id = "order_abc123"
        payment_id = "pay_xyz789"
        sig = self._make_sig(order_id, payment_id, "correct_secret")
        body = f"{order_id}|{payment_id}"
        expected = hmac.new("wrong_secret".encode(), body.encode(), hashlib.sha256).hexdigest()
        assert not hmac.compare_digest(sig, expected)


def test_founder_codes_default_to_disabled(monkeypatch):
    monkeypatch.setattr(payments.settings, "founder_plan_codes", "")

    assert payments._enabled_founder_codes() == set()


def test_checkout_kill_switch_defaults_to_disabled(monkeypatch):
    monkeypatch.setattr(payments.settings, "payment_checkout_enabled", False)

    with pytest.raises(HTTPException) as exc:
        payments._ensure_checkout_enabled()

    assert exc.value.status_code == 403
    assert "disabled" in exc.value.detail


def test_payment_verify_uses_order_metadata_not_client_plan():
    order = {
        "amount": payments.PLAN_PRICES[("pro", "INR", "monthly")]["amount"],
        "currency": "INR",
        "notes": {
            "user_id": "user-123",
            "plan": "pro",
            "currency": "INR",
            "billing": "monthly",
        },
    }

    assert payments._validated_order_context(order, expected_user_id="user-123") == ("pro", "INR", "monthly")

    tampered = {**order, "amount": payments.PLAN_PRICES[("elite", "INR", "annual")]["amount"]}
    with pytest.raises(HTTPException) as exc:
        payments._validated_order_context(tampered, expected_user_id="user-123")
    assert exc.value.status_code == 400
