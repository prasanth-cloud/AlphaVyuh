# Non-Gated Launch Hardening - 2026-05-06

Scope: latest `main` after PR #58, mock/local authenticated workflow, no production Supabase changes, no real broker token smoke, no live or sandbox order placement.

## Product Improvements
- Scanner row actions now keep the critical actions visible: Shortlist, Chart, Later, Ignore, and Add to watchlist. Journal/report actions remain available through the expanded row and page-level feedback paths.
- Scanner bulk feedback now makes selected-state actionability explicit.
- Watchlist Decision Desk now shows required-field chips for entry, stop, target, size, thesis, and invalidation, plus inline risk/reward validation.
- Broker settings and data status pages now have responsive grid hooks for cleaner tablet/mobile density.
- Full-chart symbol search suppresses browser-managed input style hydration noise without changing chart behavior.

## Performance Evidence
Local mock, Chromium, warm-ish dev server. Wall time includes route navigation and visible-marker wait.

| Flow | Before | After |
| --- | ---: | ---: |
| Login/dashboard usable | 1057ms | 735ms |
| Dashboard route load | 588ms | 570ms |
| Scanner first usable | 603ms | 590ms |
| Scanner run render | 76ms | 71ms |
| Watchlist focus + chart render | 736ms | 700ms |
| Full chart load | 1014ms | 666ms |
| Journal load | 606ms | 571ms |

Implementation note: repeated mock watchlist, quote, candle, and broker-status reads now use the same client cache/request-coalescing path as live reads.

## Security Findings
- Removed a committed QA doc example containing a credential-shaped email/password and replaced it with private env/token guidance.
- Stopped `seed_now.py` from printing the first characters of Supabase service keys.
- Removed `kiteconnect` from production backend requirements because its current dependency path resolves vulnerable `autobahn==19.11.2`; the backend already uses the internal Kite HTTP adapter for non-gated broker paths and treats KiteTicker websocket support as optional.
- Verified no frontend `NEXT_PUBLIC_` service-role exposure was found in the scanned source.
- Verified broker token values are not surfaced in Settings/Broker, Dashboard, Watchlist order panel, Journal, or Data Status; UI shows status only.
- Verified order placement remains gated by plan validity in the UI and explicit live confirmation in backend focused tests.

## Browser QA Evidence
- Screenshot directory: `/private/tmp/alphavyuh-launch-hardening-final-1778071369923`
- Pages captured: dashboard, scanner, watchlist, full chart, settings/broker, data, journal, plus mobile dashboard/scanner/watchlist/broker/data.
- Final smoke results: no console/page errors, no horizontal overflow, no blank chart, AUBANK full chart shows AU Small Finance Bank and drawing overlay, Decision Desk blocks invalid orders.

## Validation
- `npm run lint`
- `npm run typecheck`
- `npm --prefix frontend run test -- --run`
- `npm audit --audit-level=moderate`
- `backend/.venv/bin/python -m pytest backend/tests/test_broker_order_safety.py backend/tests/test_broker_encrypted_credentials.py backend/tests/test_brokers_router.py backend/tests/test_charts.py backend/tests/test_scanner_filters.py backend/tests/test_auth_middleware.py`
- `backend/.venv/bin/python -m pip_audit -r backend/requirements.txt`
- `npm run test:e2e:mock`
- `npm run test:e2e:perf`
- `npm run test:e2e:layout`

## Remaining Gated Work
- Real Zerodha/Upstox read-only token smoke still requires owner-provided tokens.
- Kite websocket live feed support should use a dependency path that does not reintroduce the vulnerable legacy `kiteconnect` websocket stack.
- No live or sandbox broker order placement was run.
- No production Supabase changes were made.

## Remaining Non-Gated Gaps
- Scanner row actions are more compact, but a deeper action-menu component would be cleaner in a future UI pass.
- Data Status mobile density is improved structurally but can still be tightened visually.
- Broker settings mobile cards are now safer responsively, but copy density remains high.
