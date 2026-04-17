---
name: debug-production
description: Workflow for diagnosing production issues on AlphaVyuh (Railway backend + Vercel frontend)
trigger: Use when something is broken in production and you need to find the root cause
---

# Debug Production Issue

## Step 1 — Identify the failure surface
Ask: where is the error?
- **Frontend error overlay** (Next.js red box) → usually a JS runtime error, not a network issue
- **Network 4xx/5xx** in browser DevTools → backend returned an HTTP error
- **`TypeError: Failed to fetch`** → network-level failure: CORS, wrong URL, or unreachable server
- **Backend crash on startup** → check Railway logs immediately (likely an import error — see `community.py` known bug)
- **Blank page / silent failure** → check browser console for suppressed errors

## Step 2 — Check backend health
```bash
curl https://alphavyuh-production.up.railway.app/health
# Expected: {"status": "ok", "version": "0.3.0"}
```
If this fails → Railway backend is down or crashed. Check Railway dashboard logs.

## Step 3 — Check for import errors (most common crash)
Known broken import: `community.py` uses `app.dependencies` and `app.database` which don't exist. If the backend fails to start after a deploy that included `community.py`, that's the cause.

To check: look at Railway startup logs for `ImportError` or `ModuleNotFoundError`.

## Step 4 — Reproduce locally
```bash
# Backend
cd backend && .venv/bin/uvicorn app.main:app --reload

# Frontend
cd frontend && npm run dev
```
Reproduce the exact user action. Check terminal output for Python tracebacks.

## Step 5 — Trace the request

**For a backend 4xx/5xx:**
1. Find the route in `backend/app/routers/`
2. Check the auth dependency: `Depends(get_current_user_id)` — if token is missing/expired, returns 401
3. Check plan check: `_get_user_plan()` — returns 403 if plan insufficient
4. Look at the Supabase call — check for PGRST errors (especially PGRST201 = FK ambiguity)

**For a `TypeError: Failed to fetch`:**
1. Check `frontend/lib/api.ts` — is `NEXT_PUBLIC_API_URL` defined?
2. Check browser DevTools → Network tab → find the failed preflight
3. Check CORS: is the origin in `backend/app/main.py`'s `allow_origins`?
4. Wrap the call in try-catch if it's fire-and-forget (already done for `deleteDrawing`)

**For a PGRST201 error:**
Add the FK hint: `stock_universe!daily_ohlcv_symbol_fkey!inner(...)` — see `.claude/rules/database.md`

## Step 6 — Check AI / external service failures
- Anthropic out of credits → `BadRequestError` with "credit balance" → returns 503
- Razorpay signature mismatch → check the `RAZORPAY_KEY_SECRET` env var on Railway
- Zerodha token expired → user must re-authenticate daily

## Step 7 — Verify fix locally before deploying
- Run `cd backend && .venv/bin/pytest tests/ -v`
- Run `cd frontend && npm run build` (catches TypeScript errors)
- Test the exact failing scenario manually

## Common issues index
| Symptom | Likely cause |
|---|---|
| Backend won't start | `community.py` broken import |
| PGRST201 | Missing FK hint in join |
| 401 on all requests | JWT expired or `NEXT_PUBLIC_API_URL` wrong |
| 403 on Pro feature | Plan not upgraded or `plan_cache` stale |
| `TypeError: Failed to fetch` | CORS or unreachable backend |
| AI returns 503 | Anthropic credits exhausted |
| Zerodha import fails | Daily access token expired |
