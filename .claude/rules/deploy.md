# Deploy Rules

## Frontend — Vercel
- Auto-deploys on push to `main` via `.github/workflows/deploy.yml`
- Steps: Node 20 → `npm ci` → `vercel build` → `vercel deploy --prod`
- Requires repo secrets: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`
- Production URL: `https://frontend-nine-xi-14.vercel.app`
- Env vars managed in Vercel dashboard (pull via `vercel env pull`)

## Backend — Railway
- Deploy: push to GitHub → Railway auto-rebuilds via nixpacks
- Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Health check: `GET /health` (must return 200 within 30s)
- Restart policy: `on_failure`
- Runtime: Python 3.12 (set in `backend/.python-version`)
- Production URL: `https://alphavyuh-production.up.railway.app`

## Backend env vars (set on Railway dashboard)
Required:
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`
- `FRONTEND_URL` (set to Vercel production URL for CORS)
- `INGEST_SERVICE_KEY`
- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`
- `ANTHROPIC_API_KEY`

Optional (features disabled if missing):
- `TELEGRAM_BOT_TOKEN` — scan alert notifications

## CORS config
`app/main.py` allows:
- `http://localhost:3000`, `http://localhost:3001`
- `settings.frontend_url` (Railway env var)
- `https://alphavyuh.vercel.app`, `https://alphavyuh.in`, `*.vercel.app`

If you deploy the frontend to a new domain, add it to the origins list in `main.py`.

## Dependency changes
After adding to `requirements.txt`, Railway rebuilds automatically. To test locally:
```bash
cd backend && .venv/bin/pip install -r requirements.txt
```

## Database migrations
- Apply via Supabase dashboard: Settings → SQL Editor → paste migration file
- There is no automated migration runner — migrations are applied manually
- Always test migrations on a branch/dev project before applying to production

## Never do
- Push directly to `main` without testing the build locally first
- Change `FRONTEND_URL` on Railway without also updating CORS origins in `main.py`
- Deploy while `community.py` has broken imports — it is imported unconditionally in `main.py` and will crash Railway on startup (see CLAUDE.md known issues)
- Run `vercel deploy` without pulling latest env vars first
- Remove the `/health` endpoint — Railway uses it as a health check
