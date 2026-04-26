# AlphaVyuh Customer Launch Runbook

This is the operating plan for moving from founder beta to a customer-facing paid launch.

## 1. Full QA Pass

Run before every release:

```bash
npm run launch:check
LIVE_URL=https://www.alphavyuh.com npm run launch:check
```

Manual browser pass:

| Area | Required result |
| --- | --- |
| Signup | New account creates profile, enters onboarding, no console errors. |
| Login/logout | Protected routes redirect when logged out; logged-in user reaches dashboard. |
| Dashboard | Market pulse, breadth, watchlist summary, and review prompts render. |
| Scanner | Run scan, expand row, add symbol to watchlist, open chart. |
| Watchlist | Add/remove/reorder symbols, starter queue works, best setup cards update. |
| Full chart | Opens from watchlist with `full=1`; ArrowUp/ArrowDown cycles that watchlist. |
| Alerts | Manual alert modal and one-click breakout/support alerts create records. |
| Order simulation | Buy/sell order creates a journal-ready trade without live broker risk. |
| Journal | Add trade, close trade, review lesson, analytics load. |
| Settings | Profile saves, billing state loads, founder code path works. |
| Billing | Test checkout opens only when Razorpay keys are configured. |
| Admin beta | Admin can view leads and create invite codes. |

No customer release if any P0/P1 issue remains in auth, payment, data visibility, or trade/journal integrity.

## 2. Production Data Readiness

Recommended path:

1. Keep beta in EOD/demo mode until the first 10-25 testers confirm the workflow is valuable.
2. Use Yahoo/broker data only for internal live validation; do not sell it as a guaranteed production feed.
3. For paid live-data launch, negotiate with Global Datafeeds first because their official API page confirms NSE stocks, NSE indices, NSE F&O, BSE, MCX, realtime, historical, snapshots, and option-chain API coverage. Pricing is sales-led, so get a written quote and redistribution terms before committing.
4. Keep TrueData as an alternate vendor to evaluate after receiving Global Datafeeds commercial terms.

Data requirements for launch:

- Indices: NIFTY, BANKNIFTY, India VIX.
- Equities: NSE cash universe with EOD candles and live/delayed quotes.
- Breadth: advances, declines, unchanged, 52-week highs/lows, EMA breadth.
- Sectors: top sectors, sector breadth, sector average move.
- Charts: daily/weekly/monthly candles first; intraday only after provider contract supports it.
- Alerts: price alerts reliable from the same provider used for chart quotes.

Go/no-go:

- Do not enable `NEXT_PUBLIC_FORCE_LIVE_DATA=true` for paid launch until provider credentials, legal terms, uptime, and failover behavior are tested.
- Keep visible data badges in the app.

## 3. Payment Readiness

Primary recommendation: Razorpay for India-first launch.

Why:

- Razorpay officially lists standard payment gateway pricing as `2% + GST` with no setup or annual maintenance charges for standard usage.
- The code already supports Razorpay order creation, signature verification, payment logs, plan activation, webhooks, founder codes, INR/USD, monthly/annual billing.
- The latest security hardening uses constant-time HMAC signature comparison.

Production checklist:

- Use `rzp_test_` keys for all internal QA.
- Switch to `rzp_live_` only after GST/accounting/refund policy is approved.
- Configure `RAZORPAY_WEBHOOK_SECRET`.
- Test `payment.captured` webhook in Razorpay dashboard.
- Test failed checkout, dismissed modal, invalid signature, expired plan, founder code.
- Keep founder plan as invite-only until manual support process is ready.

Stripe can remain future fallback for international expansion, but Stripe's published standard card pricing is higher for domestic cards in its global pricing model, and Billing adds separate volume-based pricing. Do not add Stripe until international sales justify it.

## 4. Security Pass

Automated:

```bash
npm run launch:check
npm --prefix frontend audit --audit-level=high
python3 -m pip_audit -r backend/requirements.txt
```

Manual:

- Confirm frontend env has no service-role key.
- Confirm Supabase RLS on user-owned tables: `users`, `watchlists`, `watchlist_items`, `saved_screens`, `chart_layouts`, `drawings`, `trade_journal`, `price_alerts`, `subscriptions`.
- Confirm public market data tables contain no user data if RLS is disabled.
- Confirm broker credentials stay backend-only and encrypted.
- Confirm auth middleware protects all `(app)` routes.
- Confirm API routes requiring user data call `get_current_user_id`.
- Confirm rate limits on expensive broker/scanner/order paths.
- Confirm security headers on live site.
- Confirm Sentry or equivalent error tracking is active before paid launch.

## 5. Beta Launch

Target: 10-25 serious traders.

Invite criteria:

- Active Indian equity/F&O trader.
- Already uses scanner/chart/journal tools.
- Will give direct feedback twice per week.
- Comfortable with beta caveats and data-source badge.

Beta cadence:

- Day 0: onboard personally on a 20-minute call.
- Day 1-3: watch if they complete scan -> watchlist -> chart -> journal.
- Day 4-7: collect friction and bug reports.
- Week 2: ask willingness to pay and missing must-have features.
- Week 3: convert strongest users to founder plan.

Success metrics:

- 70% complete onboarding.
- 50% create or use a watchlist.
- 40% open full chart from watchlist.
- 30% create a journal entry or simulated order.
- 10 users say they would pay for Pro.

## 6. Marketing And Distribution

Create three 60-90 second videos:

1. Scanner to watchlist:
   - Start with market pulse.
   - Run scanner.
   - Add top candidate to watchlist.
   - Show setup score.

2. Watchlist to full chart:
   - Open full chart.
   - Arrow through watchlist.
   - Show playbook score.
   - Add breakout/support alert.

3. Order to journal review:
   - Place simulated trade.
   - Show journal entry.
   - Close trade.
   - Run review and show lessons.

Distribution:

- Founder beta landing CTA.
- LinkedIn founder build updates.
- X/Twitter short clips.
- Telegram/WhatsApp trader communities where allowed.
- Direct outreach to trading coaches and small paid groups.

Do not market performance claims. Market process quality: fewer missed reviews, cleaner setup selection, and a connected workflow.

## Launch Decision

Launch paid beta only when:

- `npm run launch:check` passes.
- One complete manual QA pass is clean.
- Razorpay live/test mode is intentionally selected and documented.
- Data mode is intentionally selected and visible.
- At least 10 beta users have completed the workflow.
- Support channel and refund policy are ready.
