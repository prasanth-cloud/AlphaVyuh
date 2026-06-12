# Scanner UI Redesign Plan

Phased roadmap to evolve AlphaVyuh's scanner from a functional filter form into a professional terminal-grade screener — inspired by TradingView Screener, Bloomberg EQS, and TC2000 — without copying their clutter or neon overload.

**Status:** Phase 0 merged (PR #370). Phase 1 shipped in `feat/scanner-phase1-ui` (June 2026).

---

## Current pain points

| Area | Today | Trader impact |
|------|-------|---------------|
| Filter layout | Left column accordion; Technicals/Fundamentals tabs; dense seg buttons | Hard to scan EMA/trend rows; second wrapped row feels cramped |
| Results header | Many pills (source, coverage, scan time, plan cap, selection) in one toolbar | Visual noise competes with match count and primary actions |
| Density | `DataTable` list + optional `ScannerChartsPanel` grid | List is readable but not as information-dense as TV/Bloomberg |
| Column control | Columns picker + `SCANNER_COLUMN_DEFS` | Good foundation; no saved column presets per screen |
| Keyboard | Mouse-first; no row focus model | Slower for power users reviewing 50–200 matches |
| Trust copy | `scanTrust` pills + outage banners | Correct but duplicated across toolbar and table |
| Presets | Built-in presets + saved screens + composition | Powerful; catalog buried under "More screeners" |

### Reference patterns (what to learn)

**TradingView Screener**
- Filters grouped in a persistent left rail with clear section headers
- Results table is the hero: sortable columns, sticky symbol, compact numeric typography
- Column sets are first-class; filter chips summarize active criteria above results
- Chart grid is a mode switch, not a separate product

**Bloomberg EQS**
- Extreme information density in the results grid
- Keyboard navigation and column reorder are muscle-memory features
- Filters are structured fields, not decorative pills
- Color is functional (gain/loss, heat) not decorative

**TC2000**
- Watchlist/scanner continuity: scan → shortlist → chart review in one flow
- Clean toolbar: run, export, column presets
- Mini charts in grid view for pattern recognition at a glance

---

## What NOT to copy

- Neon accent overload, gradient headers, or "terminal cosplay" chrome
- 40+ visible filters at once without collapse (Bloomberg density without Bloomberg training)
- TradingView's social/community chrome inside the scanner workspace
- Duplicate filter UIs (top chips **and** left rail showing the same state)
- Auto-run on every filter twitch (latency + trust risk on EOD data)

---

## Tie-in to existing components

| Capability | Existing code | Redesign leverage |
|------------|---------------|-------------------|
| Results table | `DataTable`, `SCANNER_COLUMN_DEFS`, `formatScannerColumnValue` | Sticky symbol column, column presets, denser row height option |
| Chart grid | `ScannerChartsPanel`, `scanner-charts-grid-2-up` / `4-up` | Default 4-up for VCP review; link to `buildMultiChartReviewHref` |
| Trust / source | `scanTrust`, `scanner-data-trust`, `formatMarketDataSource` | Single trust strip; move meta pills out of primary toolbar |
| Saved screens | `getScreens`, `saveScreen`, composition in `scanner-composition.ts` | Saved column + filter bundles per screen |
| Workflow | `scanner-workflow.ts`, bulk actions in toolbar | TC2000-style shortlist queue surfaced beside results |
| Presets | `PRESETS` in `scanner/page.tsx` | Top-level preset chips (Momentum, VCP, etc.) like TV quick screens |
| API | `runScan` via `lib/api.ts` | No UI change needed; keep backend as source of truth |

---

## Phased roadmap

### Phase 0 — Quick wins (current PR)

**Goal:** Reduce friction without layout surgery.

- [x] Increase segment button gap / row-gap in Technicals filter rows (`scanner-filter-seg-options`)
- [x] Group toolbar actions (Create watchlist, Copy TV, Export CSV) with breathing room
- [x] Soften meta pills (source, coverage, scan time) via `scanner-meta-pill`
- [ ] Fix dashboard false empty state (separate PR scope: `dashboard/page.tsx` race timeout)

**PR slice:** `feat/scanner-ui-polish` — CSS + small JSX wrappers only.

---

### Phase 1 — MVP polish (1–2 PRs)

**Goal:** Scanner feels intentional and calm; matches ChartMaze/TV parity report gaps.

| Item | Recommendation | Status |
|------|----------------|--------|
| Active filter summary | Chip row above results: "EMA20 above · RS ≥ 70 · VCP" with clear dismiss | [x] `ScannerFilterChips.tsx`, `scanner-active-filters.ts` |
| Toolbar hierarchy | Primary: match count / view toggle / run context. Secondary: export, watchlist, History. Tertiary: meta trust | [x] `scanner-toolbar-primary/secondary/tertiary` |
| Section spacing | Uniform `scanner-filter-section` padding; default-open Price + Trend sections | [x] CSS + `Section` component |
| Mobile filter drawer | Bottom sheet or full-screen filter on `<820px` | [x] `scanner-filter-rail` drawer at 820px |
| Empty / error states | Align copy with trust invariants; link Data Status | [x] zero-result + pre-run copy |

**Acceptance:** Playwright `scanner-tv-table.spec.ts` and `workflow-mock.spec.ts` green; no regression in scan latency display.

---

### Phase 2 — Pro terminal feel (2–3 PRs)

**Goal:** Power-user density and keyboard flow.

| Item | Recommendation | PR estimate |
|------|----------------|-------------|
| Column presets | "Trader", "VCP", "Fundamentals" presets; persist per saved screen | 1 PR |
| Sticky results header | Symbol + Change % sticky; horizontal scroll for other columns | 1 PR |
| Keyboard nav | `j/k` row focus, `Enter` open chart, `Space` toggle select, `/` focus symbol filter | 1 PR |
| Row density toggle | Compact / comfortable row height (like Bloomberg compact mode) | 0.5 PR |
| Chart grid default | Remember last view (list vs charts) and layout (2-up vs 4-up) in session | 0.5 PR |

**Acceptance:** New e2e `scanner-keyboard-nav.spec.ts`; unit tests for column preset persistence.

---

### Phase 3 — Terminal parity (future)

**Goal:** Competitive with TV Screener for swing-trader daily workflow.

- Left filter rail resizable (drag handle); optional collapse to icon strip
- Multi-screen tab bar (saved screens as tabs, not only composition modal)
- Heatmap column optional (sector × change) using sector from results
- Real-time trust banner when `mode: live` vs `eod` (reuse `data-mode.ts` patterns)
- Scanner → watchlist handoff panel (selected symbols preview before bulk add)

**Not in scope until:** M4 live data posture is clear and scanner p95 latency budget confirmed (ADR 005/006).

---

## Layout recommendation

**Filters left, results right** (keep current 3-column desk on desktop).

Rationale:
- Matches TV Screener and TC2000 desktop patterns
- `scanner/page.tsx` already uses this; migration cost is lowest
- Top-only filters work on mobile but waste vertical space on 1440px trader monitors

**Change:** Move active-filter chips and trust strip **above** the results table, not inside the overflowing toolbar.

```
┌─────────────┬──────────────────────────────────────────┐
│ Presets     │  1,234 matches · [List|Charts] · filter  │
│ Saved       ├──────────────────────────────────────────┤
│ Technicals  │  [EMA20 above] [RS≥70] [VCP]  ← chips    │
│ Fundamentals│  Source: NSE bhavcopy · 2026-06-11       │
│ Run scan    ├──────────────────────────────────────────┤
│             │  Results table / chart grid              │
└─────────────┴──────────────────────────────────────────┘
```

---

## Color and contrast

- Keep `var(--text-primary)` / `var(--text-secondary)` / `var(--gain)` / `var(--loss)` tokens only (ADR 012)
- Active filter chips: `var(--accent-subtle)` border, not filled neon
- Results: `% change` uses gain/loss; indicators stay neutral gray until threshold (RS, ADX)
- Warnings (`incompleteIndicatorCount`, plan cap): `var(--warn)` — max one warn pill visible at a time in Phase 1

---

## PR slices (estimated)

| PR | Title | Files (approx) |
|----|-------|----------------|
| 1 | `fix: dashboard market snapshot load race` | `dashboard/page.tsx` |
| 2 | `style: scanner filter spacing and toolbar polish` | `scanner/page.tsx`, `globals.css` |
| 3 | `feat: scanner active filter chips` | `scanner/page.tsx`, new `ScannerFilterChips.tsx` |
| 4 | `feat: scanner column presets` | `scanner-result-columns.ts`, `scanner/page.tsx` |
| 5 | `feat: scanner keyboard navigation` | `scanner/page.tsx`, e2e spec |
| 6 | `feat: scanner mobile filter drawer` | `scanner/page.tsx`, `globals.css` |

---

## Success metrics

- Dashboard: zero reports of "Market data is not connected" when Railway `/api/v1/market/summary` is healthy
- Scanner: qualitative — founder review against TV Screener side-by-side screenshot
- Quantitative: scan → chart → watchlist e2e path under 60s on mock; no increase in scanner p95 on production benchmark

---

## Related docs

- `frontend/docs/qa-tv-polish-report.md`
- `frontend/docs/qa-chartmaze-parity-report.md`
- `docs/decisions/012-design-system.md`
- Trust invariants: `.cursor/rules/trust-invariants.mdc`
