# Security Rules

## Auth model
- Supabase issues JWT on login; frontend caches it module-level in `lib/api.ts`
- Every backend request includes `Authorization: Bearer <token>`
- `app/middleware/auth.py` validates via `client.auth.get_user(token)` — live Supabase call
- Returns `user.id` (UUID) which is injected into routes via `Depends(get_current_user_id)`
- Never decode the JWT manually — always validate through Supabase Auth API

## Row Level Security
- All user-owned tables have RLS enabled and policies scoped to `auth.uid() = user_id`
- User-facing routers use `get_user_client(token)` which respects RLS via the user's JWT
- Service-role (`get_admin_client()`) is restricted to: ingest jobs, admin scripts, auth middleware, broker credential operations, and payment plan activation
- `get_current_user_token` dependency provides the raw JWT for creating user-scoped clients
- New tables must have RLS enabled before launch: `alter table ... enable row level security`
- Add both `select` and write policies explicitly — don't rely on "default deny"
- CI check (`scripts/check-service-role-usage.sh`) fails if new routers use `get_admin_client`

## Entitlements — never trust the frontend
- Plan checks happen exclusively on the backend in each router
- `_get_user_plan(user_id)` is the single source of truth
- Frontend can display the plan for UX but must never gate access itself
- `plan_cache` (60s TTL) is acceptable; a stale plan check is a minor issue, not a security hole
- After payment verification, call `plan_cache.invalidate(user_id)` so the next request sees the new plan

## Razorpay payment verification
The backend MUST verify the HMAC-SHA256 signature before activating any plan:
```python
body = f"{razorpay_order_id}|{razorpay_payment_id}"
expected = hmac.new(secret.encode(), body.encode(), hashlib.sha256).hexdigest()
assert hmac.compare_digest(received_signature, expected)
```
Never skip this check. Never activate a plan based on a frontend-provided plan name without server-side verification.

## Webhook security
Razorpay webhooks to `/api/v1/payments/webhook` are verified via `X-Razorpay-Signature` header. The webhook is an optional backup — the primary verification is the `/verify` endpoint hit by the frontend after Checkout.

## Ingest endpoint
`POST /api/v1/ingest/bhavcopy` requires `INGEST_SERVICE_KEY` header — not JWT. Keep this key secret and only use it from scheduled jobs or manual admin scripts.

## Never do
- Activate a plan without verifying Razorpay signature
- Trust `plan` value passed by the client in request body
- Expose `SUPABASE_SERVICE_ROLE_KEY` or `RAZORPAY_KEY_SECRET` to frontend
- Add a route that modifies another user's data without scoping by `user_id` from JWT
- Use `hmac.compare_digest` alternatives that are timing-attack vulnerable
- Skip RLS on new tables containing user data
