# 2026-05-20 - Broker status unavailable trust

## Summary

- Updated `/settings/broker` so broker status API failures show a broker-status-unavailable state instead of upgrade-required, connect-unavailable, or disconnected copy.
- Disabled broker connect, adapter connect, smoke, and import actions while broker account state cannot be verified.
- Updated full chart broker status copy so broker-status failures appear as status unavailable instead of not linked.
- Replaced unfinished broker/live-data copy with stable product boundaries: broker execution stays in the trader's broker terminal, and charts use EOD market snapshots unless another provider source is shown.

## Agent sweeps

- Copy sweep found remaining customer-facing launch/demo/internal copy, especially Agent Mission Control, billing configuration, broker execution, chart provider/live quote wording, starter/sample queues, and options demo labels.
- Account-data sweep found remaining outage-as-empty risks, especially watchlist/scanner/chart backend responses that can return HTTP 200 with `mode: "unavailable"`.

## Verification

- `npm run typecheck` from `frontend` passed.
- `NEXT_PUBLIC_API_URL=http://localhost:8000 NEXT_PUBLIC_DATA_MODE=mock NEXT_PUBLIC_ALLOW_MOCK_FALLBACK=true NEXT_PUBLIC_FORCE_LIVE_DATA=true PLAYWRIGHT_MOCK_AUTH=true PLAYWRIGHT_BASE_URL=http://localhost:3000 npm exec -- playwright test --config=playwright.config.ts tests/e2e/broker-connect.spec.ts --grep "status unavailable"` from `frontend` passed: 1 test.
- `npm test -- tests/unit/account-data-api.test.ts tests/unit/watchlists-api.test.ts` from `frontend` passed: 2 files, 5 tests.
- `npm run e2e:mock` from `frontend` passed: 12 tests.
- Browser smoke on `http://localhost:3002/settings/broker` with mock auth/data showed healthy broker settings without outage or upgrade-required warning leakage.
- `npm run check:data-recovery` from repo root still fails as expected because Railway production API returns 404 `Application not found`, GitHub Railway recovery secrets are missing, no Railway recovery workflow runs exist, and local Railway CLI auth needs `railway login`.

## Next recommended slice

Handle backend/client payloads that encode outages as successful empty responses, starting with scanner `mode: "unavailable"` and watchlist `mode: "unavailable"` handling.
