# Supabase recovery and fresh-project bootstrap

The historical migration stream needs a dependency-aware bootstrap on a new
project. Plain filename-order replay fails at `039_journal_idea_context.sql`:
it alters `workflow_states`, which is created by the later timestamp migration
`20260505014955_workflow_state.sql`. No existing migration was rewritten.

Hosted PostgreSQL also rejected migration 041's cleanup of policies on `drawings`
after 037 had removed that table. The bootstrap runs that cleanup before 037,
while the legacy table still exists, and moves workflow creation ahead of 039.
It applies the actual
canonical SQL, verifies RLS with synthetic users, removes the test fixtures, and
records each original migration version/name/content in the same transaction.
A failure commits neither application schema nor migration history.

## Scope and prerequisites

- Target only a newly created project. The bootstrap rejects application objects
  in `public`, nonempty migration history, and existing Auth users.
- Supabase must already provide `auth.users`, `auth.uid()`, and the `anon`,
  `authenticated`, and `service_role` roles. It must use PostgreSQL 17.
- `pgcrypto` is installed in `extensions` if absent. Migration 040 needs
  `gen_random_bytes`; `gen_random_uuid` is built into PostgreSQL 17.
- No vector, cron, network, storage, or vault extension is required by the
  current application migrations.
- Automatic table grants may be ON or OFF. The final hardening migration makes
  required grants explicit. Automatic RLS ON is compatible with these migrations.
  The empty-project guard permits only Supabase's verified automatic-RLS setup
  function when attached to its enabled DDL trigger with a fixed search path;
  arbitrary application functions still cause refusal.
- Keep application traffic away until bootstrap, Auth, data, and signed-in smoke
  checks pass. An empty project does not restore the old project's users/data.

## Local verification

Install PostgreSQL 17 tools, Python 3, and ripgrep. No Docker or DB credentials are
needed for the disposable socket-only test cluster:

```bash
bash scripts/test-new-project-schema.sh
```

If the operating system's temporary-directory path is too long for a Unix socket,
set `TMPDIR` to an existing shorter scratch directory. The harness creates and
removes its own private directory beneath it.

The harness verifies:

1. Strict filename order reproduces the missing-workflow-table failure.
2. Exported, dependency-ordered SQL replays successfully with legacy table,
   sequence, and function defaults.
3. Connected bootstrap succeeds with automatic grants disabled.
4. Anonymous and two distinct authenticated users obey the real PostgreSQL RLS
   policies. Profile creation, own watchlist writes, and service writes work.
5. Anonymous email reads, forged AI reviews/referral rewards, cross-user
   watchlist writes, cross-parent scan matches, entitlement changes, forged
   broker lifecycle writes, and privileged credential RPC calls are denied.
6. An injected late SQL error rolls back every migration and every history row.
7. Re-running bootstrap against a populated schema or existing Auth users fails
   closed. Synthetic users and candles are never left behind.

The local Auth fixture implements the same `auth.uid()` contract verified on the
replacement hosted PostgreSQL 17 project: legacy `request.jwt.claim.sub` with a
fallback to `request.jwt.claims ->> 'sub'`. Tests set both claim formats. This is
a SQL/RLS regression, not a substitute for testing GoTrue email delivery,
PostgREST, or browser sessions.

## Review and apply the bootstrap

List the exact source files and SHA-256 hashes without a connection:

```bash
bash scripts/check-new-project-schema.sh --plan
```

Export the same guarded transaction for the Supabase SQL editor:

```bash
bash scripts/check-new-project-schema.sh --bootstrap-sql > new-project-bootstrap.sql
```

The export contains committed schema SQL and synthetic fixtures; it contains no
connection URL, API key, or password. Review the export and verify the selected
project before executing it as one complete SQL-editor submission. A partial
selection bypasses the intended transaction/guard sequence. Do not paste or
execute this bootstrap on the restricted old project.

Alternatively, use a securely configured libpq service/PGPASSFILE or explicitly
set `PGHOST`, `PGDATABASE`, `PGUSER`, and `PGPORT`, then run:

```bash
bash scripts/check-new-project-schema.sh --bootstrap-empty
bash scripts/check-new-project-schema.sh --verify
```

The script does not load `.env` files, request passwords, or print connection
strings. `--verify` uses a transaction and rolls back all synthetic data. The
bootstrap exports actual migration contents into the standard
`supabase_migrations.schema_migrations` history only after SQL and RLS checks
pass. This is an empty-database bootstrap, never an existing-database
`migration repair` operation.

After application, confirm the migration list matches the current `--plan`,
all 34 application tables enable RLS, and no synthetic Auth users remain. Run
Supabase Security Advisor and inspect function ACLs and schema-cache health.
Future migrations can use the ordinary CLI workflow; fresh projects still need
this bootstrap until historical dependency ordering is separately reconciled.

## Current migration inventory

There are 60 historical files plus two new append-only migrations, 62 in total.
The manifest preserves every file, including comment-only historical stubs.
There is no 042 migration; the numeric gap is not a missing schema operation.

| Versions | Objects or changes |
| --- | --- |
| 001–005 | Profiles/signup trigger, subscriptions, waitlist, stock universe, daily candles |
| 006–012 | Saved screens, watchlists/items, ingest log, chart layouts/drawings, journal |
| 013–019 | Candle FK, international reference seeds, community/referrals, pipeline, alerts, indicators/fundamentals |
| 020–024 | Idempotent duplicate pipeline/indicator changes, explicit no-ops 021/023, FK normalization |
| 025–029 | Order idempotency, encrypted broker credentials/audit/RPCs, account fields, SEPA columns, VCP RPC |
| 030–031 | Comment-only provenance stubs; executable VCP implementation remains 029 |
| 032–038 | Indicator backfill/RPC, RS rename, metadata, launch/feedback, chart workspace backfill, scan alerts |
| 039–041 | Idea context, digest preferences/tokens, provenance normalization |
| 043–047 | AI reviews, onboarding flag, digest logs/preferences, separate waitlist-emails table |
| 20260505014955 | Workflow state; moved immediately before 039 by the bootstrap manifest |
| 20260506130000 | EOD ingestion trust metadata |
| 20260509030000 | Scanner columns and weekly candles |
| 20260511193000 | Symbol aliases, adjusted-candle and coverage RPCs |
| 20260517123000 | Public intake and feedback RLS |
| 20260603130600 | Profile/entitlement writes restricted to backend |
| 20260603140700 | Market-data/log/function privileges |
| 20260603140800 | Scan-match ownership includes its parent alert |
| 20260603150900 | Payment activation/idempotency constraints and RPC |
| 20260605124635 | Reinforced profile, order-idempotency, and scan-match boundaries |
| 20260606120000 | Journal broker-import provenance |
| 20260618030712 | Symbol-alias public-read RLS |
| 20260619004532 | Broker lifecycle table and atomic order-intent uniqueness |
| 20260619120000 | Onboarding-dismissed flag |
| 20261013125347 | Fresh-project RLS/ACL hardening and explicit service-only RPC/lifecycle writes |
| 20261013181611 | Fixed search paths on four trigger functions |

Migration 032 backfills existing candles; 037 migrates chart drawings and drops
the old `drawings` table. Payment and order-intent migrations normalize or reject
inconsistent existing rows. These operations are harmless on an empty project,
but require separate data checks on an existing populated database. International
reference symbols are seeded by 014; no OHLCV history is fabricated by bootstrap.

## Final access model

| Class | Tables | Direct client access |
| --- | --- | --- |
| Public market reference (5) | stock_universe, daily_ohlcv, weekly_ohlcv, corporate_actions, symbol_aliases | Anonymous/authenticated SELECT; no client writes |
| Private operations (10) | ingest_runs, bhavcopy_ingestion_log, referral_rewards, waitlist_emails, broker_credentials, broker_credential_audit, order_idempotency, feedback_reports, invite_codes, waitlist | Service role only |
| Owner read-only (7) | users, subscriptions, journal_ai_reviews, digest_logs, email_unsubscribe_tokens, payment_logs, broker_orders | Authenticated SELECT with owner RLS; backend writes |
| Owner-managed workflow (12) | saved_screens, watchlists, watchlist_items, chart_layouts, trade_journal, shared_screens, screen_upvotes, price_alerts, chart_workspaces, scan_alerts, scan_alert_matches, workflow_states | Authenticated CRUD with existing ownership/parent checks; shared_screens also permits public reads |

All 34 tables enable RLS. No client role retains TRUNCATE privileges. Eight
sensitive definer RPCs (credential read/delete, RS update, symbol resolution,
adjusted candles, coverage, VCP lookback, payment activation) explicitly revoke
EXECUTE from PUBLIC/anon/authenticated and grant it to service_role. The signup
trigger has a fixed empty search path and creates profiles successfully in replay.

Manual review reproduced three direct-data exploits before hardening: anonymous
waitlist email reads, anonymous insertion of another user's AI review, and an
authenticated forged referral reward. Independent code review also identified
trusted broker-lifecycle writes and inherited function EXECUTE grants. These are
manual findings with runtime regressions; they are not a completed formal Codex
Security scan.

## Auth settings and cutover

### Verified replacement project (2026-10-13)

The owner created `yodgbbrughcolslrnvqe` in the selected organization. Its status
is `ACTIVE_HEALTHY`. All 62 canonical migration versions are recorded; all 34
public application tables enable RLS. Rollback-only ownership/privilege fixtures
left zero Auth users and zero daily candles. No historical accounts or trades
were recovered by creating this project.

The final Security Advisor result has zero warnings/errors and ten informational
`rls_enabled_no_policy` notices for intentionally backend-only tables. Those
tables deny direct client access; do not add permissive policies merely to clear
the notices. See the [advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

Auth's initial Site URL was `http://localhost:3000`, with no redirect allowlist.
The recovery Site URL was then pinned to the owned Vercel branch preview,
`https://frontend-git-fix-portfolio-reliability-prasanth-clouds-projects.vercel.app`,
with callback origin/path pinned in the allowlist, including a narrow `next`
query pattern. Exact deployment callbacks must be added when testing immutable
preview URLs. Avoid assigning production `PUBLIC_SITE_URL`, `LIVE_URL`, or
`NEXT_PUBLIC_SITE_URL` to previews: explicit configuration takes precedence over
the trusted per-preview-origin handling needed to keep PKCE cookies on one host.
Email signup/confirmation and secure email change are enabled;
anonymous sign-ins/manual identity linking are disabled. The hosted password
minimum was saved as eight to match application validation.

The dashboard's grace-period banner describes enforcement, not a current breach.
The Usage page showed AlphaVyuh at 27.4 MB against its 500 MB allowance, with all
displayed organization usage categories within quota for 29 Sep–29 Oct 2026.
Usage can lag; measure row/index growth and budget capacity before broad EOD
backfill. An empty healthy database does not establish capacity for multi-year,
full-universe history.

Configure hosted Auth separately; `supabase/config.toml` does not automatically
configure a newly created hosted project.

- Set Site URL to the reviewed deployment's exact origin. Production's current
  canonical origin is `https://www.alphavyuh.com`; a recovery preview should use
  its explicitly approved preview origin until production cutover.
- Allow the exact `/auth/callback` URL for the chosen origin. Add the apex
  production callback only if that origin remains supported. Avoid broad preview
  wildcards and keep local development redirects separate.
- Enable email/password signup and email confirmation; use minimum password
  length 8, double-confirm email changes, one-hour JWT expiry, refresh-token
  rotation, and the existing confirmation/recovery templates.
- Keep anonymous sign-ins and manual identity linking disabled.
- Configure custom SMTP and a verified sender before opening signup beyond the
  Supabase organization team. Default hosted SMTP only sends to team addresses;
  creating a healthy database alone does not make confirmation email work.
- Copy only the new project URL and publishable/anon key to frontend deployment
  settings. Keep the service/secret key server-only. Coordinate backend anon,
  service, and JWT configuration with frontend cutover. Never reuse the old
  project's JWT secret with a new signing-key project; omit local HS256 bypass
  unless the exact signing configuration was explicitly verified.
- Existing sessions and user IDs do not automatically transfer. Plan an
  approved user/data migration or an explicitly communicated account reset;
  never claim that a new empty project recovered old accounts.

Recheck signup → confirmation → login → authenticated backend access → logout,
invalid credentials, outage handling, and cross-user access after configuration.
Then ingest a bounded real EOD universe/history, inspect data-health/coverage,
check quota headroom, and verify chart/scanner provenance before presenting live
market capability. Keep broker execution and billing gates unchanged.

Sources: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security),
[automatic role privileges](https://supabase.com/docs/guides/troubleshooting/custom-role-inherits-privileges-that-were-not-explicitly-granted-ddaa1c),
[password Auth](https://supabase.com/docs/guides/auth/passwords),
[custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp), and
[production checklist](https://supabase.com/docs/guides/deployment/going-into-prod).
