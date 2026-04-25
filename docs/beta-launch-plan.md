# AlphaVyuh Beta Launch Plan

This is the practical path from local demo to paid beta without taking on live market-data risk too early.

## Positioning

AlphaVyuh is not launching as a TradingView clone. The first sellable product is a trading workflow system:

- Scan candidates.
- Move symbols into a decision queue.
- Read the chart.
- Plan entry, stop, and target.
- Journal the trade.
- Review mistakes and repeatable setups.

The promise is process quality, not guaranteed trade performance.

## Offer

### Free

- Limited scanner results.
- One watchlist.
- Basic chart indicators.
- Limited journal history.
- Purpose: acquisition and product education.

### Pro

- Price: `₹1,999/month`, `₹19,999/year`, `$29/month`, `$279/year`.
- Unlimited scanner/watchlist workflow.
- Advanced chart indicators.
- Full journal and AI review.
- Sector breadth and options tools.
- Purpose: serious retail traders.

### Elite

- Price: `₹4,999/month`, `₹49,999/year`, `$69/month`, `$699/year`.
- Team seats, API access, priority feed, custom alerts, exports, support.
- Purpose: coaches, small desks, and professional users.

## Data Strategy

### Phase 1: Demo And Closed Beta

- Frontend: `NEXT_PUBLIC_DATA_MODE=mock`.
- Backend: `MARKET_DATA_PROVIDER=mock`.
- Goal: stable demos, screenshots, onboarding, and workflow feedback.
- Do not market it as live market data.

### Phase 2: Internal Live Validation

- Frontend: `NEXT_PUBLIC_FORCE_LIVE_DATA=true`.
- Backend: `MARKET_DATA_PROVIDER=yahoo` or broker-specific provider.
- Goal: verify behavior with live-like movement.
- Yahoo is not production reliable; it can rate-limit.

### Phase 3: Paid Live Data

- Broker-connected data first where possible.
- Vendor platform data only after paid demand is proven.
- Do not redistribute exchange live data without approved contracts.

## Cost Plan

### Closed Beta

Expected monthly cost: `₹10,000-₹50,000`.

- Frontend/backend hosting: `₹5,000-₹25,000`.
- Supabase, email, logs, Sentry: `₹2,000-₹15,000`.
- Broker API testing: small fixed monthly cost where applicable.
- Payment gateway: transaction fees.

### Paid Beta

Expected monthly cost: `₹50,000-₹2,00,000`.

- Better database tier.
- Monitoring and backups.
- Support tooling.
- More frequent QA and release work.

### Live Market Production

Expected monthly cost: `₹1L-₹10L+`.

- Depends mainly on exchange/vendor data rights.
- Use this only after paid retention is proven.

## Go/No-Go Metrics

Move from demo beta to paid beta only if:

- 20-50 testers complete signup, scanner, watchlist, chart, journal, and review.
- At least 30 percent return three or more days in a week.
- At least 10 users say they would pay for Pro.
- No critical auth, payment, or data-integrity bugs remain.

Move from paid beta to live-data vendor negotiation only if:

- 100+ paying users or strong signed pilot commitments.
- Churn and support load are understood.
- Users specifically ask for live data enough to justify vendor spend.

## Release Checklist

- Run `docs/release-readiness.md`.
- Keep local demos in mock mode.
- Keep production `NEXT_PUBLIC_FORCE_LIVE_DATA=false` until the live provider is contracted and tested.
- Put clear data badges in the app for Demo, EOD, Fallback, Live beta, and Broker beta.
- Use Razorpay test mode until final pricing, GST/accounting, and refund terms are approved.

## Immediate Marketing Test

Create one 90-second demo video:

1. Scanner finds candidates.
2. One symbol moves to watchlist.
3. Chart opens with plan levels.
4. A simulated trade becomes a journal entry.
5. Journal review shows mistakes and rules.

Target first users:

- Active Indian swing traders.
- Trading coaches.
- Small paid communities.
- Users already journaling in spreadsheets.
