# Launch readiness dependency and runner hardening

Date: 2026-07-18  
Branch: `codex/launch-readiness`

## Outcome

The repository-owned launch gate is deterministic and its browser-free path completes successfully. The frontend dependency audit now evaluates the actual application tree and reports no known vulnerabilities.

## Changes

- Updated compatible frontend transitive dependencies and pinned `serialize-javascript` 7.0.7 through the existing override mechanism.
- Corrected the launch audit from the root package to `frontend/`.
- Added a cross-platform Node runner that gives every launch step a named timeout, terminates its process group, and exits 124 on timeout.
- Made the nested setup-review contract honor `SKIP_BROWSER_SMOKE=1`.
- Added `uv` fallbacks for backend pytest and pip-audit when the selected system Python lacks those modules.
- Prevented service-worker registration outside production, matching the environment in which `next-pwa` generates `/sw.js`.

## Verification

- `npm run test:launch-readiness-script` — passed, including success and intentional-timeout fixtures.
- `SKIP_BROWSER_SMOKE=1 STEP_TIMEOUT_SECONDS=600 npm run launch:check` — passed.
- Frontend: 114 test files / 531 tests passed; typecheck and production build passed; lint reported 0 errors and 7 pre-existing warnings.
- Frontend `npm audit --audit-level=moderate` — 0 vulnerabilities (previous lock: 16 total, including 8 high).
- Backend: 412 tests passed, 1 skipped.
- Backend pip-audit — no known vulnerabilities.

## Remaining gates

- The complete browser-enabled launch path was not rerun because direct repository Playwright use requires explicit user authorization in this session.
- Production browser and public-posture verification remain blocked by the paused Vercel account/deployment.
- `next-pwa` remains functional but depends on deprecated Workbox-era build tooling. A later scoped decision should migrate or remove it; this change does not silently remove offline behavior.
