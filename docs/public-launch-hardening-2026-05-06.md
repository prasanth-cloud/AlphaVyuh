# AlphaVyuh Public Launch Hardening Report

Date: 2026-05-06
Branch: `launch/10-day-public-hardening`

## Launch Mode Assumption

Until the owner confirms otherwise, the safest launch posture is public beta with clearly labeled Demo/EOD data and broker execution gated. Paid realtime data, production billing, real broker token smoke, and live/sandbox order validation remain owner-gated.

## Day 1 Audit

Routes audited locally in mock auth/data mode across desktop, tablet, and mobile:

- Public: landing, signup, login, reset password, offline, unknown route.
- First-run: onboarding.
- Core workflow: dashboard, scanner, watchlist, full chart, journal.
- Trust/settings: settings, profile redirect, broker settings, billing redirect, data status.
- Visible secondary surfaces: alerts, portfolio, options, community.

## Findings

### P0 Launch Blockers

None found in the current local mock launch audit.

### P1 Serious Trust / Workflow Issues

- Fixed: billing, referral, options, and community routes attempted backend calls in mock/local mode. When the backend was absent, the browser logged CORS/network errors even though the UI mostly degraded. These routes now use deterministic mock launch fallbacks.
- Fixed: the community page still used a light UI treatment. It now follows the dark trading desk theme.

### P2 Polish Issues

- Fixed: unknown routes used the default light Next.js 404. A dark AlphaVyuh 404 now keeps the launch surface consistent and gives users a route back to dashboard/site.
- Still open: `/settings/profile` and `/settings/billing` are redirect shims into `/settings` tabs. This is acceptable for launch, but direct tab URLs would be cleaner later.

## Current Evidence

- PR #60 was merged after green Vercel and green Migration Drift Check.
- PR #60 preview smoke covered dashboard, scanner, watchlist, full chart, journal, settings/broker, and data page: all 200, no console/page errors, no horizontal overflow.
- Local route audit after fixes: no console/page errors except the expected 404 response for the intentional unknown-route check; no horizontal overflow; dark 404 active.

## Remaining Owner Inputs

- Public beta vs private beta.
- EOD-first/free data policy vs paid vendor budget.
- Official support/contact email and final legal copy.
- Whether billing should be hidden, disabled, or production-ready.
- Final domain/deployment target.
- Broker tokens only for read-only smoke; no sandbox/live order validation without explicit owner confirmation.

## Go / No-Go Snapshot

Current status: proceed with hardening PR. No P0 blockers found. Known gated items should be documented clearly before public traffic.
