---
name: trace-billing-flow
description: Step-by-step trace of the billing flow for diagnosing payment or plan access issues
trigger: Use when a user reports they paid but plan didn't activate, or plan limits aren't working correctly
---

# Trace Billing Flow

## The full flow (in order)
```
Frontend settings page
  → POST /api/v1/payments/create-order { plan, currency, billing_period }
  → Backend creates Razorpay order → returns { order_id, amount, currency, key_id }
  → Frontend opens Razorpay Checkout modal
  → User pays → Razorpay returns { razorpay_order_id, razorpay_payment_id, razorpay_signature }
  → Frontend POST /api/v1/payments/verify { razorpay_order_id, razorpay_payment_id, razorpay_signature, plan, currency, billing_period }
  → Backend: HMAC-SHA256 verify → update users.plan + plan_expires_at + billing_currency + billing_period
  → plan_cache.invalidate(user_id)
  → Backend logs to payment_logs table
  → Frontend shows success state
```

## Diagnosing "paid but plan didn't upgrade"

**Step 1** — Did `/verify` get called?
Check browser Network tab for `POST /api/v1/payments/verify`. If missing → Razorpay Checkout callback didn't fire (usually means the modal was closed before completion).

**Step 2** — Did `/verify` return success?
If it returned 400 → signature verification failed. Check:
- `RAZORPAY_KEY_SECRET` on Railway matches the key in Razorpay dashboard
- The `order_id` and `payment_id` weren't modified by the frontend

**Step 3** — Check the database directly
On Supabase dashboard:
```sql
select id, plan, plan_expires_at, billing_currency, billing_period
from users
where id = '<user_id>';
```

**Step 4** — Check payment_logs
```sql
select * from payment_logs where user_id = '<user_id>' order by created_at desc limit 5;
```

**Step 5** — Is plan_cache stale?
The cache has 60s TTL. Wait 60s and try again. If still wrong, the DB wasn't updated.

## Diagnosing "plan shows active but features blocked"

**Step 1** — Check plan_expires_at
```sql
select plan, plan_expires_at, now() > plan_expires_at as expired from users where id = '<user_id>';
```
If `expired = true`, plan has lapsed. `GET /api/v1/payments/status` auto-downgrades on next call.

**Step 2** — Check which endpoint is blocking
Find the router file (e.g., `scanner.py`, `watchlist.py`) and look at the plan check. Confirm it's reading from `_get_user_plan()` and not a stale cached value.

**Step 3** — Check currency/billing_period
```sql
select billing_currency, billing_period, billing_region from users where id = '<user_id>';
```
If wrong → user may have had currency set to USD when paying with INR Razorpay key.

## Checking annual vs monthly
- Monthly: `plan_expires_at = now() + interval '30 days'`
- Annual: `plan_expires_at = now() + interval '365 days'`
- Verify the `billing_period` was passed correctly to `/create-order`

## Files to look at
- `backend/app/routers/payments.py` — create-order, verify, webhook
- `backend/tests/test_payments.py` — price table source of truth
- `backend/app/services/rate_limit.py` — plan_cache
- Supabase `users` table — plan, plan_expires_at, billing_*
