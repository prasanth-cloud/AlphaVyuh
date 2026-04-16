# AlphaVyuh — The Trading OS for Indian Stock Traders
# CLAUDE.md — Product Specification & Build Guide

## Product Vision
One platform that replaces 4–5 fragmented tools (Chartink + TradingView + Screener.in + Kite + spreadsheet) with a connected end-to-end workflow — and adds an AI layer that tells traders exactly where they're losing money.

**Workflow**: Scan → Watchlist → Chart & analyse → Place order → Journal auto-fills → AI reviews mistakes

## Pitch Deck
Interactive investor pitch deck at `pitch/index.html` — open in browser. Covers problem, solution, market size, pricing, unit economics (interactive sliders), revenue projections, competitive landscape, build costs, moat, and the ask (₹1–2Cr pre-seed).

## Stack
- **Frontend**: Next.js 14 App Router, TypeScript, Tailwind CSS — deployed on Vercel
- **Backend**: FastAPI (Python), deployed on Railway
- **Database + Auth**: Supabase (Postgres + Row Level Security)
- **Payments**: Razorpay (₹1,999/mo Pro, ₹4,999/mo Elite)
- **Data**: NSE Bhavcopy (historical via backfill script), TrueData (live feed — Phase 2)
- **Charts**: TradingView Lightweight Charts v4
- **AI**: Claude API (claude-sonnet-4-6) for trade analysis / MistakeEngine

## Pricing Tiers
| Plan | Price | Limits |
|------|-------|--------|
| Free | ₹0 | Scanner: 5 saved screens, 50 results; 1 watchlist; basic charts (EMA/RSI only); 3-month journal history |
| Pro | ₹1,999/mo | Unlimited scanner + 500 results; unlimited watchlists; 100+ indicators; full charting; broker connect; auto-journal; AI mistake analysis; options strategy builder |
| Elite | ₹4,999/mo | 5 seats; API access; priority data feed; custom scan alerts; white-label journal exports; dedicated support |

## Phase 1 — Core MVP (COMPLETE)
- [x] Supabase auth (signup/login/session management)
- [x] NSE stock scanner (3,400+ stocks, 35+ filters)
- [x] Custom scan builder + saved screens
- [x] Watchlist (create, add/remove, drag-to-reorder)
- [x] TradingView Lightweight Charts (EMA 20/50/200, RSI, MACD, BB, VWAP)
- [x] Trade journal (manual entry, P&L tracking, stats)
- [x] Dashboard with market breadth
- [x] Deploy: Vercel (frontend) + Railway (backend) + Supabase

## Phase 2 — Full Platform (COMPLETE)
- [x] Razorpay subscription payments (Pro ₹1,999/mo + Elite ₹4,999/mo)
- [x] Plan-based access control (free limits on scanner/watchlist/charts/journal)
- [x] Billing/settings page with plan status and upgrade CTA
- [x] Additional chart indicators: Bollinger Bands, VWAP, Stochastic, ATR
- [x] Fundamentals panel on chart sidebar (P/E, EPS, market cap, growth via yfinance)
- [x] Sector breadth overlay on scanner/dashboard
- [x] Scan result alerts (save a scan, Telegram notification after market close)
- [x] AI trade journal analysis (Claude API — requires Anthropic credits)

## Phase 3 — Broker + Journal Intelligence (COMPLETE)
- [x] Options strategy builder with payoff diagrams + Greeks (Black-Scholes, pure Python)
- [x] Drawdown analysis in journal analytics (equity curve, max drawdown, recovery/profit factors)
- [x] Telegram scan alerts (notify users via bot after daily market close)
- [x] User profile settings (/settings/profile) — display name + Telegram Chat ID linking
- [ ] Zerodha Kite Connect v3 integration (click-to-order from chart) — NEXT
- [ ] Auto trade journal (import from Zerodha) — NEXT

## Phase 4 — AI + Growth (IN PROGRESS)
- [x] Mobile PWA: manifest.json, service worker, offline fallback page
- [x] Telegram alerts infrastructure (backend ready; set TELEGRAM_BOT_TOKEN on Railway)
- [ ] AI MistakeEngine: surfaces patterns from journal ("you lose 71% on gap-up buys after 2pm")
- [ ] Multi-broker support (Fyers, Upstox, Angel One)
- [ ] NRI / USD pricing tier
- [ ] US market stocks expansion

## Key Business Metrics
- Break-even: 22 Pro subscribers
- Month 6 target: 125 Pro + 10 Elite = ₹2.5L MRR
- Year 1 target: 250 Pro + 25 Elite = ₹60L ARR
- Year 3 target: 2,000 Pro + 200 Elite = ₹6Cr ARR

## Deployment URLs
- Frontend: https://frontend-nine-xi-14.vercel.app (alias: artha-cyan.vercel.app when domain is set)
- Backend API: https://alphavyuh-production.up.railway.app
- Supabase project: fyxltykqdvacbdgmeucf

## Pending env vars (set on Railway when ready)
- `TELEGRAM_BOT_TOKEN` — enables Telegram scan alert notifications

## Coding Standards
- All pages are `"use client"` Next.js components with Tailwind
- Color palette: `#1c1c1a` (dark text), `#5b63f5` (accent/indigo), `#26a65b` (green), `#e5383b` (red), `#f2f2f0` (bg)
- API auth: Supabase JWT → Railway FastAPI via `Authorization: Bearer <token>`
- All API functions live in `frontend/lib/api.ts`
- Backend routes in `backend/app/routers/`
- Keep responses terse — no trailing summaries, no emojis unless asked
