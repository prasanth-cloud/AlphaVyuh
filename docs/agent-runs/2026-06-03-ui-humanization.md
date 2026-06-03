# 2026-06-03 UI Humanization Pass

## Scope
- Humanized the public landing page copy, typography, animation posture, and product story.
- Kept the public scope honest for NSE/BSE cash-equity workflows, EOD market data, broker import only, and no trade calls.
- Fixed a first-run onboarding bug where fast radio selection could leave Continue disabled after signup.

## Branch / Worktree
- Branch: `codex/ui-humanization`
- Worktree: `/private/tmp/alphavyuh-ui-humanization`

## Files Changed
- `frontend/app/page.tsx`
- `frontend/app/(app)/onboarding/page.tsx`
- `frontend/tests/unit/landing-humanization-source.test.ts`
- `frontend/tests/unit/onboarding-scope-copy.test.ts`

## Verification
- `npm --prefix frontend ci`
- `npm run test -- landing-humanization-source onboarding-scope-copy today-copy-source`
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run test:public-posture-check`
- `npm --prefix frontend exec -- playwright test --config=frontend/playwright.mock.config.ts frontend/tests/e2e/workflow-mock.spec.ts -g "signup first-run"`
- `npm run test:e2e:mock`
- `npm run test:e2e:layout`
- `npm run test:e2e:perf`
- `npm run test:e2e:release`
- Desktop/mobile visual smoke on `http://127.0.0.1:3101/`

## Evidence
- Landing desktop/mobile: no horizontal overflow.
- Landing first viewport: next content is visible on desktop and mobile.
- Public hero: `AlphaVyuh` headline, calmer cash-equity workflow copy, native cursor.
- Removed public fake-social-proof tells: custom cursor, decorative orbs, fake star reviews, community/reviews framing, US-market pricing claim.
- Landing feature tabs default to Journal before Scanner.
- Onboarding signup smoke reaches the starter watchlist again.

## Open Decisions
- The broader authenticated app typography still needs the next pass: Journal first viewport, Watchlist decision desk, chart Plan Packet, and Scanner handoff polish.
- Production deployment is intentionally left to the PR merge gate.

## Known Risks
- Landing page still uses imperative DOM animation code; this pass cleaned listener cleanup and animation delay, but a future componentized rewrite would be cleaner.
- Public pricing remains planning copy until billing is configured.

## Next Steps
1. Open and merge this PR after GitHub/Vercel checks pass.
2. Start the Journal wedge PR: review queue and process insight first, trades table second.
3. Follow with Watchlist/Chart handoff and Scanner handoff polish.
