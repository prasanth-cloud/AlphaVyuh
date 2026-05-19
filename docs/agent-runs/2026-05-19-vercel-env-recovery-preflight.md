# Vercel Env Recovery Preflight Agent Run

Date: 2026-05-19
Branch: `codex/recovery-vercel-env-preflight`

## Agents

| Agent | What changed | Why it improves the product | What was learned | Remaining risk |
| --- | --- | --- | --- | --- |
| Manager Agent | Kept the next slice focused on production data recovery evidence rather than broad UI churn. | Recovery work now tells operators whether the frontend env or backend host is the active no-data cause. | The visible no-data issue can be narrowed with one deterministic preflight instead of manual guessing. | Backend recovery still needs Railway credentials. |
| Backend Recovery Agent | Added a `Vercel production env` check to `npm run check:data-recovery`. | The preflight now verifies `NEXT_PUBLIC_API_URL`, data mode, and production mock-fallback posture without printing secret values. | Current production Vercel points at the Railway recovery URL, uses `live` data mode, and has mock fallback disabled. | Vercel env inspection requires an authenticated Vercel CLI; otherwise the check warns. |
| QA Agent | Added coverage for matching API URL, wrong API URL, and enabled mock fallback cases. | Future recovery evidence will catch frontend env drift before blaming Supabase or Railway incorrectly. | The checker can distinguish data-store health, frontend env health, and backend hosting health. | Browser verification still cannot prove real data until Railway `/health` is restored. |

## Validation

- `npm run test:data-recovery-check`
- `npm run lint`
- `npm run typecheck`
- `npm --prefix frontend run test -- --run`
- `npm audit --audit-level=moderate`
- `npm run test:public-posture-check`
- `npm run test:e2e:layout`
- `npm run test:e2e:mock`
- `npm run test:e2e:perf`
- `npm run check:data-recovery` (expected failure while Railway production API returns fallback `404 Application not found`)

## Current Recovery Evidence

- Vercel production env passes: frontend targets the Railway recovery API URL, data mode is `live`, and mock fallback is `false`.
- Supabase EOD data passes: latest `daily_ohlcv` date is `2026-05-18` with `3147/3447` symbols (`91%` coverage).
- Railway production API still fails: `/health` returns Railway fallback `404 Application not found`.
- GitHub recovery secrets remain missing: `RAILWAY_TOKEN`, `RAILWAY_PROJECT_ID`, `RAILWAY_SERVICE`.
- Local Railway CLI auth remains expired and requires `railway login`.
