# Journal Context Prompts

Date: 2026-05-17
Branch: `codex/journal-context-prompts`
Issue: #115

## Agent Roster

- Manager: integrated the feature, resolved validation, documented the run, and prepared the PR handoff.
- Product Agent: defined process-safe journal prompts from original scanner and plan context.
- Frontend Agent: mapped the lowest-risk implementation through mock order creation, local journal entries, and the existing journal side panel.
- QA Agent: identified the needed unit and e2e coverage, plus the remaining backend/schema persistence risk.

## What Changed

- Mock order creation now snapshots the originating workflow context into the journal entry: source page, source context, scanner context, thesis, and invalidation rule.
- Journal review now shows an `Original idea` block when context exists.
- The review panel creates process prompts from thesis, invalidation, scan match reason, planned R:R, setup tag, and data-as-of fields.
- Missing idea context now falls back quietly instead of pretending the system knows why a trade was taken.
- Simulated watchlist orders are labeled as `Watchlist plan` instead of being parsed as manual logs.
- Unit and mock e2e tests cover context capture, prompt generation, and the scanner idea to journal review flow.

## Why

The journal is more useful when it reviews the original decision, not just the final P&L. This makes AlphaVyuh feel like a trading process system: the scanner idea, watchlist plan, mock order, and review loop now carry the same context forward.

## What We Learned

- The current frontend/mock workflow can preserve rich idea context without a migration.
- Backend and Supabase persistence still need a structured context snapshot so live users do not lose the same metadata across real sessions.
- Review prompts must stay process-oriented; the wording avoids advice such as what a trader should buy, sell, or hold.
- Existing e2e coverage is strong enough to verify the full idea-to-journal loop once the context appears in the review panel.

## Improve Next

- Persist structured scanner and plan context in backend/Supabase journal rows.
- Add a compact review-completion flow that turns prompt answers into tagged lessons.
- Add analytics for how often traders open the original idea block and complete reviews after chart/mock orders.

## Validation

- `npm run lint`
- `npm run typecheck`
- `npm --prefix frontend run test -- --run`
- `npm run test:e2e:mock`
- `npm run test:e2e:layout`
- `npm run test:e2e:perf`
- `npm audit --audit-level=moderate`
- Browser smoke: `/journal` loaded in mock mode with no console/page errors.
