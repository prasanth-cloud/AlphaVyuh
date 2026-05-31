# PR Queue Billing Gate

## Surface
- Open GitHub PR queue for `prasanth-cloud/AlphaVyuh`.
- Vercel preview status.
- GitHub Actions `Agent regression gate`.

## Current State
- All open PRs are mergeable.
- All open PRs have Vercel preview success.
- The only failing required check across the queue is the GitHub Actions `Agent regression gate`.
- The failing check does not run tests; GitHub stops the job before startup with the billing/spending-limit annotation.

## Evidence
- #308 `Railway Deployment #9aafa6 fix: use python312 with pip in nixpacks`
  - Ready, mergeable, Vercel green.
  - Agent gate blocked before startup.
- #307 `feat(chart): summarize review board pulse`
  - Ready, mergeable, Vercel green.
  - Agent gate blocked before startup.
- #299 `feat(scanner): rank sector strength`
  - Draft, mergeable, Vercel green.
  - Agent gate blocked before startup.
- #290 `[codex] Expose sector taxonomy metadata`
  - Draft, mergeable, Vercel green.
  - Agent gate blocked before startup.
- #289 `fix(chart): enforce five-year daily coverage smoke`
  - Draft, mergeable, Vercel green.
  - Agent gate blocked before startup.
- #288 `[codex] Gate broker orders on read-only smoke`
  - Draft, mergeable, Vercel green.
  - Agent gate blocked before startup.
- #281 `[codex] fix corrupted market-session trust gates`
  - Draft, mergeable, Vercel green.
  - Agent gate blocked before startup.
- #280 `chore: add production signed-in smoke gate`
  - Draft, mergeable, Vercel green.
  - Agent gate blocked before startup.

The GitHub check-run annotation observed on refreshed heads says:

> The job was not started because recent account payments have failed or your spending limit needs to be increased. Please check the 'Billing & plans' section in your settings

## Merge Order After Owner Action
1. Fix GitHub account billing/spending limit.
2. Rerun `Agent regression gate` for the ready PRs.
3. If green, merge #308 first to unblock Railway deploy packaging.
4. Merge #307 next if its refreshed checks remain green.
5. Review draft PRs one-by-one before marking ready:
   - #288 remains broker/order owner-gated.
   - #281/#280 overlap on signed-in smoke workflow work; choose the narrower path or split unique QA/docs pieces before merge.
   - #289/#290/#299 are product/data-trust feature slices and should stay draft until owner approval.

## Notes
- No production deploy, Supabase mutation, billing change, or broker-order action was performed during this queue cleanup.
- The Zerodha OAuth callback URL was not changed.
- The dirty root checkout files were intentionally left untouched.
