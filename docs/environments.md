# Environments

Three environments: **local**, **staging**, **production**.

---

## Local

| Item | Value |
|---|---|
| Frontend URL | `http://localhost:3000` |
| Backend URL | `http://localhost:8000` |
| Supabase | Local stack via `bun run db:start` |

```bash
# Start everything
bun run db:start          # Supabase on localhost:54321
cd frontend && bun run dev    # Next.js on localhost:3000
cd backend && uvicorn app.main:app --reload --port 8000
```

Env vars: copy `.env.example` → `.env.local` and fill in local values (Supabase local keys are printed by `db:start`).

---

## Staging

| Item | Value |
|---|---|
| Supabase project | `alphavyuh-staging` (separate project, never touches prod data) |
| Vercel branch | `staging` → auto-deploys on push |
| Frontend URL | `https://staging.alphavyuh.com` (or Vercel preview URL) |
| Backend | Railway staging service (separate from prod) |

### Promotion: local → staging

```bash
# 1. Push your branch to GitHub
git push origin feat/your-feature

# 2. Open a PR targeting `staging` branch (not main)
gh pr create --base staging --title "..."

# 3. Merge → Vercel auto-deploys staging environment
# 4. Apply DB migrations to staging Supabase:
#    Supabase dashboard → alphavyuh-staging → SQL Editor → paste migration file
```

### Env vars for staging
Set in Vercel dashboard under the `staging` branch environment:
- `NEXT_PUBLIC_SUPABASE_URL` → staging project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` → staging anon key
- `SENTRY_DSN` → same DSN (Sentry uses `environment` tag to separate)
- All other vars → staging equivalents

---

## Production

| Item | Value |
|---|---|
| Supabase project | `alphavyuh` (prod, guarded — never push migrations from laptop) |
| Vercel branch | `main` → auto-deploys |
| Frontend URL | `https://alphavyuh.com` |
| Backend | Railway production service |

### Promotion: staging → production

```bash
# 1. Verify staging looks good
# 2. Open a PR from staging → main
gh pr create --base main --title "feat: promote staging to prod"

# 3. Merge → Vercel auto-deploys production

# 4. Apply DB migration to production Supabase:
#    ONLY via Supabase dashboard SQL Editor
#    NEVER via `bun run db:push --linked` from a laptop
#    Copy the tested migration SQL from supabase/migrations/<NNN>_*.sql
```

### Never do in production
- `bun run db:push --linked` — this command is blocked in `.claude/settings.json`
- `vercel --prod` from CLI — deployments go through `main` branch merge only
- Apply a migration that wasn't first verified on staging

---

## Migration flow summary

```
supabase/migrations/NNN_description.sql
        │
        ├─ bun run db:reset          (local — re-applies all migrations + seed)
        │
        ├─ Supabase dashboard SQL Editor (staging alphavyuh-staging project)
        │
        └─ Supabase dashboard SQL Editor (production alphavyuh project)
```

Types are regenerated locally after each migration:
```bash
bun run db:types   # writes lib/supabase/types.ts
git add lib/supabase/types.ts && git commit -m "chore: regenerate db types"
```
