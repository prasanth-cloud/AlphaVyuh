"""
Razorpay payment integration.
Flow:
  1. POST /api/v1/payments/create-order  → returns razorpay order_id
  2. Frontend opens Razorpay checkout
  3. POST /api/v1/payments/verify        → verifies signature, activates plan
  4. POST /api/v1/payments/webhook       → Razorpay webhook (optional server-side confirmation)
"""
import hashlib
import hmac
import logging
from datetime import datetime, timedelta, timezone

import razorpay
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from app.middleware.auth import get_current_user_id
from app.services.supabase import get_admin_client, settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/payments", tags=["payments"])

PLAN_PRICES = {
    # Indian Rupee (domestic + UPI/netbanking)
    ("pro",   "INR"): {"amount": 199900, "label": "AlphaVyuh Pro — ₹1,999/month",   "days": 30},
    ("elite", "INR"): {"amount": 499900, "label": "AlphaVyuh Elite — ₹4,999/month", "days": 30},
    # US Dollar (NRI + international — Razorpay int'l payments)
    # Using paise-equivalent "cents" (amount in smallest USD unit)
    ("pro",   "USD"): {"amount": 2900,   "label": "AlphaVyuh Pro — $29/month",      "days": 30},
    ("elite", "USD"): {"amount": 6900,   "label": "AlphaVyuh Elite — $69/month",    "days": 30},
}

SUPPORTED_CURRENCIES = {"INR", "USD"}


def _rzp_client():
    return razorpay.Client(
        auth=(settings.razorpay_key_id, settings.razorpay_key_secret)
    )


# ── Create Order ──────────────────────────────────────────────────────────────

class CreateOrderRequest(BaseModel):
    plan: str  # "pro" or "elite"
    currency: str = "INR"  # "INR" or "USD"


@router.post("/create-order")
async def create_order(
    body: CreateOrderRequest,
    user_id: str = Depends(get_current_user_id),
):
    currency = (body.currency or "INR").upper()
    if currency not in SUPPORTED_CURRENCIES:
        raise HTTPException(400, f"Unsupported currency: {currency}")

    key = (body.plan, currency)
    if key not in PLAN_PRICES:
        raise HTTPException(400, "Invalid plan")

    meta = PLAN_PRICES[key]
    try:
        client = _rzp_client()
        order = client.order.create({
            "amount": meta["amount"],
            "currency": currency,
            "receipt": f"{user_id[:8]}-{body.plan}-{currency}",
            "notes": {"user_id": user_id, "plan": body.plan, "currency": currency},
        })
        return {
            "order_id": order["id"],
            "amount": meta["amount"],
            "currency": currency,
            "plan": body.plan,
            "label": meta["label"],
        }
    except Exception as e:
        logger.error(f"Razorpay order create failed: {e}")
        raise HTTPException(500, "Payment gateway error")


@router.get("/plans")
async def list_plans(currency: str = "INR"):
    """Public plan prices for a given currency (INR or USD)."""
    c = (currency or "INR").upper()
    if c not in SUPPORTED_CURRENCIES:
        raise HTTPException(400, f"Unsupported currency: {c}")
    plans = []
    for plan_id in ("pro", "elite"):
        meta = PLAN_PRICES[(plan_id, c)]
        plans.append({
            "plan": plan_id,
            "currency": c,
            "amount": meta["amount"],
            "amount_display": meta["amount"] / 100,
            "label": meta["label"],
            "days": meta["days"],
        })
    return {"currency": c, "plans": plans}


# ── Verify Payment ────────────────────────────────────────────────────────────

class VerifyRequest(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str
    plan: str
    currency: str = "INR"


@router.post("/verify")
async def verify_payment(
    body: VerifyRequest,
    user_id: str = Depends(get_current_user_id),
):
    # Verify HMAC-SHA256 signature
    expected = hmac.new(
        settings.razorpay_key_secret.encode(),
        f"{body.razorpay_order_id}|{body.razorpay_payment_id}".encode(),
        hashlib.sha256,
    ).hexdigest()

    if expected != body.razorpay_signature:
        raise HTTPException(400, "Invalid payment signature")

    currency = (body.currency or "INR").upper()
    key = (body.plan, currency)
    if key not in PLAN_PRICES:
        raise HTTPException(400, "Invalid plan")

    # Activate plan for 30 days
    meta = PLAN_PRICES[key]
    expires_at = (datetime.now(timezone.utc) + timedelta(days=meta["days"])).isoformat()

    sb = get_admin_client()
    sb.table("users").update({
        "plan": body.plan,
        "plan_expires_at": expires_at,
        "billing_currency": currency,
    }).eq("id", user_id).execute()

    # Log the payment
    sb.table("payment_logs").insert({
        "user_id": user_id,
        "razorpay_order_id": body.razorpay_order_id,
        "razorpay_payment_id": body.razorpay_payment_id,
        "plan": body.plan,
        "amount": meta["amount"],
        "currency": currency,
        "status": "success",
    }).execute()

    logger.info(f"Payment verified: user={user_id} plan={body.plan} currency={currency}")
    return {"status": "success", "plan": body.plan, "expires_at": expires_at, "currency": currency}


# ── Webhook (server-side confirmation from Razorpay) ─────────────────────────

@router.post("/webhook")
async def razorpay_webhook(request: Request):
    body = await request.body()
    signature = request.headers.get("X-Razorpay-Signature", "")

    expected = hmac.new(
        settings.razorpay_webhook_secret.encode(),
        body,
        hashlib.sha256,
    ).hexdigest()

    if expected != signature:
        raise HTTPException(400, "Invalid webhook signature")

    payload = await request.json()
    event = payload.get("event", "")

    if event == "payment.captured":
        payment = payload["payload"]["payment"]["entity"]
        notes = payment.get("notes", {})
        user_id  = notes.get("user_id")
        plan     = notes.get("plan", "pro")
        currency = (notes.get("currency") or payment.get("currency") or "INR").upper()

        key = (plan, currency)
        if user_id and key in PLAN_PRICES:
            days = PLAN_PRICES[key]["days"]
            expires_at = (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()
            sb = get_admin_client()
            sb.table("users").update({
                "plan": plan,
                "plan_expires_at": expires_at,
                "billing_currency": currency,
            }).eq("id", user_id).execute()
            logger.info(f"Webhook: plan activated user={user_id} plan={plan} currency={currency}")

    return {"status": "ok"}


# ── Get plan status ───────────────────────────────────────────────────────────

@router.get("/status")
async def plan_status(user_id: str = Depends(get_current_user_id)):
    sb = get_admin_client()
    r = sb.table("users").select("plan, plan_expires_at").eq("id", user_id).single().execute()
    if not r.data:
        return {"plan": "free", "expires_at": None, "active": False}
    data = r.data
    plan = data.get("plan", "free")
    expires = data.get("plan_expires_at")
    active = False
    if plan != "free" and expires:
        active = datetime.fromisoformat(expires.replace("Z", "+00:00")) > datetime.now(timezone.utc)
        if not active:
            # Downgrade expired plan
            sb.table("users").update({"plan": "free"}).eq("id", user_id).execute()
            plan = "free"
    elif plan != "free":
        active = True  # no expiry = lifetime
    return {"plan": plan, "expires_at": expires, "active": active}
