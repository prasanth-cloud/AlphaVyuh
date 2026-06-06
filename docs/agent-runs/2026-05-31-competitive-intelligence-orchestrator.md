# Competitive Intelligence Orchestrator

Date: 2026-05-31

## Scope

Start the queued AlphaVyuh Competitive Intelligence Orchestrator goal. Read the
competitive brief, inspect current repo/branch/worktree/PR state, split the P0
roadmap into safe implementation tracks, and preserve merge guidance before any
cleanup.

## Starting Inventory

- Root checkout is dirty on `codex/data-trust-recovery-hardening`; it was not
  used for implementation.
- Open PRs at kickoff: none.
- Existing old worktrees include scanner/watchlist/chart experiments from prior
  goals. They are treated as active historical context and are not modified.
- Clean orchestration worktree:
  `/private/tmp/alphavyuh-competitive-orchestrator`
- Branch:
  `codex/competitive-orchestrator`

## Current Product Coverage

The codebase already covers parts of the competitive P0 wedge:

- Scanner result rows include match explanations, setup score, confidence
  reasons, data warnings, saved screens, multi-screen composition, scan alerts,
  watchlist handoff, chart review, and workflow marks.
- Watchlist already includes review-priority sorting, pinned symbols, tags,
  notes, scanner-origin context, journal review context, fundamentals fallback,
  chart review, and a broker-aware journal-capture order panel.
- Data trust is visible across scanner, chart, public API smoke, five-year chart
  coverage, and production recovery checks.
- Broker action remains import/read-only or simulated unless explicitly approved.

## P0 Track Split

| Track | Recommended Branch / Worktree | File Ownership | Dependencies | Collision Risk | First Safe Slice |
|---|---|---|---|---|---|
| Scan Results Workbench | `codex/competitive-scan-workbench` / `/private/tmp/alphavyuh-competitive-scan-workbench` | `frontend/app/(app)/scanner/page.tsx`, scanner-specific tests | Existing scanner results, chart links, watchlists, broker status read | Medium: scanner page is dense and owns alerts too | Add a selected-result workbench rail with chart/broker/read-only action context; avoid new endpoints. |
| Saved Scan Alerts | `codex/competitive-scan-alerts` / `/private/tmp/alphavyuh-competitive-scan-alerts` | `frontend/app/(app)/alerts/page.tsx`, alert copy/tests, alert API tests | Existing scan alert API and mock alerts | Low/medium: scanner alert modal copy overlaps scanner page | Make entry/exit semantics and session frequency caps explicit in UI/tests. |
| Broker Order Action Bar | `codex/competitive-order-action-bar` / `/private/tmp/alphavyuh-competitive-order-action-bar` | New broker action component, watchlist/chart integration tests | Existing `getBrokerStatus`, `placeOrder`, broker safety gates | High if edited directly in watchlist/chart pages | Extract or add a component that clearly shows read-only/import-only state and cash-equity-only journal capture. |
| Watchlist Prioritizer | `codex/competitive-watchlist-prioritizer` / `/private/tmp/alphavyuh-competitive-watchlist-prioritizer` | `frontend/lib/watchlist-triage.ts`, watchlist UI/tests | Existing scanner workflow state, fundamentals, journal review state | Medium/high: watchlist page also contains order ticket | Improve broker-context scoring/copy in triage without changing order mutation behavior. |
| Data Freshness + Signal Explain Drawer | `codex/competitive-signal-explain` / `/private/tmp/alphavyuh-competitive-signal-explain` | `frontend/lib/scanner-match-explanation.ts`, scanner tests, data copy tests | Existing scanner explanations and data trust payload | Medium: scanner explanation is used in scanner page | Add freshness classification and condition-value warning copy in pure library tests first. |

## Parallelization Decision

Full parallel implementation is risky because scanner, watchlist, and broker
action work all converge on `frontend/app/(app)/scanner/page.tsx`,
`frontend/app/(app)/watchlist/page.tsx`, and `frontend/lib/api.ts`.

Use this serialized merge order:

1. `competitive-signal-explain`: pure library/data trust improvement.
2. `competitive-scan-alerts`: alert copy/entry-exit behavior.
3. `competitive-watchlist-prioritizer`: triage scoring/copy.
4. `competitive-order-action-bar`: shared/read-only order action surface.
5. `competitive-scan-workbench`: scanner page composition after shared pieces
   are merged.

## Owner-Gated Items

- No production Supabase migrations or backfills.
- No Vercel/Railway production deploys for these feature tracks.
- No live or sandbox broker orders.
- No F&O/options/derivatives scope.

## Verification Plan

- Pure logic tracks: targeted Vitest unit tests.
- Scanner/watchlist UI tracks: targeted unit tests plus relevant Playwright mock
  smoke when UI changes land.
- Final orchestration: PRs must include screenshots or explicit explanation if
  the change is non-visual.

## PRs Opened

- Orchestration plan: [#316](https://github.com/prasanth-cloud/AlphaVyuh/pull/316)
- Data Freshness and Signal Explain Drawer: [#317](https://github.com/prasanth-cloud/AlphaVyuh/pull/317)
- Saved Scan Alerts: [#318](https://github.com/prasanth-cloud/AlphaVyuh/pull/318)
- Watchlist Prioritizer: [#319](https://github.com/prasanth-cloud/AlphaVyuh/pull/319)
- Broker-Connected Order Action Bar: [#320](https://github.com/prasanth-cloud/AlphaVyuh/pull/320)
- Scan Results Workbench: [#321](https://github.com/prasanth-cloud/AlphaVyuh/pull/321)

## Open Decisions

- Whether the first public-facing implementation should be a scanner workbench
  rail or a smaller data-trust drawer. Current recommendation: start with the
  pure signal-explain slice, then layer UI.
- Whether to create database-backed alert history/diffing now. Current
  recommendation: do not add migrations until the UI semantics and mock
  behavior are proven.

## Risks

- Large scanner/watchlist pages are already dense; avoid adding decorative
  panels that slow daily scanning.
- Broker language must remain clear: journal capture and import/read-only are
  available, live order placement is unavailable without owner approval.
- Existing old worktrees may contain overlapping experiments; do not modify or
  delete them without reading and summarizing their context.
