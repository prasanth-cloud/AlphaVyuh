# Agent Mission Control

Mission Control is the operating dashboard for AlphaVyuh agent work. It tells the founder what agents are doing, what is next, and whether work is making the product better.

## Recommended GitHub Project Views

Create one GitHub Project named `AlphaVyuh Mission Control`.

Views:

- Current sprint: active and next-up work.
- Agent lanes: Manager, Product, Frontend, Backend/Data, QA, Security, Deploy.
- Launch blockers: owner-gated decisions and release risks.
- Product impact: tasks grouped by latency, trust, UX, retention, revenue, security.
- PR queue: open PRs, review status, CI status, preview status.

## Required Fields

- Status: planned, in progress, blocked, ready for QA, ready for review, merged.
- Agent owner: Manager, Product, Frontend, Backend/Data, QA, Security, Deploy.
- Impact: UX, latency, data trust, retention, revenue, security, reliability.
- Risk: low, medium, high, owner-gated.
- User surface: landing, auth, dashboard, scanner, watchlist, full chart, journal, settings, data, broker.
- Evidence: PR, screenshots, test command, preview URL, blocker link.

## Daily Operating Loop

1. Review blockers first.
2. Review PRs waiting on owner decision.
3. Review failed checks or deploy issues.
4. Pick the highest-impact unblocked task.
5. Assign agent owners and file boundaries.
6. End each run with a PR, issue update, or blocker entry.

## Measuring Agent Impact

Do not measure agents by lines of code.

Measure:

- Login-to-dashboard usable time.
- Scanner run/render latency.
- Watchlist chart render latency.
- Full chart interaction smoothness.
- Broken flow count.
- User confusion count from beta feedback.
- Number of owner-gated blockers reduced.
- CI pass rate.
- Reopened bug rate.
- Trader feedback quality.

## Product Quality Bar

A change should usually do at least one of these:

- Make a trader faster.
- Make data more trustworthy.
- Make charting smoother.
- Reduce clutter.
- Reduce launch risk.
- Improve feedback collection.
- Improve onboarding clarity.

If a task does none of these, it should be questioned before implementation.

