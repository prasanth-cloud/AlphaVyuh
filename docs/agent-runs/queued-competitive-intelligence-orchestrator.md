# Queued Goal: AlphaVyuh Competitive Intelligence Orchestrator

Status: queued. Do not start this goal while another goal is active unless the
owner explicitly switches context to it.

## Source Brief

Read `docs/competitive-research.md` before starting this queued goal.

## Context

AlphaVyuh is a Next.js 14 + TypeScript frontend, FastAPI backend, and Supabase
DB trading SaaS for Indian NSE/BSE cash-equity retail traders.

A separate goal may already be running. When this queued goal is eventually
started, do not interfere with any active branch, worktree, PR, or uncommitted
files from another goal.

AlphaVyuh does not support F&O, options, derivatives, Greeks, OI dashboards, or
derivatives order flows. Keep the scope cash-equity only.

## Objective

Act as the AlphaVyuh development orchestrator.

Read `docs/competitive-research.md`, split the P0 roadmap into safe parallel
feature tracks, create isolated branches/worktrees for each track, coordinate
implementation, preserve context before cleanup, and recommend merge order.

## Primary P0 Tracks

1. Scan Results Workbench with chart + broker side panel
2. Saved Scan Alerts for entry/exit from screens
3. Broker-Connected Order Action Bar
4. Watchlist Prioritizer with sector/RS/broker context
5. Data Freshness and Signal Explain Drawer

## Orchestration Rules

- Do not push directly to `main`.
- Do not modify another active goal's branch, worktree, PR, or uncommitted files.
- First inspect repo status, branches, worktrees, open PRs, and existing docs.
- Each parallel feature should use its own branch/worktree.
- Avoid overlapping file edits where possible.
- If two features need the same shared module, pause and serialize that shared
  piece.
- No production Supabase, broker, Vercel, Railway, or live deployment mutation
  without explicit owner approval.
- Avoid fake success states. If broker/data/chart mutation is unavailable, show
  clear unavailable/read-only states.
- Keep scope NSE/BSE cash equities only. Do not add F&O/options/derivatives
  functionality.

## Context Preservation Rules

Before closing, deleting, cleaning up, or marking any feature thread/worktree
done:

1. Read the full feature thread/worktree/PR context.
2. Write a durable summary to either:
   - `docs/thread-summaries.md`
   - `docs/agent-runs/<date>-<feature>.md`
3. Include:
   - feature scope
   - branch/worktree
   - files changed
   - tests run
   - open decisions
   - known risks
   - next steps
   - PR link if created
4. Only clean up local worktrees or close threads after this summary exists.

## Execution Plan

1. Inspect current repo status, branches, worktrees, open PRs, and relevant docs.
2. Create an orchestration plan listing:
   - feature tracks
   - dependencies
   - likely file collision risks
   - recommended branch/worktree names
   - suggested merge order
3. If parallelization is risky, start with the smallest safe vertical slice
   instead of forcing parallel work.
4. For each feature track:
   - create isolated branch/worktree
   - implement scoped changes
   - add targeted tests
   - run relevant checks
   - open PR or prepare PR notes
   - write durable context summary
5. Maintain a central progress table in `docs/thread-summaries.md`.

## Acceptance Criteria

- No active work is overwritten.
- Each feature track is isolated.
- Context is preserved before cleanup.
- PRs/checks are traceable.
- User-facing unavailable/read-only states are explicit.
- No F&O/options/derivatives functionality is added.
- Final response includes:
  - orchestration status
  - branches/worktrees created
  - PRs opened or prepared
  - summaries written
  - tests run
  - remaining risks
  - recommended merge order

## Optimization Note

When this queued goal starts, optimize for the highest safe parallelism that
does not create file ownership collisions or obscure product trust. Prefer
small, independently reviewable vertical slices over broad rewrites.
