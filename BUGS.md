# AlphaVyuh Bugs

**The QA agent writes here. The Feature/Data/Design/Deploy agents read here.**

Format:
- P0: blocks a user from completing the 10-step journey
- P1: workable with workaround, user will notice
- P2: cosmetic/polish
- Tags: AUTH, FEATURE, DATA, DESIGN, DEPLOY

Close a bug by moving it to ## Closed section with a commit SHA.

## Open

## Closed

### BUG-001: Scanner/Watchlist/Journal return "Not authenticated"
**Severity:** P0
**Tags:** AUTH, FEATURE
**Discovered:** 2026-04-19
**Closed:** 2026-04-28
**Commit:** 373b865

Scanner now uses the shared auth header helper instead of manually building bearer tokens, and backend auth validates Supabase JWTs locally with fallback to Supabase Auth API. Verified by local signed-in smoke covering scanner, watchlist, charts, and journal.

### BUG-003: Sector breadth shows "No sector data yet" despite data existing
**Severity:** P1
**Tags:** DATA, FEATURE
**Discovered:** 2026-04-19
**Closed:** 2026-04-28
**Commit:** 4dffdaa

Dashboard fallback now composes sector breadth from `/api/v1/market/sector-breadth` if authenticated overview is unavailable, so the dashboard no longer drops to an empty sector state while public data exists.

### BUG-004: EMA 50 breadth shows 0% (probably bug)
**Severity:** P2
**Tags:** DATA
**Discovered:** 2026-04-19
**Closed:** 2026-04-28
**Commit:** 4dffdaa

Legacy market summary now includes `above_ema50_pct`, frontend fallback preserves it, and overview EMA breadth uses valid EMA rows as denominators to avoid misleading 0% values from partial indicator data.

### BUG-002: Dashboard "Start scanning" button text invisible
**Severity:** P1
**Tags:** DESIGN, FEATURE
**Discovered:** 2026-04-19
**Closed:** 2026-04-28
**Commit:** bc5353c

Dashboard primary CTA now uses the shared primary button treatment. Added Playwright coverage in `smoke-signed-in.spec.ts` to assert the CTA renders visibly with dark text on the teal gradient.
