# AlphaVyuh Customer Launch Runbook

This is the operating plan for moving from Professional Access to a customer-facing paid launch.

## 1. Full QA Pass

Run before every release:

```bash
npm run launch:check
LIVE_URL=https://www.alphavyuh.com npm run launch:check
npm run check:data-recovery
npm run check:production-api:railway
# After Railway recovery, with production smoke token and QA login:
RUN_PRODUCTION_RECOVERY_SMOKE=1 LIVE_URL=https://www.alphavyuh.com npm run launch:check
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
| Settings | Profile saves, billing state loads, Professional Access code path works. |
| Billing | Test checkout opens only when Razorpay keys are configured. |
| Admin access | Admin can view leads and create invite codes. |

No customer release if any P0/P1 issue remains in auth, payment, data visibility, or trade/journal integrity.

## 1.1 Broker Execution Gate

Do not run live or sandbox order submission as part of routine automated QA.
Broker execution validation requires real credentials and explicit account-owner
confirmation for the exact test order.

Record evidence with `docs/broker-validation-record.md`; mask tokens, account
identifiers, and private account data.

Read-only broker smoke first:

```bash
npm run broker:smoke
BROKER_SMOKE_TARGET=kite npm run broker:smoke
BROKER_SMOKE_TARGET=upstox npm run broker:smoke
```

If a daily token is missing or expired, generate the login URL and exchange the
returned token/code before rerunning the read-only smoke:

```bash
BROKER_SMOKE_TARGET=kite npm run broker:smoke -- --login-url
BROKER_SMOKE_TARGET=kite npm run broker:smoke -- --request-token <request_token>
BROKER_SMOKE_TARGET=upstox npm run broker:smoke -- --login-url
BROKER_SMOKE_TARGET=upstox npm run broker:smoke -- --code <authorization_code>
```

Required confirmation record before any live/sandbox order:

```text
Broker:
Mode: sandbox | live
Account owner:
Symbol:
Side: BUY | SELL
Quantity:
Order type: MARKET | LIMIT
Limit price, if applicable:
Expected risk plan: entry / stop / target
Expected journal source: chart | watchlist
Confirmed by:
Timestamp:
```

Execution checklist:

1. Connect the broker from `/settings/broker` and confirm token expiry copy is visible.
2. Create a valid plan in Watchlist Decision Desk or Full Chart.
3. Confirm `Ready` unlocks only after entry, stop, target, quantity, thesis, and invalidation are complete.
4. Confirm the order draft is disabled until the plan is valid.
5. Submit only after the explicit live/sandbox confirmation above.
6. Verify the broker returns an order id and AlphaVyuh records the broker name/order id where available.
7. Verify a journal draft is created or updated with setup, entry, stop, target, thesis, invalidation, source, and broker/order id.
8. Close the trade in Journal with a known exit price and verify P&L, lifecycle `Closed`, and review prompt.
9. Save the run evidence in the PR or launch issue using `docs/broker-validation-record.md`; mask tokens and account identifiers.

Failure rules:

- If broker profile/holdings/order-book reads fail, do not attempt order submission.
- If AlphaVyuh asks for live confirmation incorrectly, stop and file a P0.
- If broker response is ambiguous or times out, check broker order book before retrying; do not resubmit blindly.
- If journal/workflow sync fails after a broker order, stop launch until data integrity is fixed.

## 2. Production Data Readiness

Recommended path:

1. Keep Professional Access in EOD/demo mode until the first 10-25 traders confirm the workflow is valuable.
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

Railway backend recovery:

- Run `npm run check:data-recovery` before any customer-facing demo or launch.
- If Supabase EOD data is present but the Railway API returns fallback
  `404 Application not found`, recover the backend before inviting users.
- GitHub Actions recovery path:

```bash
export RAILWAY_TOKEN=...
export RAILWAY_PROJECT_ID=...
export RAILWAY_SERVICE=...
# Required for complete recovery evidence:
# export PRODUCTION_API_BEARER_TOKEN=...
# export PLAYWRIGHT_QA_EMAIL=...
# export PLAYWRIGHT_QA_PASSWORD=...
# export PRODUCTION_API_CHART_SYMBOLS=RELIANCE,ITC,AUBANK
npm run prepare:railway-recovery-secrets -- --apply --run-workflow
npm run check:data-recovery
```

- Local recovery path:

```bash
railway login
npm run recover:railway-backend
npm run check:data-recovery
```

- Single-command local recovery path:

```bash
npm run recover:railway-backend:login
```

This starts Railway browserless login when needed, waits for owner activation,
then runs backend recovery and `npm run check:data-recovery`.

Go/no-go:

- Do not enable `NEXT_PUBLIC_FORCE_LIVE_DATA=true` for paid launch until provider credentials, legal terms, uptime, and failover behavior are tested.
- Keep visible data badges in the app.
- No customer launch if the production backend is returning Railway fallback
  instead of the FastAPI health response.
- Do not treat public API-only recovery as full recovery. Full recovery requires
  authenticated scanner/watchlist API smoke and signed-in dashboard -> scanner
  -> watchlist -> full-chart browser evidence.

## 3. Payment Readiness

Primary recommendation: Razorpay for India-first launch.

Why:

- Razorpay officially lists standard payment gateway pricing as `2% + GST` with no setup or annual maintenance charges for standard usage.
- The code already supports Razorpay order creation, signature verification, payment logs, plan activation, webhooks, Professional Access codes, INR/USD, monthly/annual billing.
- The latest security hardening uses constant-time HMAC signature comparison.

Production checklist:

- Use `rzp_test_` keys for all internal QA.
- Switch to `rzp_live_` only after GST/accounting/refund policy is approved.
- Configure `RAZORPAY_WEBHOOK_SECRET`.
- Test `payment.captured` webhook in Razorpay dashboard.
- Test failed checkout, dismissed modal, invalid signature, expired plan, and Professional Access code.
- Keep Professional Access plan as approval-managed until manual support process is ready.

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

## 5. Professional Access Launch

Target: 10-25 serious traders.

Invite criteria:

- Active Indian equity/F&O trader.
- Already uses scanner/chart/journal tools.
- Will give direct feedback twice per week.
- Comfortable with EOD data policy and data-source badge.

Professional Access cadence:

- Day 0: onboard personally on a 20-minute call.
- Day 1-3: watch if they complete scan -> watchlist -> chart -> journal.
- Day 4-7: collect friction and bug reports.
- Week 2: ask willingness to pay and missing must-have features.
- Week 3: convert strongest users to a paid plan when billing is approved.

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

- Professional Access landing CTA.
- LinkedIn product build updates.
- X/Twitter short clips.
- Telegram/WhatsApp trader communities where allowed.
- Direct outreach to trading coaches and small paid groups.

Do not market performance claims. Market process quality: fewer missed reviews, cleaner setup selection, and a connected workflow.

## Launch Decision

Launch paid plans only when:

- `npm run launch:check` passes.
- `RUN_PRODUCTION_RECOVERY_SMOKE=1 LIVE_URL=https://www.alphavyuh.com npm run launch:check`
  passes after Railway recovery with authenticated scanner/watchlist and
  signed-in browser smoke evidence.
- One complete manual QA pass is clean.
- Razorpay live/test mode is intentionally selected and documented.
- Data mode is intentionally selected and visible.
- At least 10 Professional Access users have completed the workflow.
- Support channel and refund policy are ready.
