# Analytics, authentication, and recovery verification — 2026-10-15

The public website now offers direct Free account creation, and the restored
Railway API passes health and invalid-token checks. The requested journal
analytics and forecast are implemented and tested. **Public email confirmation
and signed-in production access are not yet verified.** This is a recovery
record, not a claim that every feature is production-ready or bug-free.

## Implemented product behavior

| Area | Behavior |
| --- | --- |
| Trading edge | Percentage average gain/loss, batting average, expectancy, and contributing sample counts |
| Monthly tracker | Exit-month averages, win percentage, counts, largest gains/losses, separate winner/loser holding periods |
| Summary and distribution | Percentage payoff ratio, probability-adjusted ratio, cash profit factor, actual-return histogram and accessible counts table |
| Result-based forecast | Six editable inputs, fixed notional, expected cash/percentage returns, target profit, whole-trade count and outcome counts |
| Reinvestment | Separate compounding what-if; never silently changes the fixed-notional forecast |
| Public accounts | Create account links in desktop/mobile navigation, hero, Free pricing and final CTA; signup explains email confirmation; login preserves the destination |
| Landing presentation | Removed the four requested hero scope chips; simpler workspace eyebrow and signup helper text |
| Auth recovery | Safe parsing, invalid credentials vs provider outages, confirmation resend, preserved PKCE/destination cookies, validated public callbacks |
| Ingestion | Source-date checks, preserved company/ISIN metadata, complete vs partial receipts backed by stored rows, unavailable 52-week metrics without sufficient finite history |
| Scheduled digest | Canonical receipt table, configured-key guard, IST date and complete-session guard; no real digest email sent |
| Migration drift | Exact canonical identities against replacement project, including historical stubs; malformed/missing/duplicate history and deleted migrations fail closed |

The supplied 200,000 / 25% / 40% / 14% / 7% / 46% example produces 1,330
expected cash profit per trade, 2.66% position return, 0.665% portfolio return,
and **61 whole trades** for an 80,000 expected-profit target. The printed 60 is
approximate. Kelly is a theoretical risk calculation, not a recommended
portfolio allocation.

Missing returns, missing dates, breakevens and provider failures are distinct.
Future exit dates are excluded. Pagination checks reject incomplete or duplicate
history rather than corrupt totals. Cash drawdown uses a running peak; percentage
account drawdown and realized R remain unknown without equity/initial-risk data.
Forecast inputs survive both delayed successful and failed analytics requests.

## Verification and its limits

The repeatable local runner at source `12e4c06` recorded:

| Check | Result |
| --- | --- |
| ESLint | Pass; 0 errors, 14 existing warnings |
| Production Next build and separate TypeScript check | Pass |
| Frontend unit tests | 763 passed across 119 files |
| Backend tests | 509 passed, 1 skipped, 31 warnings |
| Journal/reliability/layout/workflow/signed-in browser suites | 78 passed |
| Auth/confirmation/callback/public browser suites | 39 passed |
| Disposable PostgreSQL 17 bootstrap, rollback and RLS fixtures | Pass |
| Root npm audit | Fail; four high package findings from unpatched braces advisory |
| Frontend npm audit | Fail; thirteen high package findings from the same advisory |
| Service-role architecture gate | Fail; 19 existing router findings, reproduced identically on main |
| Real hosted signup/API/market history | NOT_RUN in this local runner |

After the landing change at `80281b9`, lint, production build, TypeScript and all
763 frontend tests passed again; 17 layout tests and eight public release tests
passed. The changed hero assertion was reproduced failing before implementation.
Review then reproduced a receipt-producer mismatch: an active universe can
include symbols absent from a complete session file. Both ingestion paths now
use source symbol counts before numeric filtering, keeping incomplete rows
partial without repeatedly rejecting complete files. Four failing regressions
passed after the correction; the full backend suite at `0f1632f` passed **513
tests, one skip**, with the same 31 warnings. Source-session coverage is distinct
from overall market/history coverage.

The separate migration-gate harness passed 28 cases, including missing token,
expired token, missing marker, shuffled valid history, lost leading zeros,
duplicate history and deletion detection.

An earlier combined run exposed a stale landing-copy assertion (corrected) and
one chart-drawing placement failure. The full 78-case rerun passed, and five
additional focused placement repeats passed. The intermittent cause was not
isolated; these results are not a claim that timing failures cannot recur.

Provider/API responses are controlled in local browser tests. Mock first-run
signup → onboarding → starter watchlist verifies UI behavior, not Supabase
confirmation delivery. Synthetic analytics are explicitly labeled and remain
separate from live data. No broker orders or payment transactions were submitted.
This repository has no `make check`; its real npm, pytest, Playwright and
PostgreSQL commands are used.

## Review

The final structured review of `09f7258...0f1632f` returned no accepted/actionable
findings (confidence 0.90). Its accepted receipt-producer finding was reproduced
with failing tests, fixed in both ingestion paths, and covered by the full
513-test backend run. Earlier reviews covered the Auth/SDK/forecast work. Code
review was static; test execution and live checks are separate evidence.

## Live state and remaining work

- Vercel production deployment `dpl_9uoFd5HeWt4LbSeQixdtVgCsHjPd` is READY
  at source `80281b95452a0c606ccbba11f4cba1380bc62413` on both production
  domains; apex redirects to the canonical www origin. Public browser checks
  verified direct signup links, no Request access links, and removal of all
  four requested hero labels in the deployed DOM and screenshot. Production rejects
  a nonexistent account with sanitized 401 copy; protected backend routes reject
  missing/invalid tokens. The chart-share route returns a valid 1200×630 PNG.
- Railway deployment `a8865e2a-f7f9-487a-8f96-5ea8d7aeb7e1` succeeded from
  reviewed tracked source `0f1632fe6596cb514f6e203e17b5d5a2fd1fd948`. The
  service was restored on the owner-selected Free plan. It includes only $1 per
  month usage and may sleep/stop; health success does not establish always-on
  scheduler operation. Broker execution, checkout and supplemental yfinance
  refresh remain disabled.
- Replacement Supabase has 62 migration records and 34 RLS-enabled application
  tables. The October 15 Security Advisor check reported zero WARN/ERROR and ten intentional
  backend-only INFO notices. Earlier quota evidence was 27.4 MB / 500 MB.
- The October 15 count query returned zero Auth users, zero profiles, zero daily
  candles and 45 seeded reference symbols. No old users, trades or prices were
  recovered by creating the new project.
- Production Auth Site URL is `https://www.alphavyuh.com`, with narrowly scoped
  callback entries for production and reviewed preview origins. New server
  credentials are configured privately; the obsolete Railway local JWT secret
  was removed. Frontend production is forced to live data without mock fallback.
- Resend verified `auth.alphavyuh.com` after the three owner-approved DNS records.
  A fresh Supabase settings page still showed custom SMTP disabled. Its form is
  prepared but unsaved. The owner must create/save the send-only key, enter the
  SMTP password and submit it under the browser credential rule. Public
  confirmation email cannot be declared working until then.
- After SMTP is saved, verify a real owned email/password account through
  confirmation, login, onboarding, owned watchlist/journal operations, analytics
  and logout. Keep password creation and confirmation links out of chat.
- Scanner/chart history needs an appropriately licensed data source and bounded
  ingestion with measured storage/index growth. One session is insufficient for
  200-day/52-week factors or five-year charts; RS requires 253 sessions. Do not
  substitute synthetic data for missing live history.

GitHub CI is not green. The corrected migration check still needs a valid
Actions `SUPABASE_ACCESS_TOKEN`; connector sign-in does not create it. Existing
service-role and braces findings remain visible. The formal Codex Security scan
failed target resolution and did not produce a completed scan. Manual auth/RLS
review and ordinary code review are separate evidence.

See [recovery procedure](supabase-recovery.md), [dependency review](dependency-review.md),
[pstack-informed workflow](development-workflow.md), and
[portfolio narrative](engineering-portfolio.md).

## Agent summary

**Done:** journal review analytics/forecast, public creation UX, auth/data
hardening, replacement schema, API restoration, sender DNS verification and
regression coverage.

**Why:** a credible demonstration needs correct numbers, a clear first-run flow,
and observed backend behavior.

**Learned:** schema provisioning, successful builds and domain verification do
not establish email delivery, real authenticated writes or market-history
coverage.

**Improve next:** complete the prepared SMTP credential handoff and real account
smoke, restore licensed history within measured capacity, then address the
existing CI architecture/dependency findings before claiming launch readiness.
