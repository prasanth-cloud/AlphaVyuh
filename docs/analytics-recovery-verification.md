# Analytics and recovery verification — 2026-10-13

AlphaVyuh now calculates the supplied trading-review concepts from eligible
closed journal records. A replacement Supabase schema is initialized. This is
implementation and recovery evidence, not a declaration that production is live.

## Delivered behavior

| Requested concept | Implemented behavior |
| --- | --- |
| Trading edge / triangle | Average percentage gain, average percentage loss, batting average, expectancy, and contributing sample sizes |
| Monthly tracker | Exit-month gain/loss averages, winning percentage, trade count, largest gain/loss, and separate winner/loser holding periods |
| Trading summary | Percentage payoff ratio, probability-adjusted win/loss ratio, cash profit factor, and explicit missing denominators |
| Distribution | Histogram of actual recorded percentage returns with gain/loss/breakeven/missing counts and accessible counts table |
| Result-based forecast | Six editable assumptions, fixed position notional, expected cash/percentage return, target profit, whole trade count, and expected win/loss counts |
| Turnover / reinvestment | Independent compounding calculator; does not silently compound the fixed-notional forecast |
| Authentication | Safe request parsing, provider-outage classification, confirmation resend, preserved destination/PKCE cookies, and public confirmation callbacks |

The supplied 200,000 / 25% / 40% / 14% / 7% / 46% scenario produces 1,330
expected cash profit per trade, 2.66% position return, 0.665% portfolio return,
and **61 whole trades** to reach 80,000 expected profit. The printed estimate
of 60 is approximate. Theoretical Kelly risk is disclosed separately and is
not a recommended portfolio allocation.

Unknown returns, missing dates, and unavailable history are distinct states.
Future exit dates are excluded. An edit that duplicates an ID across paginated
history causes a recoverable unavailable response instead of corrupted totals.
The recorded cash drawdown uses a running peak. Percentage account drawdown and
realized R remain unknown without an account baseline/immutable initial risk.

## Local verification

| Check | Result |
| --- | --- |
| Production Next build, including PWA and OG route | Passed; 59 prerendered routes |
| Separate TypeScript check | Passed |
| Frontend unit suite | 736 passed across 119 files |
| ESLint | 0 errors; 14 existing warnings |
| Backend suite | 474 passed; 1 skipped; 16 dependency/deprecation warnings |
| Journal, OG/auth reliability, layout, workflow, signed-in browser suites | 76 passed |
| Signup/confirmation and public release browser suites with mock authentication disabled | 13 passed |
| Compiled production-server OG/auth/public browser checks | 21 passed (additional production-mode run, overlaps the above cases) |
| Broker read-only contract | Passed; no broker orders submitted |
| CI action/runtime and production target contract checks | Passed |
| Disposable PostgreSQL 17 bootstrap/RLS harness | Passed, including rollback, replay guards, and two-user isolation |

Browser tests use controlled provider/API responses where needed. They do not
prove confirmation-email delivery or authenticated access to a deployed backend.
Mobile visual inspection verified the new metrics at a 390px viewport without
page overflow. Demo analytics are explicitly labeled as a separate 95-trade
synthetic example; the demo list's headline totals match its own three records.

This repository has no `make check` target. The checks above use its actual
npm, pytest, Playwright, and PostgreSQL verification commands.

## Hosted recovery evidence

- Owner-created project `yodgbbrughcolslrnvqe`: `ACTIVE_HEALTHY`, PostgreSQL 17.
- 62 canonical migration records and 34 public application tables, all RLS enabled.
- Synthetic ownership fixtures rolled back; zero Auth users/candles remained.
- Anonymous waitlist-email reads, client broker-order writes, and privileged
  credential RPC calls denied. Security Advisor: zero WARN/ERROR, ten INFO
  notices for intentional backend-only tables. [Advisor documentation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
- Email provider, signup, email confirmation, and secure email change enabled;
  anonymous sign-in/manual identity linking disabled. Minimum password length
  saved as eight to match application validation.
- Before cutover, exact deployment callback URLs and email delivery must be
  configured and tested. The organization Usage page showed 27.4 MB database
  size against a 500 MB allowance, with all displayed categories within quota.
  Its grace-period banner describes enforcement rather than a current breach.
  Measure capacity before broad EOD-history ingestion.
- Existing Railway service deployments are `REMOVED`; its public endpoint
  returns provider `Application not found`. Server credentials must be configured
  securely for the new project before an approved backend deployment.
- The preceding Vercel production build failed because the OG Edge Function
  exceeded its size limit. The patch moves the route to the supported Node
  runtime; hosted preview verification is recorded separately in the PR.

No old accounts, trades, or market history were recovered by initializing the
replacement project. No synthetic data is presented as live market history.

## Review and remaining release gates

Structured local review identified duplicate pagination and hidden excluded-history
coverage. Both were verified and fixed with failing-then-passing regressions.
A later review found a stale Next subtree in the root Bun lock; it was regenerated
from the npm lock, and both installers verified Next 16.3.8. The final rerun's
result was clean: `autoreview --mode local` returned zero accepted/actionable
findings after the fixes. The review inspected code; the verification runs above
were performed separately. The formal Codex Security scan
did not complete after a target-resolution error; manual auth/RLS review and
runtime tests are not a completed formal scan.

Dependency upgrades fix the reviewed Next/PostCSS/serializer/selector issues.
The npm audit still reports the unpatched braces advisory: four high root
findings and thirteen high frontend findings, all transitive paths from the
same advisory. See [dependency review](dependency-review.md). The existing audit
gate is preserved and may block CI; findings are not suppressed to obtain green.

Production merge/deploy, server credential entry, public SMTP configuration,
actual signup → email confirmation → login → authenticated API → logout, and
licensed EOD ingestion remain release gates. Broker execution and billing remain
disabled. See [recovery procedure](supabase-recovery.md) and
[portfolio narrative](engineering-portfolio.md).

## Agent summary

**Done:** implemented the requested journal review metrics and forecast, hardened
authentication/data boundaries, rebuilt the empty Supabase schema, and added
regression/visual verification.

**Why:** incorrect statistics, silent missing data, and broken confirmation flows
undermine trader trust and the value of an engineering demonstration.

**Learned:** the canonical migrations had two historical ordering dependencies;
healthy schema provisioning does not restore old users, email delivery, an API
deployment, or licensed market data.

**Improve next:** complete the hosted recovery gates, then measure large-history
latency and implement immutable initial-risk snapshots before claiming realized
R or full portfolio risk.
