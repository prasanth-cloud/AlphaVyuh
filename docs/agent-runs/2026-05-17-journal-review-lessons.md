# Journal Review Lessons

Date: 2026-05-17
Branch: `codex/journal-review-lessons`
Issue: #124

## Agent Roster

- Manager: integrated the UI, mock/live save path, backend guardrail, tests, validation, and PR handoff.
- Product Agent Herschel: scoped the smallest useful review-completion workflow and safe process-focused copy.
- Frontend Agent Feynman: identified the low-risk path: reuse `lessons` as the reviewed marker and save through the existing journal PATCH API.
- QA Agent Kierkegaard: found the overwrite risk in auto lesson generation and defined save/reload/reviewed-state coverage.

## What Changed

- Closed unreviewed trades now show a compact manual `Lesson to carry forward` field in the trade panel.
- Saving a lesson marks the row as reviewed immediately and persists through mock/local reloads.
- Close-trade review copy now shows original idea context and uses process-focused labels like `What broke or changed?`.
- Mock journal update/lesson generation now persists local changes instead of always falling back to static demo rows.
- Generated trade lessons now reference original idea, exit reason, and mistake notes when available.
- Auto lesson generation no longer overwrites a trader's manually written lesson.
- Lesson generation fetches the updated journal row through the authenticated user's scope.

## Why

The journal should help traders improve, not just store P&L. This turns the original scanner/watchlist/chart idea into a completed review artifact: one saved lesson that can power review coverage, dashboard pulse, and future coaching.

## What We Learned

- The existing `lessons` field is enough for the first durable review-completion loop; no migration is needed.
- Manual lessons are more valuable than forcing an AI-generated paragraph, so the UI now makes manual review primary and generation secondary.
- The backend had a real overwrite risk: closing a trade with a user lesson could trigger auto-generation and replace it.
- The active mock e2e suite is the right browser gate for this workflow; the older standalone journal spec is a live-route harness and is not part of the current mock gate.

## Improve Next

- Add explicit `review_completed_at`, `idea_followed`, and `lesson_source` fields later if real traders need richer review analytics.
- Add a small weekly review screen that groups saved lessons into repeated behavior tags.
- Revisit mobile journal panel layout after founder feedback, because the table plus side panel is dense on smaller screens.

## Validation

- `npm run lint`
- `npm run typecheck`
- `npm --prefix frontend run test -- --run tests/unit/journal-review-context.test.ts`
- `npm --prefix frontend run test -- --run`
- `backend/.venv/bin/python -m pytest backend/tests/test_trade_analysis.py backend/tests/test_broker_order_safety.py`
- `backend/.venv/bin/python -m pytest backend/tests/test_trade_analysis.py backend/tests/test_broker_order_safety.py backend/tests/test_security_hardening.py`
- `npm --prefix frontend exec -- playwright test --config=frontend/playwright.mock.config.ts frontend/tests/e2e/workflow-mock.spec.ts --grep "journal review lesson"`
- `npm run test:e2e:mock`
- `npm run test:e2e:layout`
- `npm run test:e2e:perf`
- `npm audit --audit-level=moderate`
- `backend/.venv/bin/python -m pip_audit -r backend/requirements.txt`
- `git diff --check`

## Notes

- No Supabase migration is included in this slice.
- `npm run test:e2e:layout` initially collided with the parallel perf web server on port 3002; rerunning layout by itself passed.
