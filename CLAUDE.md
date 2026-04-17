# AlphaVyuh — Developer Guide

## What this is
Trading OS SaaS for Indian stock traders. Replaces Chartink + TradingView + Screener.in + Kite + spreadsheet with one connected platform. All 4 phases are implemented and deployed.

**Workflow**: Scan → Watchlist → Chart → Order → Journal (auto-filled) → AI reviews mistakes

## Monorepo layout
```
alphavyuh/
├── frontend/          Next.js 14.2 App Router (Vercel)
├── backend/           FastAPI 0.115 / Python 3.12 (Railway)
├── supabase/          migrations/ (001–015), no ORM
└── .claude/           rules/, skills/, agents/
```

## Stack
| Layer | Tech |
|---|---|
| Frontend | Next.js 14.2, TypeScript 5, Tailwind 3.4, `"use client"` throughout |
| Backend | FastAPI 0.115, Uvicorn, Python 3.12 (`.venv` at `backend/.venv`) |
| Database | Supabase Postgres + RLS; 15 ordered migrations |
| Auth | Supabase JWT → validated by backend via `client.auth.get_user(token)` |
| Payments | Razorpay (INR + USD, monthly + annual) |
| AI | Anthropic `claude-sonnet-4-6` / `claude-haiku` via `anthropic==0.49.0` |
| Broker | Zerodha Kite Connect v3 + Upstox v2 |
| Charts | TradingView Lightweight Charts v4 |
| Indicators | Pure pandas/numpy — no TA-Lib |
| Scheduling | APScheduler: bhavcopy ingest at 16:00 IST daily |

## Commands

### Frontend
```bash
cd frontend
npm run dev          # localhost:3000
npm run build
npm run lint
```

### Backend
```bash
cd backend
.venv/bin/uvicorn app.main:app --reload --port 8000
.venv/bin/python -m pytest tests/ -v          # run all tests (38 tests, all pure logic)
.venv/bin/python -m pytest tests/test_payments.py -v
.venv/bin/pip install -r requirements.txt
.venv/bin/pip install pytest              # if pytest not installed in venv
```

### Data
```bash
cd backend
.venv/bin/python scripts/backfill_bhavcopy.py   # ~15-20 min, 300 days
.venv/bin/python scripts/populate_sectors.py
```

### Migrations
Apply via Supabase dashboard or CLI. Files are in `supabase/migrations/`, numbered `001`–`015`. Always add a new numbered file — never edit existing ones.

## Architecture invariants
1. **All plan checks are server-side** — `_get_user_plan(user_id)` called in every router. Never trust frontend plan state.
2. **Backend uses service-role key** — bypasses RLS for all backend reads/writes. This is intentional.
3. **JWT never stored on backend** — validated per-request via Supabase Auth API.
4. **`authHeaders()` is async** — token is module-cached in `frontend/lib/api.ts`; all fetch calls must `await authHeaders()`.
5. **PostgREST FK hint required** — joins on `stock_universe` must use `stock_universe!daily_ohlcv_symbol_fkey!inner(...)` or queries silently fail (PGRST201).
6. **Indicators are precomputed** — `daily_ohlcv` stores all indicator columns; charts router reads them directly. Never recompute inline.
7. **`plan_cache` has 60s TTL** — `services/rate_limit.py` caches plan lookups. Invalidate on plan change.
8. **Rate limits** — 30 scans/min, 5 AI calls/5min per user (in-memory, resets on restart).

## Pricing (source of truth)
| Plan | INR monthly | INR annual | USD monthly | USD annual |
|---|---|---|---|---|
| Pro | ₹1,999 | ₹19,999 | $29 | $279 |
| Elite | ₹4,999 | ₹49,999 | $69 | $699 |

Amounts in **paise/cents** in code. Razorpay HMAC-SHA256 over `order_id|payment_id`.

## Env vars
| File | Key vars |
|---|---|
| `frontend/.env.local` | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_API_URL` |
| `backend/.env` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `FRONTEND_URL`, `INGEST_SERVICE_KEY`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `ANTHROPIC_API_KEY`, `TELEGRAM_BOT_TOKEN` |

## Coding standards
- Color palette: `#1c1c1a` dark, `#5b63f5` indigo, `#26a65b` green, `#e5383b` red, `#f2f2f0` bg
- All API functions live in `frontend/lib/api.ts`
- Backend routes in `backend/app/routers/`
- New router → register in `backend/app/main.py`
- No trailing summaries in responses, no emojis unless asked

## Known issues (do not fix without approval)
- **BACKEND CRASH**: `backend/app/routers/community.py` is unconditionally imported in `main.py` line 10 (not guarded with try/except unlike payments/ai). It uses `app.dependencies` and `app.database` which do not exist. **The backend cannot start until this is fixed or the import is guarded.** Fix: change imports to `app.middleware.auth` + `app.services.supabase`, or wrap in try/except.
- `public/` directory is missing icon images (`icon-192.png`, `icon-512.png`) referenced by `manifest.json`.

## Deployment
- **Frontend**: Vercel — auto-deploys on push to `main` via `.github/workflows/deploy.yml`
- **Backend**: Railway — `uvicorn app.main:app --host 0.0.0.0 --port $PORT` (nixpacks)
- **Health**: `GET https://alphavyuh-production.up.railway.app/health`
- **Supabase project**: `fyxltykqdvacbdgmeucf`

## When to use agents / skills
- Planning a new feature → `.claude/agents/planner.md`
- Implementing an approved plan → `.claude/agents/implementer.md`
- Reviewing a diff → `.claude/agents/reviewer.md`
- Running validation → `.claude/agents/tester.md`
- Adding a DB migration → `.claude/skills/add-migration/SKILL.md`
- Debugging a production issue → `.claude/skills/debug-production/SKILL.md`
- Tracing a billing issue → `.claude/skills/trace-billing-flow/SKILL.md`
- Shipping a new feature end-to-end → `.claude/skills/ship-feature/SKILL.md`
