# AlphaVyuh Founder Beta Launch Operations

Date: 2026-05-07
Production URL: https://www.alphavyuh.com
Mode: private/founder beta

## Production Verification

- Production public/auth-boundary smoke on `https://www.alphavyuh.com` passed before this launch-ops pass: `frontend/tests/e2e/release-readiness.spec.ts`, 4 passed.
- Public copy verified on the landing page and beta guide:
  - Private/founder beta
  - EOD data
  - Broker import only / execution disabled
  - Not investment advice
  - Billing disabled / waitlist-gated
- Support/contact email verified: `support@alphavyuh.com`.

## Current Capabilities

- Landing, signup, login, reset password, privacy, terms, policies, contact, and beta guide are public.
- Authenticated workflow supports dashboard, scanner, watchlist, full chart, Decision Desk, simulated journal capture, broker import/read-only states, journal, settings/broker, and data status.
- EOD/free-first data is the launch posture. Demo/fallback/provider states must remain visibly labeled.
- Broker live/sandbox order placement remains disabled. Real trades should be placed directly with the broker and imported/logged in AlphaVyuh.
- Production billing remains disabled. Founder beta access is waitlist/invite-gated.

## Feedback Loop

- In-app feedback form: signed-in users can use the fixed `Feedback` widget. Categories: General feedback, Bug, Data issue, Feature request.
- Bug report path: email `support@alphavyuh.com` with registered email, page URL, symbol/timeframe if relevant, expected result, actual result, screenshot, and whether the issue blocks the workflow.
- GitHub intake templates for internal triage:
  - `.github/ISSUE_TEMPLATE/beta_bug_report.yml`
  - `.github/ISSUE_TEMPLATE/beta_feedback.yml`
- Public beta guide: `/beta`.
- Admin intake surface: `/admin/beta` for waitlist and feedback review.

## Trader Interview Questions

- Where did you hesitate or wonder what to do next?
- Did EOD/source/freshness labels make the data trustworthy enough for planning?
- Did scanner to watchlist to chart feel faster than your current workflow?
- What field in the Decision Desk felt missing, noisy, or unclear?
- Would the Journal review loop change your next trading session?
- What would block you from using AlphaVyuh twice a week during beta?

## Beta Onboarding Checklist

1. Run one scanner preset after reviewing the EOD data badge.
2. Add at least 3 stocks to a watchlist.
3. Open the focused watchlist symbol in the full chart.
4. Create a trade plan with entry, stop, target, thesis, and invalidation.
5. Save a simulated order draft or import a broker trade, then log/review it in Journal.

## Known Limitations

- No live or real-time market-data claim in beta; scanner and chart workflows are EOD/free-first unless explicitly labeled demo/provider.
- No investment advice, trade calls, guaranteed accuracy, or promise of returns.
- No live/sandbox broker order placement. Place real trades directly with your broker.
- Production Razorpay checkout is disabled. Founder access is invite/waitlist-gated.
- Broker read-only smoke requires owner-provided tokens and is not run automatically.
- Production Supabase changes require reviewed migrations and explicit approval.

## Owner-Gated Items

- Final support/legal/company copy if different from the current launch-safe copy.
- Real Kite/Upstox read-only smoke only with owner-provided tokens.
- Any sandbox/live broker order validation only with explicit account-owner confirmation.
- Production Supabase changes only through reviewed migrations.
- Production billing only after billing/legal/release-candidate approval.

## User Testing Instructions

Ask each founder beta trader to complete the onboarding checklist in one sitting, then answer the interview questions within 24 hours. Prioritize fixes that block trust, workflow continuity, or data clarity before adding new scanner/chart/broker features.

## EOD Operations

Daily refresh commands, verification steps, stale/degraded recovery, and beta data guardrails are maintained in `docs/eod-refresh-operations.md`.
