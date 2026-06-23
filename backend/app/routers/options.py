"""
Options Strategy Builder — payoff diagrams + Black-Scholes Greeks.
No live options chain needed: user inputs strikes + premiums manually.
"""
from __future__ import annotations

import math
from typing import Literal

import numpy as np
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.services.rate_limit import client_rate_key, public_options_limiter

router = APIRouter(prefix="/api/v1/options", tags=["options"])


# ── Black-Scholes ─────────────────────────────────────────────────────────────

def _norm_cdf(x: float) -> float:
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2)))


def _bs_price(S: float, K: float, T: float, r: float, sigma: float, opt: str) -> float:
    """Black-Scholes option price. opt='C' or 'P'. Returns 0 if T<=0."""
    if T <= 0:
        return max(0.0, S - K) if opt == "C" else max(0.0, K - S)
    d1 = (math.log(S / K) + (r + 0.5 * sigma ** 2) * T) / (sigma * math.sqrt(T))
    d2 = d1 - sigma * math.sqrt(T)
    if opt == "C":
        return S * _norm_cdf(d1) - K * math.exp(-r * T) * _norm_cdf(d2)
    else:
        return K * math.exp(-r * T) * _norm_cdf(-d2) - S * _norm_cdf(-d1)


def _bs_greeks(S: float, K: float, T: float, r: float, sigma: float, opt: str) -> dict:
    if T <= 0:
        return {"delta": 0.0, "gamma": 0.0, "theta": 0.0, "vega": 0.0, "rho": 0.0}
    d1 = (math.log(S / K) + (r + 0.5 * sigma ** 2) * T) / (sigma * math.sqrt(T))
    d2 = d1 - sigma * math.sqrt(T)
    nd1 = _norm_cdf(d1)
    pdf_d1 = math.exp(-0.5 * d1 ** 2) / math.sqrt(2 * math.pi)

    delta = nd1 if opt == "C" else nd1 - 1.0
    gamma = pdf_d1 / (S * sigma * math.sqrt(T))
    vega  = S * pdf_d1 * math.sqrt(T) / 100          # per 1% IV change
    theta_raw = (
        - (S * pdf_d1 * sigma) / (2 * math.sqrt(T))
        - r * K * math.exp(-r * T) * (_norm_cdf(d2) if opt == "C" else _norm_cdf(-d2))
    )
    theta = theta_raw / 365                            # per calendar day

    if opt == "C":
        rho = K * T * math.exp(-r * T) * _norm_cdf(d2) / 100
    else:
        rho = -K * T * math.exp(-r * T) * _norm_cdf(-d2) / 100

    return {
        "delta": round(delta, 4),
        "gamma": round(gamma, 6),
        "theta": round(theta, 4),
        "vega":  round(vega, 4),
        "rho":   round(rho, 4),
    }


# ── Pydantic models ───────────────────────────────────────────────────────────

class OptionLeg(BaseModel):
    type:     Literal["call", "put"]
    action:   Literal["buy", "sell"]
    strike:   float = Field(gt=0, le=10_000_000, allow_inf_nan=False)
    premium:  float = Field(ge=0, le=1_000_000, allow_inf_nan=False)  # price paid/received per unit
    quantity: int = Field(default=1, ge=1, le=100)        # number of lots (positive)
    lot_size: int = Field(default=1, ge=1, le=10_000)        # NSE lot size for this symbol (default 1 for calcs)


class PayoffRequest(BaseModel):
    legs:          list[OptionLeg] = Field(min_length=1, max_length=8)
    spot:          float = Field(gt=0, le=10_000_000, allow_inf_nan=False)              # current underlying price
    iv:            float = Field(default=20.0, gt=0, le=500, allow_inf_nan=False)       # implied volatility % (for Greeks)
    days_to_expiry: int = Field(default=30, ge=0, le=3650)
    risk_free_rate: float = Field(default=6.5, ge=-20, le=100, allow_inf_nan=False)       # % per year
    price_range_pct: float = Field(default=20.0, ge=1, le=100, allow_inf_nan=False)     # ± % around spot to calculate payoff


class GreeksRequest(BaseModel):
    spot:          float = Field(gt=0, le=10_000_000, allow_inf_nan=False)
    strike:        float = Field(gt=0, le=10_000_000, allow_inf_nan=False)
    iv:            float = Field(gt=0, le=500, allow_inf_nan=False)      # %
    days_to_expiry: int = Field(ge=0, le=3650)
    option_type:   Literal["call", "put"]
    risk_free_rate: float = Field(default=6.5, ge=-20, le=100, allow_inf_nan=False)


# ── Presets ───────────────────────────────────────────────────────────────────

PRESETS = {
    "long_call": {
        "name": "Long Call",
        "description": "Bullish. Unlimited upside, limited downside to premium paid.",
        "legs_template": [{"type": "call", "action": "buy", "strike": 0, "premium": 0}],
    },
    "long_put": {
        "name": "Long Put",
        "description": "Bearish. Profits when underlying falls. Limited to premium paid.",
        "legs_template": [{"type": "put", "action": "buy", "strike": 0, "premium": 0}],
    },
    "covered_call": {
        "name": "Covered Call",
        "description": "Own the stock + sell a call. Caps upside, earns premium income.",
        "legs_template": [{"type": "call", "action": "sell", "strike": 0, "premium": 0}],
    },
    "bull_call_spread": {
        "name": "Bull Call Spread",
        "description": "Bullish with limited risk. Buy lower strike call, sell higher strike call.",
        "legs_template": [
            {"type": "call", "action": "buy",  "strike": 0, "premium": 0},
            {"type": "call", "action": "sell", "strike": 0, "premium": 0},
        ],
    },
    "bear_put_spread": {
        "name": "Bear Put Spread",
        "description": "Bearish with limited risk. Buy higher strike put, sell lower strike put.",
        "legs_template": [
            {"type": "put", "action": "buy",  "strike": 0, "premium": 0},
            {"type": "put", "action": "sell", "strike": 0, "premium": 0},
        ],
    },
    "straddle": {
        "name": "Long Straddle",
        "description": "Profits from big moves in either direction. Buy ATM call + put.",
        "legs_template": [
            {"type": "call", "action": "buy", "strike": 0, "premium": 0},
            {"type": "put",  "action": "buy", "strike": 0, "premium": 0},
        ],
    },
    "strangle": {
        "name": "Long Strangle",
        "description": "Cheaper than straddle. Buy OTM call + OTM put.",
        "legs_template": [
            {"type": "call", "action": "buy", "strike": 0, "premium": 0},
            {"type": "put",  "action": "buy", "strike": 0, "premium": 0},
        ],
    },
    "iron_condor": {
        "name": "Iron Condor",
        "description": "Range-bound. Sell OTM call spread + OTM put spread. Max profit in middle zone.",
        "legs_template": [
            {"type": "put",  "action": "buy",  "strike": 0, "premium": 0},
            {"type": "put",  "action": "sell", "strike": 0, "premium": 0},
            {"type": "call", "action": "sell", "strike": 0, "premium": 0},
            {"type": "call", "action": "buy",  "strike": 0, "premium": 0},
        ],
    },
}


# ── Endpoints ─────────────────────────────────────────────────────────────────

def _enforce_public_options_limit(request: Request, scope: str) -> None:
    key = client_rate_key(request, scope)
    if not public_options_limiter.is_allowed(key):
        retry_after = public_options_limiter.retry_after(key)
        raise HTTPException(
            status_code=429,
            detail=f"Too many options calculator requests - try again in {retry_after} seconds.",
            headers={"Retry-After": str(retry_after)},
        )


@router.get("/presets")
async def get_presets():
    return {"presets": PRESETS}


@router.post("/payoff")
async def calculate_payoff(request: Request, body: PayoffRequest):
    """
    Returns at-expiry P&L curve + combined Greeks at current spot.
    P&L is per-share (multiply by lot_size × quantity for actual ₹).
    """
    _enforce_public_options_limit(request, "options-payoff")

    spot    = body.spot
    pct     = body.price_range_pct / 100
    S_range = np.linspace(spot * (1 - pct), spot * (1 + pct), 200)

    # At-expiry payoff
    payoff_points = []
    for S in S_range:
        total_pnl = 0.0
        for leg in body.legs:
            sign = 1 if leg.action == "buy" else -1
            if leg.type == "call":
                intrinsic = max(0.0, float(S) - leg.strike)
            else:
                intrinsic = max(0.0, leg.strike - float(S))
            total_pnl += sign * (intrinsic - leg.premium) * leg.quantity * leg.lot_size
        payoff_points.append({"price": round(float(S), 2), "pnl": round(total_pnl, 2)})

    # Max profit / max loss (sampled)
    pnls = [p["pnl"] for p in payoff_points]
    max_profit = max(pnls) if pnls else None
    max_loss   = min(pnls) if pnls else None
    # Clip infinite-looking extremes to "unlimited"
    max_profit_str = "Unlimited" if max_profit and max_profit > spot * 5 else (
        f"₹{max_profit:,.0f}" if max_profit else None
    )
    max_loss_str = "Unlimited" if max_loss and max_loss < -spot * 5 else (
        f"₹{abs(max_loss):,.0f}" if max_loss else None
    )

    # Breakevens: sign changes
    breakevens = []
    for i in range(len(pnls) - 1):
        if pnls[i] * pnls[i + 1] <= 0:
            # Linear interpolation
            p1, p2 = payoff_points[i]["price"], payoff_points[i + 1]["price"]
            v1, v2 = pnls[i], pnls[i + 1]
            if v2 - v1 != 0:
                be = p1 + (0 - v1) * (p2 - p1) / (v2 - v1)
                breakevens.append(round(be, 2))

    # Combined Greeks at current spot
    T = body.days_to_expiry / 365
    r = body.risk_free_rate / 100
    sigma = body.iv / 100
    combined = {"delta": 0.0, "gamma": 0.0, "theta": 0.0, "vega": 0.0, "rho": 0.0}
    for leg in body.legs:
        sign = 1 if leg.action == "buy" else -1
        g = _bs_greeks(spot, leg.strike, T, r, sigma, leg.type[0].upper())
        mult = sign * leg.quantity * leg.lot_size
        for k in combined:
            combined[k] += g[k] * mult
    combined = {k: round(v, 4) for k, v in combined.items()}

    # Net premium
    net_premium = sum(
        (1 if l.action == "buy" else -1) * l.premium * l.quantity * l.lot_size
        for l in body.legs
    )

    return {
        "payoff":         payoff_points,
        "greeks":         combined,
        "max_profit_str": max_profit_str,
        "max_loss_str":   max_loss_str,
        "breakevens":     breakevens,
        "net_premium":    round(net_premium, 2),
    }


@router.post("/greeks")
async def calculate_greeks(request: Request, body: GreeksRequest):
    _enforce_public_options_limit(request, "options-greeks")
    T     = body.days_to_expiry / 365
    r     = body.risk_free_rate / 100
    sigma = body.iv / 100
    price = _bs_price(body.spot, body.strike, T, r, sigma, body.option_type[0].upper())
    greeks = _bs_greeks(body.spot, body.strike, T, r, sigma, body.option_type[0].upper())
    return {"price": round(price, 2), **greeks}
