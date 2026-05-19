# Platform Quality Copy and Roadmap - 2026-05-19

## Confirmed Direction

The cleanup target is production-grade trader trust, not a visible product label.
AlphaVyuh should read and behave like a serious trading workflow platform
without using "Professional Access" as customer-facing branding.

## Current Audit

| Area | Current evidence | Status |
|---|---|---|
| Public and signed-in copy | Landing, login, access, onboarding, settings, invite email, and operator Mission Control still used the old access label. | Fixed in this slice. |
| Copy guardrails | The public posture checker required the old label, so it would preserve the wrong direction. | Fixed in this slice. |
| Production data | Supabase EOD rows are present for 2026-05-19, but Railway backend recovery remains owner-gated. | Blocked. |
| Dashboard/scanner data trust | Existing launch checks prove deterministic checker shape, but live dashboard/scanner proof still depends on Railway recovery. | Needs post-recovery smoke. |
| Watchlist and chart workflow | Current app has watchlist, chart context, indicators, drawing tools, and tests, but TradingView-level polish needs a dedicated UI/performance pass. | Next phase. |
| Broker integration | Kite and Upstox adapter/test surfaces exist; read-only smoke and real broker validation remain owner-token gated. | Needs hardening after recovery. |
| Trade report analytics | Journal analytics exist, but broker report upload parsing and normalized analytics are not complete platform features yet. | Future phase. |

## This Slice

- Removed visible old access branding from active public, auth, app, operator,
  and invite-email surfaces.
- Changed public and signed-in copy posture tests so they reject that branding
  returning.
- Preserved serious trader positioning, EOD data honesty, broker import limits,
  billing gating, and no-advice posture.

## Execution Plan

1. Recover and verify production Railway API so dashboard, scanner, watchlist,
   and charts can prove real data end to end.
2. Add strict dashboard/scanner data-quality checks: freshness, coverage,
   empty/error states, no silent mock fallback, and user-visible source context.
3. Upgrade dashboard and scanner workflows around trader decisions: saved scans,
   clearer ranking, watchlist handoff, sector/RS context, and actionable error
   recovery.
4. Improve watchlist UX for repeated daily use: symbol groups, setup status,
   price/volume movement, notes, alerts, sector tags, and chart/journal context.
5. Improve chart analysis toward TradingView-style usability: fast symbol search,
   stable timeframe/indicator controls, drawing persistence, layout density,
   keyboard shortcuts, and reliable candle availability.
6. Harden broker integrations with read-only account validation, filled-trade
   import, positions/order history where supported, and strict execution gates.
7. Add trade report upload: broker-specific parsers, safe file handling,
   normalized trades, import review, duplicate detection, and error reports.
8. Build trader analytics that make AlphaVyuh sticky: P&L, win rate,
   expectancy, drawdown, R-multiple, holding time, symbol/sector performance,
   setup tags, mistake patterns, and weekly review insights.

## Differentiators To Prioritize

- A visible data-trust bar on every trading surface: source, date, coverage,
  freshness, and degraded-state reason.
- A single setup timeline from scanner result -> watchlist plan -> chart notes
  -> broker trade/import -> journal review.
- Trade report upload that turns broker exports into plain-language lessons,
  not just tables.
- Scanner-to-watchlist workflow with repeatable presets and saved review states.
- Review analytics that identify behavior patterns: cutting winners early,
  oversized losers, weak setups, poor holding periods, and sector concentration.
- Broker integration that starts safely with import/read-only analysis and only
  enables execution after explicit owner-approved validation.

## Remaining Blocker

Production data recovery is still incomplete until Railway credentials/secrets
are provided and the backend API is restored. Do not mark the overall goal
complete until live production data and signed-in browser recovery are verified.
