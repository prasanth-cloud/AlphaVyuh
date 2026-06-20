# CLAUDE.md — alphavyuh

> This is the context file Claude Code reads on every session. Keep it tight. Anything long-form lives in `docs/` and is loaded on demand.

---

## 1. What alphavyuh is

alphavyuh is an end-to-end trading platform for Indian (NSE/BSE) retail traders. The user journey the product is built around:

1. **Market overview** — daily breadth, sector heatmap, index internals at a glance
2. **Scan** — run SEPA / VCP / custom scans across the NSE universe
3. **Watchlist** — save candidates, organize by setup type
4. **Chart & analyze** — full-featured charting with drawings, indicators, study notes
5. **Trade from the chart** — place orders directly on the chart; routes to the user's connected broker
6. **Auto-journal** — every executed trade is captured (entry, exit, size, R, setup tag, screenshot) with no manual entry
7. **AI feedback** — after N trades, the journal is analyzed for patterns (winning setups, leak-causing habits, sizing mistakes) and feedback is surfaced

The competitive frame is: **TradingView + Chartink + a broker terminal + a trading journal, fused into one workflow**. The product's edge is the closed loop from scan → trade → journal → feedback; each piece alone exists elsewhere, the loop doesn't.

**Primary user:** Indian swing trader running a Minervini SEPA / Qullamaggie VCP style playbook. Not day traders, not options scalpers.

**Strategic governing decision:** The AI-driven trade journal with closed-loop analysis is the primary product wedge. Scanner, broker integration, and community features are supporting infrastructure. See **ADR 013** (`docs/decisions/013-product-wedge.md`) before adding any feature not on the M4–M7 roadmap — it exists specifically to prevent scope drift.

---

## 2. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Next.js 14** (App Router) + TypeScript | |
| Styling | **Tailwind CSS** + shadcn/ui | No styled-components, no CSS modules. |
| Backend | **Supabase** (Postgres + Auth + RLS + Storage) | Single source of truth. No separate API server unless justified. |
| Charts | **TradingView Lightweight Charts** for MVP; plan to evaluate `klinecharts` for drawing tools | |
| Deploy | **Vercel** (auto-deploy from `main`) | |
| Payments | **Razorpay** (subscriptions) | |
| Package manager | **Bun** | Use `bun`, not `npm`/`pnpm`. `bun install`, `bun run dev`, `bun add <pkg>`. |
| Testing | **Playwright** (e2e) + **Vitest** (unit) | Every merged PR must have at least one Playwright spec for new user-facing flows. |

Broker integrations are **multi-broker from day one**: Zerodha Kite Connect, Upstox, Dhan. Architecture split (ADR 004): `frontend/lib/brokers/adapter.ts` is the canonical **TypeScript contract** (types-only, no implementation). All real broker logic lives in `backend/app/brokers/<broker>/` (Python/FastAPI). Never call a broker SDK from the frontend — only call the FastAPI `/api/brokers/*` routes. Never import from `backend/` in frontend code.

---

## 3. Repo layout

```
alphavyuh/
├── app/                      # Next.js App Router pages & routes
│   ├── (marketing)/          # Public landing, pricing, etc.
│   ├── (app)/                # Authenticated product
│   │   ├── market/           # Market overview
│   │   ├── scan/             # Scanners
│   │   ├── watchlist/
│   │   ├── chart/[symbol]/
│   │   ├── journal/
│   │   └── feedback/         # AI trade analysis
│   └── api/                  # Route handlers (prefer Supabase direct where possible)
├── components/               # Reusable UI (shadcn in components/ui/)
├── lib/
│   ├── supabase/             # Server & client factories, typed queries
│   ├── brokers/
│   │   └── adapter.ts        # CONTRACT ONLY — types, no implementation (ADR 004)
│   ├── scans/                # SEPA, VCP, custom scan engines
│   ├── indicators/           # EMA, RS, ATR, pivot logic
│   └── ai/                   # Journal analysis prompts & pipelines
├── backend/
│   └── app/
│       └── brokers/
│           ├── adapter.py    # Python ABC — mirrors adapter.ts (ADR 004)
│           ├── credentials.py# AES-256-GCM encrypt/decrypt (ADR 002)
│           ├── kite/         # KiteAdapter(BrokerAdapter) — Python
│           └── mock/         # MockAdapter for tests
├── supabase/
│   ├── migrations/           # Source of truth for schema. Never edit applied migrations.
│   └── seed.sql
├── tests/
│   ├── e2e/                  # Playwright
│   └── unit/                 # Vitest
├── docs/                     # Long-form docs, loaded on demand
│   ├── architecture.md
│   ├── data-model.md
│   ├── broker-adapter.md
│   ├── scan-dsl.md
│   └── decisions/            # ADRs — check before proposing architectural changes
└── .claude/                  # Subagents, hooks, settings (shared with team)
```

When in doubt about where something goes, **check this tree first**. Don't invent new top-level folders without asking.

---

## 4. How to run, test, verify (THE FEEDBACK LOOP)

This is the most important section. Claude Code's output quality roughly doubles when it can verify its own work. Always run the relevant command after a change.

```bash
# Dev
bun install
bun run dev                   # localhost:3000

# Lint & types — ALWAYS run before declaring done
bun run lint
bun run typecheck

# Unit tests
bun run test                  # Vitest, watch mode off in CI
bun run test <pattern>

# E2E — run the specific spec(s) touched, not the whole suite, unless finishing up
bun run e2e                   # all Playwright tests
bun run e2e tests/e2e/scan.spec.ts

# DB — local Supabase
bun run db:start              # starts local Supabase stack
bun run db:reset              # re-applies migrations + seed
bun run db:push               # push migrations to remote (staging only, never prod from laptop)
bun run db:types              # regenerate TS types from schema -> lib/supabase/types.ts

# Build (what Vercel runs)
bun run build
```

**Definition of done for any task:**
1. `bun run typecheck` passes
2. `bun run lint` passes (Prettier + ESLint run via PostToolUse hook)
3. Relevant unit tests pass
4. If user-facing: at least one Playwright spec exercises the new flow and passes
5. `bun run build` passes

If you cannot verify, say so explicitly. Do not claim completion.

---

## 5. Conventions & guardrails

### Code style
- **TypeScript strict mode.** No `any`, no `@ts-ignore`. If you need an escape hatch, use `unknown` + a narrowing check.
- **Server Components by default.** Mark `"use client"` only when the file genuinely needs it (event handlers, hooks, browser APIs).
- **No barrel files** (`index.ts` that re-exports). They hurt tree-shaking and break Next.js static analysis.
- **Imports:** absolute via `@/` (configured in `tsconfig.json`). Never deep relative like `../../../../lib/foo`.
- **Naming:** `PascalCase` for components, `camelCase` for functions/vars, `kebab-case` for file names except components (`ScanResultsTable.tsx`, `use-scan.ts`, `lib/brokers/kite-adapter.ts`).

### Supabase / data
- **Every table has RLS enabled.** No exceptions. A migration that adds a table without a corresponding policy migration is incomplete.
- **Use the typed client** from `lib/supabase/server.ts` or `lib/supabase/client.ts`. Never instantiate `createClient` ad-hoc in a route.
- **Migrations are append-only.** To change an applied migration, write a new one that alters/drops.
- **Regenerate types** (`bun run db:types`) after every migration. Commit the regenerated file.
- **Migration PR process (enforced by `check-migration-drift.yml`):** Any PR touching `supabase/migrations/` must include, in the PR description, terminal output proving the migration was applied to both staging and production. The sequence is always: staging first → verify → prod. Merging a migration PR without this output is a process violation. Add `<!-- migration-applied-to-prod -->` to the PR description to pass the drift check after applying.
- **Known gap:** The Stop hook checks for uncommitted code but does not check for unapplied migrations. The `check-migration-drift.yml` CI check is the compensating control. When working locally, run `supabase migration list --linked` before declaring a migration task done.
- **Stub files for prod-only migrations:** If a migration was applied directly to prod (e.g., via Supabase MCP during an emergency) without a local file, create a stub `.sql` file in `supabase/migrations/` with a `⚠️ STUB — DO NOT APPLY` header and no executable SQL. This closes the local ↔ prod count gap and prevents false drift alerts.

### Broker code
- Always go through `BrokerAdapter`. See `docs/broker-adapter.md` for the interface contract.
- Broker API keys live in Supabase `broker_credentials` table (encrypted), never in env vars, never logged.
- Every order placement path must be covered by a Playwright test against a mocked adapter.

### Secrets & env
- `.env.local` is gitignored. `.env.example` is the source of truth for which vars exist — keep it updated.
- Never paste real keys into chat, commits, or PR descriptions.

### Git & PRs
- Branch names: `feat/scanner-vcp`, `fix/kite-token-refresh`, `chore/bun-upgrade`.
- Commit style: conventional commits (`feat:`, `fix:`, `chore:`, `refactor:`, `test:`, `docs:`).
- One logical change per PR. If the PR description needs "also", split it.

### Next.js 14 dynamic API rule (prevents TraceSync errors)
`cookies()` and `headers()` from `next/headers` are **synchronous** in Next.js 14. Do **not** `await` them.
Awaiting a sync function crosses an async boundary that can drop the request-scoped `AsyncLocalStorage`
context, causing Next.js's internal trace system to throw `TraceSync` / "called outside request scope".

```ts
// ✅ correct (Next.js 14)
const cookieStore = cookies();
const headerStore = headers();

// ❌ wrong — triggers TraceSync
const cookieStore = await cookies();
const headerStore = await headers();
```

If we upgrade to Next.js 15, `cookies()` and `headers()` become async Promises — add `await` back then.

### Scanner filter conventions
- **Prefer filter composition over pre-built combinations.** If a requested filter is equivalent to composing 2–3 existing FREE/CHEAP filters, implement it as a preset that composes them in the UI — not as a new standalone `ScanFilters` field. Standalone multi-day filters carry EXPENSIVE latency costs that composition avoids. (ADR 006 §Decision 3)
- **Volume dry-up requires `vcp_contraction = true`.** The field exists only as a VCP composition rule. Reject it standalone with a validation error pointing to `volume_ratio_max`.
- Any new multi-day filter (lookback > 1 day) must clear the CTE routing rule: `candidates × lookback_days > POSTGREST_ROW_CAP(1000)` → mandatory CTE. See ADR 005.

### Things to never do
- Never install a new dependency without checking if shadcn/ui or an existing lib covers it
- Never add `localStorage` calls in Server Components (they'll crash the build silently in edge cases)
- Never write raw SQL in a route handler — put it in a migration or a typed Supabase query
- Never hardcode broker-specific logic outside `lib/brokers/`
- Never disable RLS to "make it work" — fix the policy instead
- Never `await cookies()` or `await headers()` — see Next.js 14 dynamic API rule above
- Never merge a PR that adds migration files without prod application evidence in the PR description — `check-migration-drift.yml` enforces this, but the human is the last gate
- Never apply migrations directly to prod without first applying to staging (staging is the canary; a bad migration there is recoverable, a bad migration on prod is not)
- Never edit an existing migration file — if you need to change something, write a new migration; the drift check will catch and block any modification to existing files

---

## 6. Workflow with Claude Code (how we use the tool)

This project is set up to take full advantage of Claude Code's workflow primitives. The conventions below are enforced by files in `.claude/`.

### Subagents (in `.claude/agents/`)
- **`code-simplifier`** — run after a feature is working to clean up duplication, extract helpers, remove dead code. Invoke with `/agents code-simplifier` or append *"then use the code-simplifier subagent"*.
- **`verify-app`** — runs typecheck + lint + unit + relevant Playwright specs and reports. Use at the end of any non-trivial task.
- **`reviewer`** — acts as a skeptical code reviewer. Prompt: *"use the reviewer subagent to grill me on these changes — don't let me open a PR until I pass"*.

### Hooks (in `.claude/hooks/`)
- **PostToolUse** → auto-runs Prettier + ESLint --fix on any file Claude edits. Catches the last 10% of formatting drift.
- **Stop** → runs typecheck before the agent can declare a task done.

### Permissions
Pre-allowed bash commands live in `.claude/settings.json` so you don't get prompted for routine things (`bun *`, `git status`, `supabase *`, etc.). Destructive commands (`rm -rf`, `git push --force`, `db:push` to prod) remain gated.

### MCP servers (in `.mcp.json`)
Checked into the repo so every machine picks them up:
- **Supabase** — query the DB, inspect schema, read logs
- **Vercel** — check deploys, read runtime logs
- **Notion** — for design docs & PRDs
- **GitHub** — PRs, issues, CI status

### Frontend work specifically
Use the **Claude Chrome extension** when iterating on UI. Open the page in Chrome, have Claude inspect the rendered DOM, screenshot, and iterate against what the user actually sees — not what the JSX *suggests* it looks like. This is the intended flow for anything under `app/(app)/` where visual polish matters.

### Prompting patterns that work well here
- *"Fix the failing CI"* → point Claude at the Actions logs via the GitHub MCP, let it iterate
- *"Prove to me this works"* → Claude writes a Playwright spec that would have caught the bug, runs it red, implements, runs it green
- *"Use subagents"* → appended to any large request where parallelism helps (e.g., migrating multiple routes)
- *"/btw"* → side-channel questions while a long task runs, doesn't interrupt the main agent
- *"Use git worktrees"* → `claude -w` for parallel work. Don't run two Claudes in the same working tree.

### Long-running tasks
For anything > ~20 minutes of agent work, use the Stop hook (already configured) or explicitly ask Claude to verify with a fresh subagent at the end. Don't trust a single long context to self-audit.

---

## 7. Where to look for more context

Claude should load these on demand rather than keeping them in the root context:

- `docs/architecture.md` — system diagram, request flow, deployment topology
- `docs/data-model.md` — Supabase schema, RLS policies, indexes
- `docs/broker-adapter.md` — the `BrokerAdapter` interface + per-broker quirks
- `docs/scan-dsl.md` — how scanners are defined & executed
- `docs/decisions/` — ADRs for architectural choices; **check here before proposing architectural changes**
- `supabase/migrations/` — ground truth for schema
- `.env.example` — required environment variables

If any of these go out of date, updating them is part of the task that broke them.

---

## 8. Current status (update this file when things change)

- **Phase:** Scaffolding → MVP
- **Live:** Landing page at alphavyuh.com
- **Next milestones:** (1) Auth + onboarding, (2) Kite adapter + paper-trading mode, (3) EOD scanner (Momentum preset live), (4) Chart with order placement UI
- **Staging:** `alphavyuh-staging` Supabase project live (`nltfedbnbbrclcufoaly`, `us-east-2`). Push migrations with `bun run db:push:staging`. See `docs/environments.md` for the full promotion flow.
- **Known gaps:**
  - **Schema provenance drift (001–031):** Prod was built through mixed paths (local files, Supabase MCP, and dashboard SQL), producing 26 timestamp-based migration history entries with no local file equivalents. On 2026-04-23: repaired history via `migration repair` (marked 001–031 applied, 26 timestamps reverted), then pushed 032 cleanly. Schema objects on prod are correct and functional. **Object equivalence between prod and what a fresh `supabase db reset` would produce has NOT been verified** — see `docs/decisions/010-schema-provenance-drift.md` for the full risk list (RLS policy names, trigger names, function signatures) and the `pg_dump` diff procedure. **Deadline: 2026-05-31**, or before any migration that alters objects from 001–031, whichever comes first.
  - **Sentry wired for both frontend and backend.** Frontend: `@sentry/nextjs` with source maps, `instrumentation.ts`, `global-error.tsx`. Backend: `sentry-sdk[fastapi]` auto-instruments request context. Set `SENTRY_DSN` on Railway and `NEXT_PUBLIC_SENTRY_DSN` + `SENTRY_AUTH_TOKEN` + `SENTRY_ORG` + `SENTRY_PROJECT` on Vercel to activate.
  - Broker adapter interface not finalized
  - **Email confirmation is OFF** in Supabase. Before enabling it (or adding magic links / OAuth), a `/auth/callback` Route Handler must be built to exchange the code for a session and set cookies. Without it, confirmation links will 404 and the user will not get a session.
  - **Broker credential key rotation is NOT implemented.** `scripts/rotate_broker_key.py.TODO` describes the spec. A rotation script and runbook MUST land before the first real broker credential is stored in production. This is a **hard blocker on exiting MVP** — see `docs/decisions/002-broker-credentials.md §Q3`.
  - **All-NSE VCP latency resolved.** `asyncio.gather` (concurrency cap 4) brought p95 from 5,327ms (marginal) to 3,059–3,655ms (+1,345–1,941ms headroom). See `docs/benchmarks/m3-production-env.md §8`.
  - **Fundamentals deferred to post-MVP.** PE and market cap refresh daily in bhavcopy; quarterly metrics (ROE, ROCE, PB, D/E) shown with "as of [date]". No external data source (FMP/XBRL) in M3. See ADR 006 §Decision 2.
  - **RS Score is alpha-version pending calibration.** (Field names: `rs_score_min/max` — not "RS Rating" to avoid IBD association.) Score distribution must be validated before public launch; see ADR 006 §Decision 5 for acceptance criteria.
  - **Historical volume_ratio, w52h_pct, w52l_pct are NULL for ~414k older rows** where the underlying `week_52_high`, `week_52_low`, `avg_volume_20d` columns were never populated by the ingest job. Migration 032 only backfills rows where those underlying columns exist. Scanner is unaffected (queries `latest_date` only, which is fully populated). Full historical backfill would require a separate migration to first populate the underlying columns across all rows. Not blocking for MVP.
  - **[M4 TODO] Verify Kite order webhook delivery mechanism.** ADR 011 assumes Kite delivers order status events via server-to-server webhook (POST to a FastAPI endpoint). Kite Connect may use postback URLs only (client-side redirect) rather than server-side webhooks. If postback-only, the order-events flow in ADR 011 needs rework before M4 implementation. Verify in Kite Connect docs / sandbox before building `broker_order_events` ingest.
  - **[M4 TODO] Verify Railway 15-min timeout applies to WS upgrades.** ADR 011 §Hard constraints notes this is empirical. During M4 integration testing, hold a WS connection open for 16+ minutes with no heartbeat and confirm whether Railway drops it. If WS connections are exempt from the HTTP idle timeout, the 25s heartbeat can be relaxed (but should remain for ALB resilience).
  - **[M4 TODO] Define Kite subscribe-error handling for persistent failures.** Current ADR 011 reconnect spec covers transient drops with exponential backoff. Persistent rejection (3 consecutive reconnect failures, or Kite returning an error code indicating invalid token / instrument not found) must surface a user-facing error message and stop retrying — not retry forever silently. Define the exact error codes and UI copy before M4 ships.
  - **`scripts/deploy-migration.sh` is ready.** Run `bash scripts/deploy-migration.sh staging` then `bash scripts/deploy-migration.sh prod`. One-shot connection test with specific error messages for auth failures, IP bans, and bad hostnames. No retries — prevents the ban-through-retry loop that hit migration 033.

---

*When this file gets longer than ~400 lines, split the least-referenced section into `docs/` and link it. CLAUDE.md should stay scannable.*
