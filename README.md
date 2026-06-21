# AlphaVyuh

[![Live](https://img.shields.io/badge/live-alphavyuh.com-00D9A7)](https://alphavyuh.com)

Professional trading workflow software for Indian NSE/BSE traders. Scan → analyse → plan → journal → review.

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js + TypeScript + Tailwind CSS |
| Backend | FastAPI (Python 3.12) |
| Database | Supabase (PostgreSQL + Auth) |
| Charts | TradingView Lightweight Charts v5 |
| Data | NSE/BSE EOD market data pipeline, with live/delayed providers enabled only when licensed |
| Payments | Razorpay |

## Features

- **Scanner** — Stock screener with 35+ technical filters (EMA, RSI, ATR, volume, 52-week, gap, trend alignment). Save custom screens.
- **Watchlist** — Multiple watchlists, drag-to-reorder, and visible data provenance.
- **Charts** — Interactive candlestick charts with EMA 20/50/200, RSI, MACD, Bollinger Bands, VWAP, drawing tools, and EOD/provider data badges.
- **Dashboard** — Market breadth strip (A/D ratio, 52W highs/lows, % above EMA).
- **Journal** — Trade journal with auto-calculated P&L, risk, R-multiple, and performance stats.
- **AI Review** — AI-powered journal analysis for Pro plan users — identifies patterns across trades.
- **Broker Connect** — Zerodha Kite Connect integration for trade import and order placement.
- **PWA** — Installable progressive web app with offline fallback.
- **Auth** — Supabase Auth (email + Google OAuth), free/pro/elite plans.

## Project Structure

```
frontend/    Next.js app — all UI screens
backend/     FastAPI — all APIs, data ingestion, business logic
supabase/    SQL migrations — run in Supabase SQL editor in order 001 → 047
```

## Setup

### Prerequisites
- Bun (package manager)
- Python 3.11+
- Supabase project (free tier works for dev)

### 1. Database — run migrations
Go to Supabase SQL editor and run each file in `supabase/migrations/` in order: `001_users.sql` → latest.

### 2. Backend
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # fill in your values
uvicorn app.main:app --reload --port 8000
```

### 3. Seed data (required — scanner won't work without this)
```bash
cd backend
python scripts/backfill_bhavcopy.py
```
This downloads ~300 days of NSE Bhavcopy data and computes all indicators. Takes ~25 minutes. Safe to re-run.

### 4. Frontend
```bash
cd frontend
bun install
cp .env.local.example .env.local    # fill in your values
bun run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Environment Variables

### Backend (`backend/.env`)
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_JWT_SECRET=your-jwt-secret
FRONTEND_URL=http://localhost:3000
INGEST_SERVICE_KEY=generate-with-secrets.token_hex(32)
MARKET_DATA_PROVIDER=yahoo
```

For Zerodha-backed chart candles/quotes, set:

```
MARKET_DATA_PROVIDER=kite
KITE_API_KEY=your-kite-api-key
KITE_API_SECRET=your-kite-api-secret
KITE_ACCESS_TOKEN=your-daily-kite-access-token
```

The chart page uses TradingView Lightweight Charts at `/charts/[symbol]`.
Daily, weekly, and monthly candles come through `/api/v1/charts/{symbol}/candles-live`
when provider-data mode is enabled. Indicators are computed server-side with the existing
`backend/app/services/indicators.py` pandas/numpy library. Do not market these feeds as production realtime data until exchange/vendor licensing is signed.

Kite access tokens expire daily around 06:00 IST, so `KITE_ACCESS_TOKEN` must be
refreshed after login before using `MARKET_DATA_PROVIDER=kite`.

### Frontend (`frontend/.env.local`)
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## Phases

- ~~Phase 1 — Auth + User profiles + Subscriptions~~ ✓
- ~~Phase 2 — NSE Scanner + Watchlist + Bhavcopy pipeline~~ ✓
- ~~Phase 3 — Charts (Lightweight Charts v5, drawings, layouts)~~ ✓
- ~~Phase 4 — Broker connect (Zerodha Kite) + Trade journal~~ ✓
- Phase 5 — Trade review engine + Alerts + Mobile app
