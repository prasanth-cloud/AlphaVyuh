# AlphaVyuh Bugs

**The QA agent writes here. The Feature/Data/Design/Deploy agents read here.**

Format:
- P0: blocks a user from completing the 10-step journey
- P1: workable with workaround, user will notice
- P2: cosmetic/polish
- Tags: AUTH, FEATURE, DATA, DESIGN, DEPLOY

Close a bug by moving it to ## Closed section with a commit SHA.

## Open

### BUG-001: Scanner/Watchlist/Journal return "Not authenticated"
**Severity:** P0
**Tags:** AUTH, FEATURE
**Discovered:** 2026-04-19
**Found by:** User screenshots

**Reproduction**
1. Login to localhost:3000
2. Navigate to /scanner, /watchlist, or /journal
3. Observe: red banner "Not authenticated"

**Expected:** Pages load with authenticated user data

**Actual:** `/api/v1/scanner/run`, `/api/v1/watchlists`, `/api/v1/journal/trades` all return 401

**Assigned to:** FEATURE

### BUG-002: Dashboard "Start scanning" button text invisible
**Severity:** P1
**Tags:** DESIGN, FEATURE
**Discovered:** 2026-04-19

**Reproduction**
1. Login, view dashboard
2. Observe welcome banner "Welcome to AlphaVyuh"
3. Look at CTA button on right

**Expected:** "Start scanning" text clearly readable

**Actual:** Text is same color as background (dark-on-dark)

**Assigned to:** FEATURE (fix button to use <Button variant="primary"> primitive)

### BUG-003: Sector breadth shows "No sector data yet" despite data existing
**Severity:** P1
**Tags:** DATA, FEATURE
**Discovered:** 2026-04-19

**Reproduction**
1. View dashboard
2. Left column shows "No sector data yet — loads after market close"
3. But market close data IS available (other widgets populated)

**Expected:** Sector breadth bars render

**Actual:** Empty state

**Root cause (suspected):** Endpoint returns empty or frontend reads wrong field

**Assigned to:** DATA (add endpoint), then FEATURE (connect)

### BUG-004: EMA 50 breadth shows 0% (probably bug)
**Severity:** P2
**Tags:** DATA
**Discovered:** 2026-04-19

**Reproduction**
1. Dashboard → EMA breadth card
2. Above EMA 20: 94.1%
3. Above EMA 50: 0%
4. Above EMA 200: 38%

**Expected:** Reasonable value between EMA 20 and EMA 200 percentages

**Actual:** Exactly 0%, implying computation or field-name bug

**Assigned to:** DATA

## Closed

(empty)
