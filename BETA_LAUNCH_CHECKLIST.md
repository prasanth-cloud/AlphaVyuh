# AlphaVyuh Private Beta Checklist

Use this before inviting each new batch of beta users. Private beta is allowed; public launch waits until market-data licensing, broker flow, and payment operations are stable.

## Positioning

- Landing page says private/founder beta, not full public launch.
- No fake user counts, reviews, SLA, or scan-speed claims.
- Market data copy clearly says EOD, delayed, fallback, or live beta as applicable.
- Terms and public policy pages include no-investment-advice and data-accuracy disclaimers.

## Data

- `/data` loads and shows latest freshness status.
- Dashboard shows an EOD or fallback provenance badge.
- Scanner presets return results or a clear no-match/error state with EOD source,
  coverage, and as-of metadata visible. Keep preset names in this checklist
  generic so old preset labels do not become release criteria.
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

- Zerodha connect page clearly says beta.
- Every live order path requires user verification before placing.
- Token expiry and reconnect states are visible.
- Broker failure falls back to simulated/manual journal flow without losing the setup context.

## Operations

- Backend focused tests pass.
- Frontend lint and production build pass.
- Railway/Vercel logs are checked after deploy.
- A feedback channel exists for each beta user.
- Beta batch size stays at 10-25 users until the above remains stable for one full trading week.
