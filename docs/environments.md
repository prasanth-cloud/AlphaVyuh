# Environments

Three environments: **local**, **staging**, **production**.

```
supabase/migrations/NNN_description.sql
        │
        ├─ bun run db:reset          →  local   (supabase start)
        │
        ├─ bun run db:push:staging   →  staging  (alphavyuh-staging Supabase project)
        │
        └─ Supabase dashboard SQL Editor  →  production  (manual approval gate)
```

---

## Local

| Item | Value |
|---|---|
| Frontend | `http://localhost:3000` |
| Backend | `http://localhost:8000` |
| Supabase | Local stack via `supabase start` |

```bash
# Start everything
bun run db:start               # Supabase local stack on localhost:54321
bun run dev:frontend           # Next.js on localhost:3000
bun run dev:backend            # FastAPI on localhost:8000
```

Env vars: copy `frontend/.env.example` → `frontend/.env.local` and fill in local values.
`supabase start` prints the local URL, anon key, and service-role key.

Regenerate types after schema changes:
```bash
bun run db:types               # writes frontend/lib/supabase/types.ts
```

---

## Staging

| Item | Value |
|---|---|
| Supabase project | `alphavyuh-staging` (separate project — never touches prod data) |
| Vercel branch | `staging` → auto-deploys on push |
| Frontend URL | Vercel preview URL for the `staging` branch |
| Backend | Railway staging service (separate from prod) |

### Create the staging project (one-time setup)

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard)
2. Click **New project**
3. Set **Name** = `alphavyuh-staging`, same **Organization** as prod
4. Choose the same **Region** as production to keep latency consistent
5. Set a strong **Database Password** — copy it somewhere safe
6. Click **Create new project** — provisioning takes ~2 minutes
7. Once ready, go to **Settings → API**:
   - Copy **Project URL** → `STAGING_SUPABASE_URL`
   - Copy **anon / public** key → `STAGING_SUPABASE_ANON_KEY`
   - Copy **service_role** key → `STAGING_SUPABASE_SERVICE_ROLE_KEY`
8. Go to **Settings → Database → Connection string → URI**:
   - Copy the URI → `STAGING_SUPABASE_DB_URL`
   - It looks like: `postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres`
9. Add all four values to your local `.env.local` (repo root — gitignored)

### Push migrations to staging

```bash
# Pushes supabase/migrations/ to the staging project via the CLI.
# Reads STAGING_SUPABASE_DB_URL from .env.local automatically.
bun run db:push:staging
```

The script (`scripts/db-push-staging.sh`) masks the DB password in its output and
exits non-zero if `STAGING_SUPABASE_DB_URL` is not set.

### Verify after a migration push

1. Open Supabase dashboard → `alphavyuh-staging` → **Table Editor**
2. Confirm new tables appear
3. Open **Authentication → Policies** and verify RLS is enabled on each new table
4. For the credentials migration specifically:
   - `broker_credentials` should show no RLS policies (deny-all by design)
   - `broker_credential_audit` should show no RLS policies (deny-all by design)
   - Both tables should have RLS enabled (the green lock icon)

### Promotion: local → staging

```bash
# 1. Push your branch
git push origin feat/your-feature

# 2. Open PR targeting `staging` (not main)
gh pr create --base staging --title "feat: your feature"

# 3. Merge → Vercel auto-deploys staging frontend
# 4. Push DB migrations to staging:
bun run db:push:staging
```

---

## Production

| Item | Value |
|---|---|
| Supabase project | `alphavyuh` (production — guarded) |
| Vercel branch | `main` → auto-deploys |
| Frontend URL | `https://alphavyuh.com` |
| Backend URL | `https://alphavyuh-production.up.railway.app` |
| Backend deploy | Railway (auto-rebuild on push to `main`) |

### Promotion: staging → production

**Rule: nothing reaches production DB without first passing staging.**

```bash
# 1. Verify staging is working correctly (smoke test the feature)

# 2. Merge staging → main via PR
gh pr create --base main --title "feat: promote staging to prod"

# 3. Vercel auto-deploys frontend from main

# 4. Apply DB migration to production — MANUAL GATE:
#    Open Supabase dashboard → alphavyuh (prod) → SQL Editor
#    Paste contents of supabase/migrations/<NNN>_<description>.sql
#    Read through the SQL before clicking Run
```

### What is gated in production

| Action | How it's blocked |
|---|---|
| `bun run db:push --linked` | Listed in `.claude/settings.json` deny list |
| `vercel --prod` from CLI | Listed in `.claude/settings.json` deny list |
| `git push --force` to main | Listed in `.claude/settings.json` deny list |
| Broker key rotation script | Must run outside market hours (09:15–15:30 IST) with a DB backup — see `scripts/rotate_broker_key.py.TODO` |

### Never do in production
- Apply a migration that hasn't been tested on staging first
- Run `bun run db:push:staging` against the production DB URL
- Apply the broker credentials rotation script during market hours

---

## Key rotation (when needed)

See `scripts/rotate_broker_key.py.TODO` for the full spec. The short version:
1. Run the rotation script against **staging** first to verify it works
2. Run against production only during off-market hours with a DB backup taken within the hour
3. Do not swap `BROKER_CREDS_KEY` in Railway until the script reports 0 remaining `key_version = 1` rows

This is a **hard pre-production blocker** — see `docs/decisions/002-broker-credentials.md §Q3`.
