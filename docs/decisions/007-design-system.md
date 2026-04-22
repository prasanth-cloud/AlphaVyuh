# ADR 007 — Authenticated-Screen Design System

**Status:** Accepted  
**Date:** 2026-04-22  
**Author:** Product team  
**Scope:** Authenticated screens only (`app/(app)/`). Marketing/landing (`app/(marketing)/`, `app/page.tsx`) is explicitly excluded and retains the editorial aesthetic.

---

## Context

The current authenticated screens share a visual language with the marketing site: large hero blocks with editorial headlines, gradient-heavy panels at `border-radius: 24px`, and decorative uppercase "workspace" labels ("SCANNER WORKSPACE", "MARKET OVERVIEW"). That language is correct on the landing page — selling strangers requires hierarchy and drama. It is wrong inside the product — users who are already logged in are professionals at work. They don't need to be told what the Scanner does.

The design-tokens.css file (`frontend/app/design-tokens.css`) already encodes a solid dark system: emerald accent `#56D7C1`, four text levels, four surface levels, a 4px spacing grid, and a type scale anchored at 13px body. The tokens are right. What's wrong is how the screen-level components use them.

This ADR locks the authenticated-screen design principles before Phase 2B implements them.

---

## Studied references

### TradingView (chart and screener pages)
- No page-level headline. The screener opens directly into the filter sidebar + result table.
- Panel borders are 1px `rgba(255,255,255,0.09)` — no shadows, no glows.
- Table rows: ~36px height, 8px vertical padding, 1px bottom border.
- Accent is a single blue. Used on active states, selected rows, interactive chips. Not on text.
- All numeric columns use tabular numerals. Alignment across rows is perfect.
- Empty states are minimal: small icon, one-line label, optional CTA. No paragraphs.

### Zerodha Kite
- Left sidebar with symbol/instrument search. Chart at ~75% viewport width. Right panel for order entry.
- Watchlist rows: 32-36px. Symbol left-aligned, price right-aligned, change % right-aligned.
- Color: green/red only for P&L. No decorative color usage.
- No hero blocks anywhere in the product.

### What we keep vs. what's different
- **Keep from TradingView:** density targets, border-only elevation, table row height, accent discipline.
- **Keep from Kite:** watchlist layout (sidebar + dominant chart), color discipline.
- **Different from both:** our emerald accent `#56D7C1` is unique to AlphaVyuh. TradingView uses blue; Kite uses blue-green. We keep emerald as the single brand differentiator.

---

## Principles

### 1. Authenticated screens are workspaces, not marketing
No hero headlines. No editorial subtitles explaining what a screen does. The user knows. Any context that genuinely belongs on the page (date range, filter summary, action buttons) goes in a single compact **status bar** (max height 44px), not a hero block.

Exception: first-time-user state. A user who has never created a watchlist sees a minimal contextual banner — one sentence, one action, dismissible. This is not a hero block; it is an empty-state nudge. It disappears after the first action and never reappears.

### 2. Information density is a first-class value
Target: scanner and journal table rows at **36–40px**. Current: ~64–80px (due to two-line symbol cells, large vertical padding, and `card` wrappers around table rows). We accept that dense screens require deliberate attention; we do not add padding to compensate for cognitive complexity.

At 1440×900 (the common laptop resolution): overhead is ~168px (nav 72px + top padding 24px + status bar 44px + gap 16px + table header 32px), leaving ~732px for rows. At 36px rows: **~20 results visible without scrolling**, vs. ~11 today. That is a real productivity gain on a 15" laptop.

### 3. Chart-first on the chart-containing screen
On the watchlist screen (which contains an inline chart): the chart occupies **≥70% of viewport width**. The watchlist collapses to a sidebar. The order-entry panel slides in from the right only when a buy/sell action begins — never occupying space at rest.

### 4. Brand identity is preserved
- Emerald accent `#56D7C1` is the single AlphaVyuh color. Used only for: interactive states (active nav link, selected row, pressed chip, focused input border), brand mark, and links.
- Do not use `#56D7C1` for "success" states. That is `--gain: #2DB574`. They are distinct.
- Dark palette, Inter typography, JetBrains Mono for all numerics.

### 5. Dark mode only for MVP
Light mode is v2. We do not add `@media (prefers-color-scheme: light)` rules or Tailwind `dark:` variants in MVP. When light mode ships, the token system will support it with CSS variable overrides — no component markup changes required.

---

## Color tokens

All tokens are defined in `frontend/app/design-tokens.css` (CSS custom properties) and mirrored in `frontend/tailwind.config.ts` under `theme.extend.colors` with a `ds-` prefix to avoid collision with shadcn.

### Surfaces

| Token | Value | Usage |
|-------|-------|-------|
| `--surface-0` | `#0B0D11` | Page background |
| `--surface-1` | `#12151C` | Panels, cards |
| `--surface-2` | `#1A1E27` | Nested elements, filter sidebar |
| `--surface-3` | `#232833` | Active, selected, hover states |
| `--surface-float` | `#1E222C` | Dropdowns, modals, tooltips |

### Text

| Token | Value | Usage |
|-------|-------|-------|
| `--text-primary` | `#F5F3EE` | Headlines, primary data |
| `--text-secondary` | `#CAC4B8` | Body, secondary data, labels |
| `--text-tertiary` | `#9F988C` | Captions, metadata, placeholders |
| `--text-disabled` | `#6F6A61` | Disabled states only |

### Borders

| Token | Value | Usage |
|-------|-------|-------|
| `--border-subtle` | `rgba(255,255,255,0.06)` | Table row dividers, inner card borders |
| `--border-default` | `rgba(255,255,255,0.09)` | Panel borders, input borders |
| `--border-strong` | `rgba(255,255,255,0.14)` | Hover borders, focused sections |
| `--border-focus` | `rgba(86,215,193,0.40)` | Input focus ring |

### Accent

| Token | Value | Usage |
|-------|-------|-------|
| `--accent` | `#56D7C1` | Active nav, selected rows, interactive chips, links |
| `--accent-hover` | `#6FE3CF` | Hover state on accent-colored elements |
| `--accent-subtle` | `rgba(86,215,193,0.10)` | Active chip background, selected row bg |
| `--accent-muted` | `rgba(86,215,193,0.18)` | Text selection highlight, badge background |
| `--accent-strong` | `#8CF0E1` | Pressed state |

### Semantic (P&L only — never decorative)

| Token | Value | Usage |
|-------|-------|-------|
| `--gain` | `#2DB574` | Positive P&L, advances, up moves |
| `--gain-subtle` | `rgba(45,181,116,0.10)` | Gain cell background |
| `--loss` | `#E15560` | Negative P&L, declines, down moves |
| `--loss-subtle` | `rgba(225,85,96,0.10)` | Loss cell background |
| `--warn` | `#E8A33B` | Caution, plan-limit chips, marginal states |
| `--warn-subtle` | `rgba(232,163,59,0.10)` | Warning chip background |
| `--info` | `#5A8BE8` | Informational badges, links (non-brand) |
| `--info-subtle` | `rgba(90,139,232,0.10)` | Info chip background |

### WCAG AA contrast verification

All ratios measured against `--surface-0: #0B0D11` (luminance ≈ 0.0017) and `--surface-1: #12151C` (luminance ≈ 0.0049). Minimum threshold for body text: **4.5:1**.

| Foreground | Background | Ratio | AA body text | Notes |
|------------|------------|-------|--------------|-------|
| `--text-primary #F5F3EE` | `--surface-0 #0B0D11` | **18.6:1** | ✅ AAA | |
| `--text-primary #F5F3EE` | `--surface-1 #12151C` | **16.8:1** | ✅ AAA | |
| `--text-secondary #CAC4B8` | `--surface-0 #0B0D11` | **11.7:1** | ✅ AAA | |
| `--text-secondary #CAC4B8` | `--surface-1 #12151C` | **10.6:1** | ✅ AAA | |
| `--text-tertiary #9F988C` | `--surface-0 #0B0D11` | **7.2:1** | ✅ AA+ | |
| `--text-tertiary #9F988C` | `--surface-1 #12151C` | **6.5:1** | ✅ AA+ | |
| `--text-tertiary #9F988C` | `--surface-2 #1A1E27` | **5.6:1** | ✅ AA | Minimum passing |
| `--accent #56D7C1` | `--surface-0 #0B0D11` | **12.0:1** | ✅ AAA | |
| `--gain #2DB574` | `--surface-0 #0B0D11` | **7.1:1** | ✅ AA+ | |
| `--loss #E15560` | `--surface-0 #0B0D11` | **5.2:1** | ✅ AA | |
| `--warn #E8A33B` | `--surface-0 #0B0D11` | **8.4:1** | ✅ AA+ | |
| `--text-disabled #6F6A61` | `--surface-0 #0B0D11` | **3.9:1** | ⚠️ fail | Disabled only; not body text per WCAG exception |

**All body text pairs pass WCAG AA (4.5:1 minimum). No blocker.**

The `--text-disabled` value (3.9:1) is intentionally below the body text threshold — WCAG 2.1 §1.4.3 explicitly exempts disabled UI components from the contrast requirement.

---

## Typography

### Font stack
```css
--font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
--font-mono: 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace;
```

Inter is loaded via `next/font/google` in `frontend/app/layout.tsx`. JetBrains Mono is loaded via the same mechanism. Both use `display: swap`.

### Type scale (authenticated screens use 5 sizes)

| Token | Size | Usage |
|-------|------|-------|
| `--text-2xs` | 10px | UPPERCASE micro-labels (nav active indicator, filter section headers). Sparingly. |
| `--text-xs` | 11px | Captions, timestamps, table metadata |
| `--text-sm` | 12px | Dense table cells, secondary body, chip text |
| `--text-base` | 13px | Primary body, default table cell text |
| `--text-md` | 15px | Card titles, section headers |
| `--text-xl` | 22px | Page title in compact status bar (one per page, used only when genuinely needed) |
| `--text-2xl` | 28px | Marketing / landing only. Not used in authenticated screens. |

### Tabular numerals — non-negotiable

All numeric data must use tabular numerals. Implementation:

```css
/* Already defined in globals.css */
.mono, .num, [data-num] {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum' on;
}
```

Apply the `.mono` class to every price, percentage, volume, P&L value, ratio, and count in tables. This fixes decimal-point alignment across rows. No exceptions.

Tailwind utility: `font-mono tabular-nums` — equivalent and preferred in new components.

### Uppercase labels — only for micro-labels, not screen titles

Uppercase `letter-spacing: 0.10em` is permitted only for:
- Filter section headers in a sidebar (e.g., "PRICE & CHANGE")
- Nav active indicator micro-text
- `<10px` status chips with a single word

Uppercase is **banned** for:
- Page-level labels ("SCANNER WORKSPACE", "MARKET OVERVIEW", "TRADING JOURNAL")
- Any text at `--text-base` or larger

---

## Layout patterns

### Top nav bar
The existing `.app-topbar` shape is correct. Changes only:
- Remove "TRADING OPERATING SYSTEM" from under the logo on authenticated screens. The tagline belongs on the landing page. Inside the app, it's noise.
- Nav link font size stays 12px. No change.
- Market status pill (`● NSE CLOSED`) stays — this is useful information, not decoration.

### Page body — no hero block
Each authenticated page opens directly into its working view. If a page needs a single line of context (e.g., "EOD 2026-04-19 · 3,046 stocks"), it goes in a **compact status bar**:

```
┌─────────────────────────────────────────────────────┐
│ [page title 15px]    [context]    [action buttons]  │  ← max 44px tall
└─────────────────────────────────────────────────────┘
[Working content immediately below]
```

No gradient backgrounds on this bar. `background: var(--surface-1)`, `border-bottom: 1px solid var(--border-subtle)`.

### Table density

| Property | Current | Target |
|----------|---------|--------|
| Row height | ~64–80px | 36–40px |
| Vertical padding | 14–20px | 6–8px |
| Row border | 1px subtle ✓ | 1px subtle |
| Hover background | `var(--surface-3)` ✓ | `var(--surface-3)` |
| Font size | 12–13px ✓ | 12–13px |
| Two-line symbol cells | symbol + company name stacked | Keep — still fits in 36px with 12/11px |

A 36px row with 6px vertical padding and 13px text (20px line height) works: 6 + 20 + 10 (company name 10px) + gap = ~36px.

### Card density

| Property | Current | Target |
|----------|---------|--------|
| Panel border-radius | 24px | 8px (`--radius-lg`) |
| Card padding | 20–24px | 12–16px |
| Stat card height | ~80–100px | 52–60px |
| Box shadow | `var(--shadow-panel)` (large) | `border: 1px solid var(--border-default)` only |

Shadows imply floating elements. On a workspace screen where panels tile the viewport, shadows create visual noise. Borders are sufficient.

---

## Component patterns

### Button
```
Primary:   bg var(--accent), text #04120d (dark on teal), border none, radius 6px, height 32px, px 14px, font-size 12px weight 600
Secondary: bg var(--surface-2), text var(--text-secondary), border 1px var(--border-default), same geometry
Ghost:     bg transparent, text var(--text-secondary), border 1px var(--border-subtle), same geometry
Danger:    bg var(--loss-subtle), text var(--loss), border 1px rgba(225,85,96,0.25)

Hover: all buttons → background brightens one surface step, text-primary
Active/pressed: background darkens, slight scale(0.98)
Disabled: opacity 0.4, cursor not-allowed
Loading: spinner replaces icon slot, text unchanged, pointer-events none
```

### Input / Textarea
```
bg: var(--surface-2)
border: 1px solid var(--border-default)
border-radius: var(--radius-md) = 6px
height: 32px (input), auto (textarea)
padding: 0 10px
font-size: 13px
color: var(--text-primary)
placeholder: var(--text-disabled)

focus: border-color var(--border-focus), box-shadow 0 0 0 3px var(--accent-subtle)
```

### Select / Dropdown trigger
Same geometry as Input. Dropdown panel: `background: var(--surface-float)`, `border: 1px solid var(--border-default)`, `border-radius: var(--radius-lg)`, `box-shadow: var(--shadow-dropdown)`.

### Table
```
<table> — width 100%, border-collapse collapse

thead:
  background: var(--surface-1)
  th: font-size 11px, weight 600, color var(--text-tertiary), uppercase, letter-spacing 0.06em
      padding 6px 10px, text-align per column (numbers right-aligned)
      border-bottom: 1px solid var(--border-default)
  position: sticky top: 0

tbody:
  tr: border-bottom 1px solid var(--border-subtle), height 36-40px
  tr:hover: background var(--surface-3)
  tr[data-selected]: background var(--accent-subtle), border-left 2px solid var(--accent)
  td: font-size 12-13px, padding 6px 10px
  td[data-num]: font-family mono, font-variant-numeric tabular-nums

No shadow. No card wrapper. Table is full-width in its panel.
```

### Stat card
```
Container: bg var(--surface-1), border 1px solid var(--border-default), border-radius var(--radius-lg)
Padding: 10px 14px (NOT 20-24px)
Layout: single row — label left, value right, OR label top + value large bottom
Label: font-size 11px, color var(--text-tertiary)
Value: font-size 18-22px, weight 600, font-mono, tabular-nums
Delta: font-size 11px, color var(--gain) or var(--loss)
Min-height: ~52px
```

### Chip / pill (filters, tags, status)
```
Default:  bg transparent, border 1px var(--border-subtle), text var(--text-secondary), radius 4px, height 24px, px 8px, font-size 11px
Active:   bg var(--accent-subtle), border var(--accent), text var(--accent)
Hover:    border var(--border-strong), text var(--text-primary)
Danger:   bg var(--loss-subtle), border rgba(225,85,96,0.25), text var(--loss)
Warn:     bg var(--warn-subtle), border rgba(232,163,59,0.25), text var(--warn)
```

### Status indicator
`● NSE CLOSED` pattern — keep as-is. It provides useful real-time context. Implementation:
```
● (U+25CF, 8px) in var(--gain) if market open, var(--text-tertiary) if closed
text: font-size 11px, font-weight 600, letter-spacing 0.06em, uppercase
color of text matches dot
```

### Error banner
```
Container: horizontal flex, padding 10px 14px, border-radius var(--radius-md)
Background: var(--loss-subtle)
Border: 1px solid rgba(225,85,96,0.20)
Icon: optional, 14px, color var(--loss)
Text: font-size 12px, color var(--loss), flex-1
CTA: "Retry" link, font-size 12px, color var(--accent), cursor pointer
Max one sentence. No multi-paragraph error explanations.
```

### Empty state
```
Container: centered in parent, max-width 360px
Icon: 24px, color var(--text-disabled)
Title: font-size 14px, weight 500, color var(--text-secondary), margin-top 12px
Description: font-size 12px, color var(--text-tertiary), margin-top 4px, max 2 lines
CTA (optional): ghost button, margin-top 16px
```

No decorative illustrations. No large icon. No multi-paragraph descriptions.

---

## What we explicitly reject

| Rejected pattern | Reason |
|-----------------|--------|
| Hero headlines on authenticated screens | Treats the user as a visitor, not an operator |
| Editorial subtitles explaining what a screen does | Same |
| Uppercase workspace tags at body size | Marketing pattern; adds no information |
| `border-radius > 8px` on panels | Panels that tile the viewport look cartoonish with large radii |
| `box-shadow` on panels (except modals, dropdowns) | Creates false elevation hierarchy; borders are sufficient |
| Gradient backgrounds on authenticated **panels** | Decorative; hurts text legibility on nested elements. Exception: the ambient body-level `radial-gradient` on `body` and `.app-shell::before` (globals.css) is a permitted page-background effect — subtle, behind all content, not inside panels. |
| Accent color for decorative purposes | Accent is interactive signal only; overuse dilutes it |
| Emerald for "success" states | `--gain: #2DB574` is bullish/success. `--accent: #56D7C1` is interactive. They must stay distinct. |
| Padding > 16px on authenticated panel interiors | Wastes vertical space on compact screens |
| Light mode in MVP | Deferred to v2 |

---

## Tailwind config additions

Add to `frontend/tailwind.config.ts` under `theme.extend.colors`:

```ts
// Design System (ds-) prefix to coexist with shadcn tokens
"ds-bg":        "var(--surface-0)",
"ds-surface":   "var(--surface-1)",
"ds-surface2":  "var(--surface-2)",
"ds-surface3":  "var(--surface-3)",
"ds-float":     "var(--surface-float)",
"ds-border":    "var(--border-default)",
"ds-border-sub":"var(--border-subtle)",
"ds-border-str":"var(--border-strong)",
"ds-t1":        "var(--text-primary)",
"ds-t2":        "var(--text-secondary)",
"ds-t3":        "var(--text-tertiary)",
"ds-accent":    "var(--accent)",
"ds-accent-bg": "var(--accent-subtle)",
"ds-gain":      "var(--gain)",
"ds-gain-bg":   "var(--gain-subtle)",
"ds-loss":      "var(--loss)",
"ds-loss-bg":   "var(--loss-subtle)",
"ds-warn":      "var(--warn)",
"ds-warn-bg":   "var(--warn-subtle)",
```

These let Phase 2B use `bg-ds-surface border-ds-border text-ds-t2` in Tailwind class strings, while keeping inline `style={{ color: 'var(--text-secondary)' }}` working unchanged.

---

## Open questions and decisions

### Q: Is "no hero blocks" too strict for onboarding?
**Decision:** No. First-time users see a minimal contextual banner (one sentence + one action, dismissible). It is not a hero block — it has no headline, no gradient, no padding extravagance. Once dismissed or after first action, it never reappears. See §Principles above.

### Q: How does density work at 1440×900?
**Decision:** 1440×900 is our primary laptop target. Overhead breakdown: nav 72px + top padding 24px + status bar 44px + table header 32px + gaps 16px = 188px. Remaining: ~712px. At 36px rows: **~20 rows visible without scroll** (up from ~11 today). Stat cards at 52px height fit 4 across with 12px gaps. Verified in the style guide page.

Note: `design-tokens.css` defines `--nav-height: 52px` but `.app-topbar-inner` in globals.css has `min-height: 72px`. Phase 2B should either reduce the topbar to 52px (update the CSS) or update the `--nav-height` token to 72px. Both density estimates above use the actual 72px.

### Q: What breaks when light mode is added in v2?
**Decision:** The token system is designed for this. All colors are CSS custom properties. Light mode overrides the `:root` values inside a `[data-theme="light"]` selector or `@media (prefers-color-scheme: light)` block. No component markup changes are needed. The Tailwind `ds-*` tokens reference the CSS variables, so they flip automatically.

**Tech debt rule for Phase 2B:** Inline `rgba(255,255,255,*)` values are **banned** in new component code. Always use the CSS variable (`var(--border-subtle)`, `var(--border-default)`) which will flip correctly in v2. Inline hardcoded alpha values bypass the token system and grow the v2 migration scope. This applies to both `style={{}}` props and CSS class strings.

---

## References

- `frontend/app/design-tokens.css` — source of truth for all tokens
- `frontend/tailwind.config.ts` — Tailwind integration
- `frontend/app/globals.css` — typography utility classes, app shell CSS
- `docs/decisions/005-scan-engine.md` — scan architecture (context for scanner density)
- `docs/decisions/006-m3-filter-scope.md` — filter scope decisions
