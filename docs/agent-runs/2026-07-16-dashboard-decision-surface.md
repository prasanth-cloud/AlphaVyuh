# Dashboard decision surface

Date: 2026-07-16

## Intent

Turn the signed-in dashboard from a catalogue of overlapping tools into one trading-workflow handoff. The page now answers three questions in order:

1. What is the completed-session market state?
2. What needs review?
3. What is the fastest safe next action?

This follows the AlphaVyuh product wedge identified in the platform audit: market context -> scan -> compare charts -> watch -> record a decision -> review the process.

## What changed

- Replaced the multi-workspace dashboard and optional full-desk card catalogue with one compact decision surface.
- Condensed market context to the index tape, advances/declines, EMA participation, new highs/lows, and the three leading sectors.
- Consolidated scanner matches, watchlist review debt, open risk, and journal learning into one Review Queue.
- Consolidated broker import posture and at most two priority symbols into Continue Workflow.
- Kept broker copy explicitly read-only and routed actions into existing scanner, data, watchlist, chart, journal, and broker settings pages.
- Stopped treating closed trades outside the loaded journal sample as reviewed. The UI now names partial review coverage.
- Refreshes account/workflow context every five minutes and keeps refresh failures visible while the last loaded in-memory snapshot remains useful.
- Removes the unvalidated cross-reload local market cache; malformed local storage can no longer be rendered as trusted market context.
- Removed the workspace switcher, session agenda, persistence helpers, and tests that existed only to support the overlapping dashboard variants.

## Visual evidence

- Before desktop: `outputs/alphavyuh-dashboard-audit/01-before-dashboard-desktop.png`
- Before mobile: `outputs/alphavyuh-dashboard-audit/03-before-dashboard-mobile.png`
- After desktop: `outputs/alphavyuh-dashboard-audit/04-after-dashboard-desktop.png`
- After mobile: `outputs/alphavyuh-dashboard-audit/05-after-dashboard-mobile.png`

At the inspected state, mobile document height fell from 8,274px to 2,554px. Desktop now exposes market state and the two decision panels in the first screen. Both inspected viewports had no document-level horizontal overflow.

## Verification

- Targeted dashboard unit tests: 20 passed.
- Full frontend unit suite: 112 files, 522 tests passed.
- `npm run typecheck`: passed with existing build warnings.
- `npm run lint`: passed with 7 existing warnings and no errors.
- In-app browser: scanner navigation, broker Continue route, priority chart route, desktop and mobile overflow, and browser error logs verified.
- Layout smoke: dashboard-specific replacements passed. The full cross-page run also exposed and corrected stale expectations for the removed full-desk dashboard and the current historical-only watchlist timeframe menu.

## Known gates

- This local/mock verification is not proof of the signed-in production dashboard; QA credentials were not available.
- The dependency audit still reports 16 existing findings (1 low, 7 moderate, 8 high). No dependency changes are included here.
- Pending Market Pulse and weekly journal review routes are not linked from this branch because they are separate reviewable changes and are not yet on the branch base.
