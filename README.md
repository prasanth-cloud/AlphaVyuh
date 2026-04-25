# AlphaVyuh

Trading OS for Indian NSE/BSE swing traders. Scan → shortlist → chart → plan → journal → improve.

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 + TypeScript + Tailwind CSS |
| Backend | FastAPI (Python 3.12) |
| Database | Supabase (PostgreSQL + Auth) |
| Charts | TradingView Lightweight Charts v5 |
| Data | NSE Bhavcopy (EOD), auto-ingested daily at 4 PM IST |
| Payments | Razorpay (Phase 4) |

## Features

- **Scanner** — EOD stock screener for NSE equities with technical filters, SEPA/VCP presets, RS score, and saved screens.
- **Watchlist** — Multiple watchlists, drag-to-reorder, and quote surfaces with explicit data provenance.
- **Charts** — Interactive candlestick charts with indicator context. Advanced drawing tools are gated by ADR 009 and TradingView licensing confirmation.
- **Dashboard** — Market breadth strip (A/D ratio, 52W highs/lows, % above EMA).
- **Journal** — Trade notes, outcome review, and AI feedback that should cite the exact trades used.
- **Auth** — Supabase Auth (email + Google OAuth), free/pro plans.

## Project Structure

```
frontend/    Next.js 14 app — all UI screens
backend/     FastAPI — all APIs, data ingestion, business logic
supabase/    SQL migrations — run in Supabase SQL editor in order 001 → 011
```

## Setup

### Prerequisites
- Node.js 18+
- Python 3.11+
- Supabase project (free tier works for dev)

### 1. Database — run migrations
Go to Supabase SQL editor and run each file in `supabase/migrations/` in order: `001_users.sql` → `011_drawings.sql`

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
npm install
cp .env.local.example .env.local    # fill in your values
npm run dev
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
```

### Frontend (`frontend/.env.local`)
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## Phases

- Phase 1 — Auth + User profiles + Subscriptions
- Phase 2 — NSE Scanner + Watchlist + Bhavcopy pipeline
- Phase 3 — Charts (Lightweight Charts v5 now; TradingView Advanced Charts pending ADR 009 licensing)
- Phase 4 — Broker connect/import and trade journal, with broker execution marked beta until reconciliation is verified
- Phase 5 — AI MistakeEngine, timestamped alerts, and mobile app
