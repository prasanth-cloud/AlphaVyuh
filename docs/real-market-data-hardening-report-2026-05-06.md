# Real Market Data Hardening Report — 2026-05-06

## Product Improvements

- Added canonical source metadata for dashboard, scanner, watchlist, chart candles, and data-health responses.
- Made mock/local data visibly `Demo` instead of ambiguous `Fallback`.
- Added scanner source, coverage, universe size, and EOD/fallback metadata to the result header.
- Added chart candle source metadata so full chart and inline chart can show symbol/timeframe/as-of trust consistently.
- Made Settings/Broker copy avoid token-like UI labels unless it is a state, not a secret.

## EOD Foundation

- Added additive bhavcopy ingest metadata migration:
  - source URL/name
  - expected rows
  - coverage %
  - partial ingest flag
  - warning message
  - attempt count
  - completed timestamp
- Hardened bhavcopy ingest for weekend skips, holiday/unpublished archive detection, retry-safe upserts, and partial-ingest detection.
- Updated `data_health` to expose last successful EOD date, latest bhavcopy run, fallback state, provider metadata, and next refresh guidance.

## Performance Evidence

Measured locally in mock mode with Playwright.

| Flow | After PR #59 | This PR |
| --- | ---: | ---: |
| Login -> dashboard usable | 735 ms | 326 ms |
| Dashboard route load | 570 ms | 120 ms |
| Scanner first usable | 590 ms | 126 ms |
| Scanner run/render | 71 ms | 82 ms |
| Watchlist focus + chart render | 700 ms | 346 ms |
| Full chart load | 666 ms | 924 ms |
| Journal load | 571 ms | 98 ms |

The full chart number varied upward in this run because the route compiled/rendered after source changes in dev mode. It still rendered a nonblank chart with no console/page errors.

## Security Findings

- `npm audit --audit-level=moderate`: 0 vulnerabilities.
- Backend dependency audit: no known vulnerabilities found.
- Secret/token search found no committed live tokens or broker secrets.
- Existing credential references are env placeholders, tests, generated Supabase types, or server-side broker credential code.
- Settings/Broker descriptive `Token:` copy was renamed to `Session:` to reduce ambiguity.
- No production Supabase change was applied.
- No real Kite/Upstox token smoke or broker order path was run.

## Browser QA

Screenshots:

`/private/tmp/alphavyuh-real-market-trust-1778102500228`

Covered desktop, tablet, and mobile:

- Dashboard
- Scanner
- Watchlist
- Full chart `/charts/AUBANK?full=1`
- Journal
- Settings/Broker
- Data page

Observed:

- No console/page errors.
- No horizontal overflow.
- Dark theme retained.
- Charts were nonblank.
- Demo data is visibly labeled on market-data surfaces in mock mode.

## Tests

- `npm run lint`
- `npm run typecheck`
- `npm --prefix frontend run test -- --run`
- `npm audit --audit-level=moderate`
- `backend/.venv/bin/python -m pytest backend/tests/test_market_context.py backend/tests/test_market_data_provider.py backend/tests/test_market_overview_failsoft.py backend/tests/test_charts.py backend/tests/test_scanner_filters.py backend/tests/test_auth_middleware.py`
- `backend/.venv/bin/python -m pip_audit -r backend/requirements.txt`
- `npm run test:e2e:mock`
- `npm run test:e2e:perf`
- `npm run test:e2e:layout`

## Remaining Gated Work

- Production Supabase migration was applied on 2026-05-06 after owner approval.
- Staging Supabase project `alphavyuh-staging` is currently inactive/timeouting through the Supabase API, so staging apply could not be completed from this session.
- Real Kite/Upstox read-only smoke requires owner-provided tokens.
- Live/sandbox order placement remains gated and was not run.
- Paid realtime data provider selection requires license/commercial owner input.

## Remaining Non-Gated Gaps

- EOD snapshots are still computed from canonical tables at read time; a materialized scanner/overview snapshot table would be the next step if production latency requires it.
- Holiday awareness is conservative; an official NSE trading-calendar table would make skip reasons more precise.
