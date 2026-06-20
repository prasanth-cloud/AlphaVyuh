# Billing Rules

## Plan tiers
Three tiers: `free`, `pro`, `elite`. Stored in `users.plan` column.

## Pricing (amounts in smallest currency unit — paise for INR, cents for USD)
```python
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
```
Any change to prices requires updating `backend/app/routers/payments.py` AND `backend/tests/test_payments.py`.

## Payment flow (Razorpay)
1. Frontend: `POST /api/v1/payments/create-order` with `{ plan, currency, billing_period }`
2. Backend returns: `order_id`, `amount`, `currency`, `key_id`
3. Frontend opens Razorpay Checkout modal
4. On success, frontend: `POST /api/v1/payments/verify` with `{ razorpay_order_id, razorpay_payment_id, razorpay_signature, plan, currency, billing_period }`
5. Backend verifies HMAC signature → updates `users.plan`, `users.plan_expires_at`
6. Razorpay webhook (`/api/v1/payments/webhook`) is an optional server-side backup — configure in Razorpay dashboard

## Plan expiry
- `users.plan_expires_at` = `now() + days` (30 or 365)
- `GET /api/v1/payments/status` auto-downgrades to `free` if `plan_expires_at < now()`
- Downgrade is lazy (happens on status check) — there's no background job

## User billing preferences
- `users.billing_currency`: `INR` | `USD` (default `INR`)
- `users.billing_region`: `IN` | `NRI` | `US` | `INTL` (default `IN`)
- `users.billing_period`: `monthly` | `annual` (default `monthly`)
- Set on the frontend settings billing tab; persisted via `PATCH /api/v1/me`

## Plan limits (server-enforced)
| Feature | Free | Pro/Elite |
|---|---|---|
| Scanner results | 50 | 500 |
| Saved screens | 3 | unlimited |
| Watchlists | 1 | 10 |
| Watchlist items | 20 | 200 |
| Scan alerts | 2 | 20 |
| Journal history | 3 months | unlimited |
| Backtest | blocked | allowed |
| AI deep analysis | blocked | allowed |

## plan_cache
`services/rate_limit.py` exports `plan_cache` (TTL 60s). Use it on hot paths:
```python
plan = plan_cache.get(user_id)
if plan is None:
    plan = _get_user_plan(user_id)
    plan_cache.set(user_id, plan)
```
Invalidate after plan upgrade: `plan_cache.invalidate(user_id)`

## Never do
- Accept the plan name from the request body as proof of payment
- Activate a plan without HMAC signature verification
- Change pricing without updating the `test_payments.py` fixtures
- Forget to call `plan_cache.invalidate(user_id)` after upgrading a plan
- Add a new plan limit without enforcing it server-side (not just in the UI)
