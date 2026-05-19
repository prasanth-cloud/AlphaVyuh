# AlphaVyuh Professional Access Growth Plan

This is the practical path from recovery mode to a paid production platform
without taking on live market-data, billing, or broker-execution risk too early.

## Positioning

AlphaVyuh is not launching as a TradingView clone. The first sellable product is
a focused EOD trading workflow system:

- Scan candidates.
- Move symbols into a decision queue.
- Read the chart.
- Plan entry, stop, and target.
- Capture completed trades through broker import or journal drafts.
- Review mistakes and repeatable setups.

The promise is process quality, data clarity, and repeatable review. AlphaVyuh
does not promise trade performance.

## Access Model

### Professional Access

- Access is approval-managed while product reliability and support load are
  monitored.
- Market data is latest available EOD unless a licensed live provider is clearly
  enabled.
- Broker connections support read-only checks and completed-trade import.
- Live broker order placement is not enabled.
- Journal capture remains available for planning and review even without a
  broker connection.

### Future Plans

Plans can be introduced once production data recovery, support operations,
billing, and commercial terms are stable.

Possible plan shape:

- Free: limited scanner results, one watchlist, basic chart indicators, limited
  journal history.
- Pro: higher scanner limits, more saved screens, larger watchlists, full
  journal history, broker import, and review workflows.
- Elite: team seats, exports, priority support, and advanced data operations
  after demand is proven.

Do not enable paid checkout until production Razorpay configuration, GST or tax
handling, refund/support terms, and account activation operations are approved.

## Data Strategy

### Phase 1: EOD Professional Access

- Frontend uses live backend data where available.
- Backend serves official/free-first EOD data from `daily_ohlcv`.
- Data badges should state source, latest date, and coverage.
- Do not market unavailable intraday or live data.

### Phase 2: Internal Live Validation

- Enable live or delayed provider paths only for internal validation or approved
  pilot accounts.
- Use clear provider labels and avoid implying exchange-approved redistribution
  before commercial terms exist.
- Yahoo-style fallback providers are validation aids, not production reliability
  promises.

### Phase 3: Licensed Production Data

- Broker-connected data can be evaluated where terms allow it.
- Exchange or vendor data contracts come after retention and willingness to pay
  are proven.
- Do not redistribute exchange live data without approved contracts.

## Cost Plan

### Professional Access

Expected monthly cost: `₹10,000-₹50,000`.

- Frontend/backend hosting: `₹5,000-₹25,000`.
- Supabase, email, logs, Sentry: `₹2,000-₹15,000`.
- Broker API read-only validation: small fixed monthly cost where applicable.
- Payment gateway costs only after checkout is approved.

### Paid Production

Expected monthly cost: `₹50,000-₹2,00,000`.

- Better database tier.
- Monitoring and backups.
- Support tooling.
- More frequent QA and release work.

### Licensed Live Market Production

Expected monthly cost: `₹1L-₹10L+`.

- Depends mainly on exchange/vendor data rights.
- Use this only after paid retention is proven.

## Go/No-Go Metrics

Move from Professional Access to paid plans only if:

- 20-50 approved traders complete signup, scanner, watchlist, chart, journal,
  and review.
- At least 30 percent return three or more days in a week.
- At least 10 users say they would pay for Pro.
- Production EOD data and backend health are stable.
- No critical auth, payment, or data-integrity bugs remain.

Move from paid plans to live-data vendor negotiation only if:

- 100+ paying users or strong signed pilot commitments.
- Churn and support load are understood.
- Users specifically ask for live data enough to justify vendor spend.

## Release Checklist

- Run `docs/release-readiness.md`.
- Run `npm run check:data-recovery`.
- Run `PUBLIC_SITE_URL=https://www.alphavyuh.com npm run check:public-posture`.
- Keep production `NEXT_PUBLIC_ENABLE_MOCK_FALLBACK=false`.
- Keep broker execution disabled unless explicitly approved and verified.
- Keep data badges clear for EOD, fallback, delayed, live, and broker-sourced
  states.
- Keep checkout disabled until billing operations are approved.

## Immediate Marketing Test

Create one 90-second product walkthrough:

1. Scanner finds candidates.
2. One symbol moves to watchlist.
3. Chart opens with plan levels.
4. A completed trade is captured through broker import or journal capture.
5. Journal review shows mistakes and rules.

Target first users:

- Active Indian swing traders.
- Trading coaches.
- Small paid communities.
- Users already journaling in spreadsheets.
