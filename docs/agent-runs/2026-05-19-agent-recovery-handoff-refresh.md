# Agent Recovery Handoff Refresh

## Goal

Make active agent operating docs match the stricter production recovery evidence
now enforced by the launch gate.

## Agent Report

| Agent | Changed | Why it improves the product | Learned | Remaining risk |
| --- | --- | --- | --- | --- |
| Manager Agent | Updated agent README and cross-agent request instructions to say full recovery needs authenticated scanner/watchlist smoke and signed-in production browser evidence. | Future agents cannot close the Railway blocker just because public API health or chart smoke passes. | Issue comments were current, but active handoff docs needed the same standard. | Recovery still needs owner-controlled Railway auth or GitHub secrets. |
| Deploy/Data Agents | Clarified post-recovery commands and evidence requirements in Deploy and Data identities. | The agents responsible for hosting and data now share the same definition of done. | Supabase/Vercel evidence is strong but still partial while Railway is down. | A real production smoke token and QA login are still needed after backend recovery. |
| QA/Product Agents | Updated priority and QA guidance around strict production recovery and launch gates. | The next work stays focused on recovery proof, trusted copy, and a calm core workflow instead of expanding scope. | Launch readiness should prefer proof of the real trader path over more feature surface. | Full completion remains impossible until Railway serves the backend. |

## Validation

- `npm run test:public-posture-check` passed.
- `PUBLIC_SITE_URL=https://www.alphavyuh.com npm run check:public-posture`
  passed.
- Active handoff forbidden-copy sweep passed for the agent docs changed in this
  slice.
- `npm run check:data-recovery` failed on the expected Railway blocker:
  production `/health` returns fallback 404 `Application not found`, Railway
  GitHub recovery secrets are missing, and local Railway CLI auth is expired.

## Current Blocker

Railway production backend recovery remains owner-gated. Active agent handoffs
now match the strict recovery standard, but the objective remains incomplete
until Railway `/health` serves the FastAPI backend and the authenticated
production recovery gate passes.
