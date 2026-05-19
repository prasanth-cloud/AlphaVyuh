# AlphaVyuh Professional Access Checklist

Use this before inviting each new batch of approved Professional Access users. Full public paid launch waits until market-data licensing, broker execution, and payment operations are stable.

## Positioning

- Landing page says Professional Access, EOD market data, broker import, and journal capture.
- No fake user counts, reviews, SLA, or scan-speed claims.
- Market data copy clearly says EOD, delayed, fallback, or live as applicable.
- Terms and public policy pages include no-investment-advice and data-accuracy disclaimers.

## Data

- `/data` loads and shows latest freshness status.
- Dashboard shows an EOD or fallback provenance badge.
- Scanner returns results for Momentum, Breakout, Near 52W High, and 52W Highs.
- Charts show EOD/live-beta provenance before trade planning.
- Any Global Datafeeds/TrueData trial is kept behind beta wording until license terms allow customer display.

## Core Flow

- Signup and login work for a fresh user.
- Dashboard loads after login without a blank state or auth loop.
- Scanner result can be added to a watchlist.
- Watchlist can open a chart for the same symbol.
- Chart planning and simulated/manual journal logging work without a broker.
- Journal shows the trade source and allows review/notes.

## Broker Beta

- Zerodha connect page clearly says broker import and read-only sync unless execution is explicitly enabled.
- Every live order path requires user verification before placing.
- Token expiry and reconnect states are visible.
- Broker failure falls back to simulated/manual journal flow without losing the setup context.

## Operations

- Backend focused tests pass.
- Frontend lint and production build pass.
- Railway/Vercel logs are checked after deploy.
- A feedback channel exists for each approved user.
- Access batch size stays at 10-25 users until the above remains stable for one full trading week.
