# Queued Goal: AlphaVyuh Human Trader UI/UX Polish

## Source

User requested this after the active issues/performance goal:

- Improve UI/UX positioning and visual hierarchy so the product makes immediate sense to a trader.
- Remove the "AI-made" feeling from typography, sizing, copy, density, and component styling.
- Make the app feel like a human product team is behind it.
- Use the best available landing-page inspiration, including Bolt-style polish if available.
- Audit the current signed-in product surfaces, not only the landing page.
- Hide or demote internal/trust implementation details that are not useful to traders, such as raw taxonomy language.
- Keep what is necessary for trader confidence, but translate it into useful language.
- Compare honestly against TradingView, ChartsMaze, Chartink, and similar tools on accuracy, speed, clarity, and workflow.
- Use separate development threads/worktrees for major feature/design tracks and pin important threads.
- Deploy to production after implementation and verification if the product is visually/user-flow ready and owner-gated deployment requirements are satisfied.

## Objective

Make AlphaVyuh feel like a polished, fast, credible human-built trading workflow product for NSE/BSE cash-equity traders.

The goal is not to add more visible machinery. It is to make the product clearer, faster, more trustworthy, and calmer:

- Better typography and font scale.
- Cleaner spacing, alignment, and responsive layout.
- Trader-first navigation and surface hierarchy.
- Fewer internal labels.
- More useful trust language.
- Less clutter in dashboard, scanner, watchlist, chart, journal, data/status, and landing/access pages.
- Faster perceived performance.
- Strong visual confidence without copying TradingView/ChartsMaze/Chartink.

## Product Principles

- Cash equities only. Do not add F&O, options, Greeks, OI dashboards, derivatives, or derivatives order flows.
- Do not expose internal implementation vocabulary to ordinary users unless it directly helps a trader make a safer decision.
- Replace raw labels like "taxonomy unverified" with trader-facing concepts such as "Sector labels need review" or "Sector grouping is provisional" only where the user needs to know.
- Keep launch trust visible, but make it concise and useful.
- Buy/sell remains order intent unless broker approval gates are explicitly satisfied.
- Do not fake realtime, official taxonomy parity, broker execution, or data accuracy.
- Prefer fewer, better panels over adding new cards.
- Make default routes useful immediately; no marketing-first landing page for logged-in users.

## First Inspection Pass

Before editing:

1. Inspect current branch, open PRs, worktrees, active threads, and uncommitted files.
2. Inspect current production visually with browser screenshots:
   - landing/access/login
   - dashboard
   - scanner
   - watchlist
   - full chart
   - journal
   - data/status
3. Capture specific UI issues:
   - typography feels too decorative or AI-generated
   - oversized or underweighted copy
   - cramped controls
   - confusing hierarchy
   - internal implementation labels
   - slow/performance pain
   - inaccurate or overclaiming data labels
4. Compare against TradingView, ChartsMaze, and Chartink for:
   - first-glance utility
   - scan-to-chart speed
   - chart density
   - watchlist ergonomics
   - data/status copy
   - landing page credibility

## Suggested Tracks

1. Design System / Typography Track
   - Audit font choice, scale, weights, letter spacing, line height, and button/control sizing.
   - Remove overly stylized/AI-looking typography.
   - Establish a dense but readable trading-app type system.

2. Trader Information Architecture Track
   - Rework dashboard/scanner/watchlist/chart hierarchy.
   - Make primary action paths obvious:
     - scan
     - review chart
     - shortlist/watchlist
     - journal/review
   - Hide or compress internal operational details.

3. Landing / Access Page Track
   - Polish public pages for credibility and clarity.
   - Use modern landing-page inspiration without making it look generic or AI-generated.
   - Keep the product itself visible in the first viewport.

4. Chart / Watchlist Ergonomics Track
   - Make chart controls, side panels, and watchlist decision panels feel trader-native.
   - Reduce visual noise and internal labels.
   - Keep trust labels concise and non-intrusive.

5. Performance / Perceived Speed Track
   - Measure slow pages.
   - Improve loading skeletons, query/data boundaries, and interaction latency.
   - Keep performance gates measurable.

6. Copy / Trust Language Track
   - Rewrite internal language into trader-facing language.
   - Preserve honesty about EOD data, provisional sector grouping, and broker/order limits.
   - Remove jargon that belongs in operator docs instead of user surfaces.

## Thread / Worktree Rules

- Do not modify another active goal's branch, worktree, PR, or uncommitted files.
- Use isolated branches/worktrees for major tracks.
- Pin important implementation/review threads when thread tools are available.
- Keep file ownership scoped to avoid overlapping edits.
- Write durable summaries to `docs/thread-summaries.md` or `docs/agent-runs/<date>-<track>.md`.
- Do not clean up worktrees until summaries exist.

## Deployment Rules

- Do not deploy until:
  - implementation PRs are merged or explicitly approved for deployment,
  - production-impacting gates pass,
  - visual QA passes on desktop and mobile,
  - no production Supabase mutation or broker action is required without explicit approval,
  - owner confirms production deployment timing if deployment is not already approved in the active thread context.

## Acceptance Criteria

- The public and signed-in product feels intentionally designed, not AI-generated.
- Typography, spacing, hierarchy, and control density are consistent.
- Trader workflows are clearer and faster.
- Internal labels such as raw taxonomy/audit wording are hidden or translated into useful trader-facing copy.
- Accuracy and trust labels remain honest.
- Core routes pass visual QA on desktop and mobile.
- Performance measurements are recorded before and after.
- Production deployment is completed only after the required gates and approvals.
- Final report includes:
  - screenshots reviewed
  - changes made
  - branches/worktrees/threads used
  - tests and visual QA
  - deployment status
  - remaining product risks
