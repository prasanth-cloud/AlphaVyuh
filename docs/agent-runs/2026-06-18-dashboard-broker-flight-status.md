# Dashboard Broker Flight Status - 2026-06-18

## Goal

Make the focused dashboard behave more like a trading cockpit by surfacing
broker lifecycle exceptions without duplicating the full Broker settings
timeline.

## Changes

- Dashboard background hydration now loads normalized broker activity.
- Session and Risk workspaces include a compact Broker flight status module.
- Attention priority is:
  1. broker fills missing Journal linkage;
  2. partial fills and pending submissions;
  3. recent rejections;
  4. clear or no-activity state.
- Broker activity outages remain warnings and are not rendered as a clear
  lifecycle.
- The module links to Broker settings for reconciliation and adapts its metric
  grid to narrow screens.

## Verification

- Unit tests cover Journal gaps, partial/pending counts, and unavailable state.
- Workspace tests confirm the module belongs to Session, Full desk, and Risk.
- Browser smoke confirms it renders in the default Session cockpit.

## Next

1. Apply the atomic order-intent migration in staging.
2. Validate lifecycle transitions with owner-approved broker sandbox orders.
3. Feed measured sandbox timing into dashboard freshness and alert thresholds.
