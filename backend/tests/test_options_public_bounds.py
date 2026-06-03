import asyncio
import os
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")

from app.routers import options  # noqa: E402
from app.services.rate_limit import RateLimiter  # noqa: E402


class _FakeRequest:
    def __init__(self, host="127.0.0.1"):
        self.client = SimpleNamespace(host=host)


def _leg(strike=100):
    return {"type": "call", "action": "buy", "strike": strike, "premium": 2, "quantity": 1, "lot_size": 1}


def test_payoff_rejects_unbounded_leg_count():
    with pytest.raises(ValidationError):
        options.PayoffRequest(
            legs=[_leg(index + 100) for index in range(9)],
            spot=100,
        )


def test_greeks_rejects_non_finite_or_zero_volatility():
    for iv in (float("nan"), 0):
        with pytest.raises(ValidationError):
            options.GreeksRequest(
                spot=100,
                strike=100,
                iv=iv,
                days_to_expiry=30,
                option_type="call",
            )


def test_options_payoff_rate_limit_blocks_before_calculation(monkeypatch):
    limiter = RateLimiter(max_calls=1, period=60)
    request = _FakeRequest(host="198.51.100.9")
    body = options.PayoffRequest(legs=[_leg()], spot=100)

    monkeypatch.setattr(options, "public_options_limiter", limiter)

    assert len(asyncio.run(options.calculate_payoff(request, body))["payoff"]) == 200
    with pytest.raises(HTTPException) as exc:
        asyncio.run(options.calculate_payoff(request, body))

    assert exc.value.status_code == 429
    assert exc.value.headers["Retry-After"]
