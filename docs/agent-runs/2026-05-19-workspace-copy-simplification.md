# Workspace Copy Simplification

## Goal

Remove remaining user-facing "workspace" framing from active product copy where
it made Professional Access feel less direct than the current desk, chart, and
workflow language.

## Agent Report

| Agent | Changed | Why it improves the product | Learned | Remaining risk |
| --- | --- | --- | --- | --- |
| Product Copy Agent | Replaced visible workspace phrasing in signup confirmation, command search, watchlist empty state, full-chart trade-plan help, and the active product page-role table. | Users see simpler account, desk, chart-review, and execution-planning language instead of an older generic workspace frame. | The prior cleanup removed high-signal beta terms, but softer old framing remained in a few active surfaces. | Internal CSS/API names still use workspace because they are implementation terms, not product copy. |
| QA Guard Agent | Added targeted forbidden-copy checks for old workspace phrases and expanded static scanning to AppShell, watchlist, and full-chart pages. | Future posture checks now catch regression in authenticated flow copy, not only public/auth pages. | Broadly banning the word workspace would be noisy, so exact visible phrases are safer. | Production recovery remains blocked on Railway hosting/auth and must be verified separately. |

## Validation

- `npm run test:public-posture-check` passed.
- `PUBLIC_SITE_URL=https://www.alphavyuh.com npm run check:public-posture`
  passed.
- `npm run typecheck` passed.
- `npm run lint` passed.
- Active source sweep for the removed workspace phrases passed; remaining
  matches are the posture guard patterns and intentional failing test phrase.
- `npm run check:data-recovery` failed on the expected Railway blocker:
  production `/health` returns fallback 404 `Application not found`, Railway
  GitHub recovery secrets are missing, and local Railway CLI auth is expired.

## Current Blocker

Railway production backend recovery remains the launch blocker. The copy cleanup
does not prove production data recovery until Railway serves the backend and the
authenticated production smoke gate passes.
