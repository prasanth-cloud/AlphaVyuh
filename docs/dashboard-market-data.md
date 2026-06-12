# Dashboard market data

How AlphaVyuh builds the signed-in **Market overview** dashboard from NSE EOD bhavcopy stored in Supabase `daily_ohlcv`.

## Sources

| Surface | Primary path | Fallback |
|--------|--------------|----------|
| Index tape (NIFTY, BANKNIFTY, SENSEX) | Next.js `/api/public/market-tape` (Yahoo) | Unavailable banner |
| Breadth, movers, sectors, EMA breadth | Railway `GET /api/v1/market/overview` | Vercel recovery (`frontend/lib/server/recovery-market-data.ts`) from `daily_ohlcv` |

Production must not silently use mock data (`NEXT_PUBLIC_ALLOW_MOCK_FALLBACK=false`).

## Universe

- **NSE EQ**, `stock_universe.is_active = true`
- One row per symbol on the latest **complete** trade date (quality checks reject flat/suspicious sessions)

## Metrics

### Regime strip

- **Regime** — derived from % of universe above EMA200 (Bullish ≥60%, Bearish ≤40%, else Neutral).
- **52W highs / lows** — count of symbols with `is_new_52w_high` / `is_new_52w_low`, or proximity to 52-week range when flags are missing.
- **Above EMA20 / 50 / 200** — % of symbols with valid EMA where `close > EMA`.

Advance/decline counts are still computed for the snapshot but are not shown on the regime strip.

### EMA breadth panel

- **Day / Week / Month / Year** — EMA breadth on the latest session vs sessions ~4 / 21 / 251 trading days ago.
- **Daily history table** — last 15 sessions: % above EMA20, EMA50, EMA200 per day (`ema_breadth_daily_history`).

### Highs vs lows

- **Daily** — new 52-week highs/lows on the latest session.
- **Weekly** — sum of daily highs/lows over the last five trading sessions.

### Major sectors

Each cell shows:

1. **Large %** — share of sector stocks that **advanced** vs prior close (session breadth).
2. **Second line** — average session % change for the sector.

Basis: `advancing_constituents` from the same EOD universe.

### Movers

Top gainers, losers, and most active from session `pct_change` and `volume_ratio` on the latest complete session.

## Snapshot build

After EOD ingest, `backend/app/services/market_breadth_snapshot.py` builds a precomputed payload and stores it under `ingest_runs` (`run_id` prefix `market-breadth-snapshot`). The overview API reads this snapshot for fast cold loads.

Rebuild manually:

```bash
cd backend && python scripts/backfill_market_breadth_snapshot.py
```

See also `docs/market-breadth-snapshot-ops.md`.

## Trust / unavailable states

If overview fetch fails or returns degraded data, panels show **temporarily unavailable** copy with a **Data Status** link — not neutral “no data” empty states.
