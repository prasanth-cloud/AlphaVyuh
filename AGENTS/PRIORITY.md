# Priority queue

## P0 — Blocking launch

1. **DEPLOY** — Fix Vercel build (production has been ERROR for 7+ commits)
2. **FEATURE** — Fix auth "Not authenticated" on scanner/watchlist/journal (BUG-001)
3. **FEATURE** — Fix dashboard primary button invisible text (BUG-002)
4. **DATA** — Add /api/v1/market/breadth/sectors endpoint (BUG-003, REQ-001)
5. **DATA** — Fix EMA 50 breadth showing 0% (BUG-004)

## P1 — Launch readiness

6. **FEATURE** — Build trade report upload (CSV from Zerodha/Upstox/Groww)
7. **FEATURE** — AI journal review with memory (analyzes past trades only — no future advice)
8. **FEATURE** — One-click order from scanner to broker (user-initiated, not suggested)
9. **FEATURE** — Enhanced breadth analytics dashboard
10. **DESIGN** — Apply landing page voice consistently to app pages

## P2 — Post-launch polish

11. **FEATURE** — User-controlled watchlist status labels (Watch/Ready/Tagged/Needs Review)
12. **FEATURE** — Onboarding flow for new users
13. **DEPLOY** — alphavyuh.com DNS + SSL verification
14. **QA** — Full Playwright test suite
15. **DEPLOY** — Sentry error monitoring

## Completed

(empty — this is session 1)
