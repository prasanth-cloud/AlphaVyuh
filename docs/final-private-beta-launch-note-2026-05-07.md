# AlphaVyuh Private Beta Launch Note

Date: 2026-05-07
Status: ready for founder beta testing

## URLs

- Production: https://www.alphavyuh.com
- Beta guide: https://www.alphavyuh.com/beta
- Support: support@alphavyuh.com

## Who To Invite First

Start with 5-10 serious Indian swing traders who already use scanners,
watchlists, charts, or journals in their weekly process. Prioritize people who
will give direct feedback within 24 hours of testing.

Expand to 25-50 testers only after 3-5 days of stable usage with no P0/P1
workflow or data-trust issues.

## Tester Assignment

Ask each tester to complete this in one sitting:

1. Run one scanner preset after checking the EOD data badge.
2. Add at least 3 stocks to a watchlist.
3. Open the focused symbol in the full chart.
4. Draw one level or trendline.
5. Create a trade plan with entry, stop, target, thesis, and invalidation.
6. Save a simulated order draft or mock-import/log a trade.
7. Open Journal and review one trade or review prompt.
8. Submit feedback from the in-app Feedback button or email support.

## What To Watch

- Did the trader know what to do next on each screen?
- Did scanner -> watchlist -> chart -> journal feel connected?
- Did EOD/source/freshness labels make the data trustworthy enough for planning?
- Did the Decision Desk make invalid plans obvious before order drafting?
- Did Journal make the review loop useful enough to repeat?
- What would make this worth paying for?

## Bug Reporting

Preferred path:

- Use the in-app Feedback button.
- For workflow blockers or account issues, email support@alphavyuh.com.

Internal triage templates:

- `.github/ISSUE_TEMPLATE/beta_bug_report.yml`
- `.github/ISSUE_TEMPLATE/beta_feedback.yml`

Bug reports should include page URL, symbol/timeframe if relevant, expected
result, actual result, screenshot, browser/device, and whether the issue blocks
the workflow. Never include broker tokens, passwords, private account ids, or
portfolio-sensitive data.

## Known Limitations

- Private/founder beta only; this is not a broad public launch.
- AlphaVyuh is an educational workflow and journal tool, not investment advice.
- No trade calls, guaranteed accuracy, or promise of returns.
- Market data is EOD/free-first and should stay visibly labeled.
- Demo/fallback data must never be presented as live data.
- Broker workflows are read-only/import/journal-sync only.
- Live and sandbox broker order placement remain disabled.
- Production billing is disabled or waitlist-gated; no production Razorpay checkout.
- Production Supabase changes require reviewed migrations and explicit approval.
- Real Kite/Upstox smoke requires owner-provided tokens and must remain read-only.

## Data Operations

Use `docs/eod-refresh-operations.md` for the daily EOD refresh runbook,
verification checks, stale/degraded recovery, and source-label guardrails.

Before inviting testers on a new day, verify `/data` shows:

- latest EOD date
- source/provider
- coverage
- stale/degraded status
- fallback/demo status
- latest ingest status

## Go / No-Go

Go for founder beta if:

- production landing, beta guide, signup, login, and auth boundary are healthy
- local mock workflow passes scanner -> watchlist -> chart -> plan -> journal
- no console/page errors in core smoke tests
- no horizontal overflow in desktop/tablet/mobile layout checks
- no P0/P1 workflow, data-trust, security, billing, or broker-gating issue is open

No-go if:

- mock/demo/fallback data appears as live
- protected routes fail auth boundary checks
- order placement is not clearly disabled/gated
- journal draft/review handoff breaks
- production billing checkout can start unexpectedly
- EOD data is stale/degraded without clear UI messaging

## Current Recommendation

Proceed with a controlled 5-10 trader founder beta. Do not start another broad
polish loop. Fix only P0 broken flows, P1 trust/data issues, severe UI
regressions, or security issues while real-user feedback comes in.
