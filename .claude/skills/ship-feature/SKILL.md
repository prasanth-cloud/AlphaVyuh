---
name: ship-feature
description: End-to-end workflow for implementing and shipping a new feature on AlphaVyuh
trigger: Use when you need to add a new feature from scratch (backend route + frontend page/component)
---

# Ship Feature

## When to use
You have a clearly scoped feature that needs a backend route, frontend page or component, and possibly a DB migration. Use this skill to ensure nothing is missed.

## Step 1 — Plan before touching code
1. Identify all files that will change (backend router, `main.py` registration, migration, `lib/api.ts`, frontend page/component)
2. Check plan-gating: does this feature need to be restricted by plan? If yes, add `_get_user_plan()` check
3. Check if a new DB table/column is needed → follow `.claude/rules/database.md`
4. Confirm the plan with the user before writing any code

## Step 2 — Backend first
1. Create/update `backend/app/routers/<resource>.py`
2. Use correct imports: `from app.middleware.auth import get_current_user_id` and `from app.services.supabase import get_admin_client`
3. Register router in `backend/app/main.py` if new
4. If plan-gated, call `_get_user_plan(user_id)` (use `plan_cache` on hot paths)
5. Run backend locally: `cd backend && .venv/bin/uvicorn app.main:app --reload`
6. Test the endpoint manually (curl or browser)

## Step 3 — Migration (if needed)
Follow `.claude/skills/add-migration/SKILL.md`

## Step 4 — Frontend
1. Add API function to `frontend/lib/api.ts` (never `fetch()` in a page)
2. Build the page/component with `"use client"` at the top
3. Use the color palette: `#1c1c1a`, `#5b63f5`, `#26a65b`, `#e5383b`, `#f2f2f0`
4. If plan-gated, show upgrade CTA when plan check fails — don't silently hide the feature
5. Run `cd frontend && npm run dev` and test in browser

## Step 5 — Tests
- If the feature touches billing logic → add/update `backend/tests/test_payments.py`
- If the feature touches scanner filters → add/update `backend/tests/test_scanner_filters.py`
- Run: `cd backend && .venv/bin/python -m pytest tests/ -v`

## Step 6 — Pre-ship checklist
- [ ] Backend router registered in `main.py`
- [ ] RLS enabled on any new tables
- [ ] Plan check added if feature is Pro/Elite only
- [ ] `lib/api.ts` function added
- [ ] No `fetch()` calls directly in page components
- [ ] All new env vars documented in `.env.example`
- [ ] Tests pass: `cd backend && .venv/bin/python -m pytest tests/ -v`
- [ ] Frontend builds: `cd frontend && npm run build`

## Rules to check
- `.claude/rules/architecture.md` — router pattern, FK hints
- `.claude/rules/security.md` — auth, entitlements
- `.claude/rules/billing.md` — plan limits
- `.claude/rules/database.md` — migration pattern, RLS
- `.claude/rules/frontend.md` — color palette, api.ts pattern
