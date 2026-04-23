# ADR 012 — Design System

**Status:** Accepted — supersedes ADR 007 (authenticated-screen design only)  
**Date:** 2026-04-23  
**Scope:** All alphavyuh surfaces — authenticated product screens (`app/(app)/`) and marketing/landing (`app/(marketing)/`, `app/page.tsx`). ADR 007 remains valid for implementation-level token details; this ADR is the governing authority on design decisions.

---

## Relationship to ADR 007

ADR 007 (2026-04-22) established color tokens, typography, and component patterns for authenticated screens. It is correct on those specifics and is not being contradicted. ADR 012 adds what ADR 007 omitted: a design philosophy statement, iconography rules, motion rules, explicit landing-page rules, and an expanded reject list. When ADR 007 and ADR 012 conflict, ADR 012 governs.

---

## 1. Design philosophy

alphavyuh is a trader's terminal. Every authenticated screen is designed for someone who is **already at work** — someone who knows what a VCP setup is, already has a watchlist, and came here to make a decision, not to be onboarded. The product must immediately feel like a serious tool in the hands of a serious user.

The visual position in concrete terms: 20 scanner results visible on a 1440×900 laptop screen without scrolling (vs. ~11 today); table rows at 36–40px; no surface padding exceeding 16px; zero decorative elements. That is the density benchmark. The visual discipline benchmark: every element on an authenticated screen must answer "yes" to the question "does this help the user make a faster or more accurate decision?" Color usage is binary — gain/loss for financial direction, accent for interactive elements, nothing else. The failure modes we avoid: Tickertape's marketing-forward authenticated screens (stat cards at 80px+, section headers in 24px type, promotional copy on screens the user sees every day); generic SaaS dashboards (empty states with illustration SVGs, padding that wastes 40% of available vertical space); Bloomberg density theater (maximum data with minimum organization — density without comprehension hierarchy).

**The acid test:** if a screenshot of an authenticated screen could plausibly belong to a travel-management SaaS, a project-management tool, or a bank's consumer app, it is wrong. alphavyuh screens should be immediately identifiable as a trading tool for someone who runs systematic scans.

---

## 2. Color tokens

All tokens are CSS custom properties defined in `frontend/app/design-tokens.css`. Tailwind access via `ds-*` prefix in `tailwind.config.ts`.

**Token system philosophy:** Tokens are **semantic**, not named-by-color. The token `--gain` means "bullish movement or positive P&L" — it does not mean "green." The token `--accent` means "interactive, belongs to AlphaVyuh" — it does not mean "teal." This matters for v2 light mode: CSS variable overrides can re-map `--accent` to a different hex without touching a single component.

### Surfaces (dark hierarchy)

| Token | Hex | Usage |
|-------|-----|-------|
| `--surface-0` | `#0B0D11` | Page background — the floor |
| `--surface-1` | `#12151C` | Panels, cards, sidebar |
| `--surface-2` | `#1A1E27` | Nested elements, filter sections, input backgrounds |
| `--surface-3` | `#232833` | Active states, selected rows, hover backgrounds |
| `--surface-float` | `#1E222C` | Dropdowns, modals, tooltips — elevated above surface-1 |

Rule: panels tile the viewport; they never float above each other in Z. Only dropdowns, modals, and tooltips use `--surface-float`. Panel elevation is expressed by borders, not shadows.

### Text (4 levels only — do not add a fifth)

| Token | Hex | Usage |
|-------|-----|-------|
| `--text-primary` | `#F5F3EE` | Headlines, primary data values |
| `--text-secondary` | `#CAC4B8` | Body, secondary data, form labels |
| `--text-tertiary` | `#9F988C` | Captions, timestamps, table column headers, placeholders |
| `--text-disabled` | `#6F6A61` | Disabled form elements only — never used for readable content |

The four-level system is intentional. Adding a fifth text level is a symptom of over-designing hierarchy. If a designer reaches for a fifth level, the problem is layout, not color.

### Borders

| Token | Value | Usage |
|-------|-------|-------|
| `--border-subtle` | `rgba(255,255,255,0.06)` | Table row dividers, inner card borders |
| `--border-default` | `rgba(255,255,255,0.09)` | Panel borders, input borders at rest |
| `--border-strong` | `rgba(255,255,255,0.14)` | Hover borders, focused panels |
| `--border-focus` | `rgba(86,215,193,0.40)` | Input focus ring — the only border that references the accent color |

Borders use alpha-on-white (not alpha-on-black) so they remain visible on any surface level without per-surface override. Do **not** hardcode `rgba(255,255,255,*)` in component code — always reference the token. Light mode will swap `:root` variable values; hardcoded alpha-on-white values will not flip.

### Accent (one brand color)

| Token | Value | Usage |
|-------|-------|-------|
| `--accent` | `#56D7C1` | Active nav, selected table row, pressed chip, focused input ring, links |
| `--accent-hover` | `#6FE3CF` | Hover state on accent-colored interactive elements |
| `--accent-subtle` | `rgba(86,215,193,0.10)` | Active chip/row background, selected state fill |
| `--accent-muted` | `rgba(86,215,193,0.18)` | Text selection highlight, badge background |
| `--accent-strong` | `#8CF0E1` | Pressed/active confirmation state |

The emerald `#56D7C1` is the single AlphaVyuh color. It means "this element is interactive and responds to you." It does **not** mean "success." Do not use it for non-interactive decoration. Do not use it for gain/loss states (those use `--gain` and `--loss`). Overuse destroys the signal.

| Token | Value | Usage |
|-------|-------|-------|
| `--text-on-accent` | `#04120d` | Text rendered directly on `var(--accent)` backgrounds (primary buttons, active chips). This is the only hex value that does not need a CSS-variable equivalent because it is tied to the specific contrast ratio of the accent color — update it in lockstep if `--accent` changes. |

**Note on accent-derived rgba tokens:** `--accent-subtle`, `--accent-muted`, `--accent-strong`, and `--border-focus` hardcode the RGB triple `86, 215, 193` (the decimal expansion of `#56D7C1`) in rgba() values. CSS does not yet support `rgba(var(--accent), 0.10)` in all targets. When `--accent` changes in v2, these four tokens **must also be updated manually** in `design-tokens.css`. They are listed together here so the lockstep requirement is explicit. Future enhancement: when browser support for `rgb(from var(--accent) r g b / alpha)` relative color syntax is reliable across all supported browsers (currently ~90% globally), migrate these tokens to that syntax to eliminate the manual update requirement.

### Semantic (P&L states — not decorative)

| Token | Value | Usage |
|-------|-------|-------|
| `--gain` | `#2DB574` | Positive P&L, advancing price, bullish signals |
| `--gain-subtle` | `rgba(45,181,116,0.10)` | Gain cell background |
| `--loss` | `#E15560` | Negative P&L, declining price, bearish signals |
| `--loss-subtle` | `rgba(225,85,96,0.10)` | Loss cell background |
| `--warn` | `#E8A33B` | Plan limits, marginal scanner results, caution states |
| `--warn-subtle` | `rgba(232,163,59,0.10)` | Warning chip background |
| `--info` | `#5A8BE8` | Non-interactive series/exchange badges only: "EQ", "NSE", "BSE", "F&O". No other use. |
| `--info-subtle` | `rgba(90,139,232,0.10)` | Info badge background |

`--info` is **not** a general-purpose informational color. Permitted uses are exhausted by the exchange/series badge pattern. Do not use it for tooltips, info banners, links, or any interactive element. When a feature needs a non-financial status color that doesn't map to `--warn`, use `--text-tertiary` instead of reaching for `--info`.

`--gain` and `--loss` are strictly directional. A "success" toast for a non-financial action (e.g., "Watchlist saved") does not use `--gain`. It uses `--text-primary` or `--accent`. Financial direction color applied to non-financial outcomes is misleading.

### Shadow (permitted elevations only)

Shadows are banned on workspace panels. They are permitted only for floating elements: dropdowns, modals, and tooltips. These are the only defined shadow values:

| Token | Value | Usage |
|-------|-------|-------|
| `--shadow-dropdown` | `0 4px 16px rgba(0,0,0,0.40), 0 1px 4px rgba(0,0,0,0.24)` | Select dropdowns, command palettes |
| `--shadow-modal` | `0 8px 32px rgba(0,0,0,0.56), 0 2px 8px rgba(0,0,0,0.32)` | Modal dialogs |

Do not create additional shadow tokens. If a new element needs elevation, use a border (`var(--border-default)`) and a surface step up (`var(--surface-float)`) before reaching for a shadow.

### WCAG AA status (verified against `--surface-0`)

All body text pairs pass 4.5:1. `--text-disabled` (3.9:1) is exempt per WCAG 2.1 §1.4.3. Full contrast table in ADR 007 §Color tokens.

---

## 3. Typography

### Font stack

```css
--font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
--font-mono: 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace;
```

Both fonts loaded via `next/font/google` in `frontend/app/layout.tsx` with `display: swap`. Inter carries all interface text. JetBrains Mono carries all numeric data.

### Type scale

| Token | Size | Typical weight | Usage |
|-------|------|----------------|-------|
| `--text-2xs` | 10px | 600 | Micro-labels only (uppercase, 0.10em tracking). Maximum one per section. |
| `--text-xs` | 11px | 400–500 | Captions, timestamps, chip text |
| `--text-sm` | 12px | 400–500 | Dense table cells, secondary body |
| `--text-base` | 13px | 400 | Primary body — the default. Everything unspecified falls here. |
| `--text-md` | 15px | 500–600 | Card titles, status bar labels |
| `--text-xl` | 22px | 600 | Page titles in compact status bars (one per page, only when page identity is genuinely ambiguous) |
| `--text-2xl` | 28px | 700 | Landing page / marketing only. Banned on authenticated screens. |

Weights used: 400 (regular), 500 (medium), 600 (semibold). Weight 700 is landing-page only. Three weights is enough.

### Tabular numerals — non-negotiable rule

Every price, volume, percentage, P&L value, ratio, count, and quantity displayed in a table column, stat card, or data field **must** use tabular (monospaced) numerals. Proportional numerals in data columns cause decimal misalignment across rows, which requires extra cognitive parsing.

Implementation:

```css
/* globals.css — already defined */
.mono, .num, [data-num] {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum' on;
}
```

In Tailwind: `font-mono tabular-nums` on every `<td>`, `<span>`, or `<div>` that renders a number in a vertically repeating context.

Interface text (button labels, nav links, form labels, chip text, error messages) uses proportional `--font-sans`. There is no circumstance where interface text needs tabular numerals.

### Uppercase labels — narrow permission

Uppercase with `letter-spacing: 0.10em` is permitted **only** for:
- Table column headers (`<th>`) at `--text-xs` (11px)
- Filter section dividers in a sidebar at `--text-2xs` (10px)
- Single-word status badges with no adjacent body text

Uppercase is **banned** for:
- Page-level labels ("SCANNER WORKSPACE", "TRADING JOURNAL") at any size
- Any text at `--text-base` (13px) or larger
- Multi-word section titles anywhere

Uppercase signals "this is chrome, not content." Using it on content-level titles inverts that signal.

---

## 4. Spacing and density

### Spacing scale (4px base)

| Token | Value | Usage |
|-------|-------|-------|
| `--space-1` | 4px | Icon-to-text gap, chip internal padding |
| `--space-2` | 8px | Input internal padding (horizontal), tight control groups |
| `--space-3` | 12px | Card padding (compact), form field gap |
| `--space-4` | 16px | Card padding (default), section gap |
| `--space-6` | 24px | Page-level section gap |
| `--space-8` | 32px | Major layout sections |
| `--space-12` | 48px | Marketing-only spacing |
| `--space-16` | 64px | Marketing-only spacing |

Values above `--space-8` (32px) are banned on authenticated screens. There is no legitimate use case for 48px or 64px gap inside the product.

### Density targets for authenticated screens

Authenticated screens target **1.25×–1.5× the information density** of a typical SaaS dashboard. This is not a vague aspiration — it cashes out in these specific numbers:

| Element | Generic SaaS | alphavyuh target |
|---------|-------------|------------------|
| Table row height | 52–72px | 36–40px |
| Table vertical padding | 12–18px | 6–8px |
| Stat card height | 80–100px | 52–60px |
| Panel padding | 20–32px | 12–16px |
| Panel border-radius | 16–24px | 8px (`--radius-lg`) |
| Rows visible at 1440×900 (scanner) | ~11 | ~20 |

At 1440×900 (primary target): nav bar 72px + top padding 24px + status bar 44px + table header 32px + gaps 16px = **188px total overhead.** Remaining: ~712px. At 36px rows: **20 results visible without scrolling.** That is a real productivity outcome, not an aesthetic choice.

**Overhead budget (enforced):** The 188px overhead budget is not illustrative — it is a constraint. If a screen adds a secondary filter bar, a breadcrumb, or a persistent alert banner above the table, that overhead must be subtracted from the 188px allocation, not added on top. The page-level overhead must stay ≤ 188px. A screen that requires 220px of overhead above the table can show only ~14 rows at 36px — below the minimum pass threshold.

**Minimum pass vs. design target:** These are distinct thresholds.

| Criterion | Value | Meaning |
|-----------|-------|---------|
| Design target | 20 rows visible at 1440×900 | What a correct screen achieves |
| Minimum pass | 17 rows visible at 1440×900 | Below this: the screen fails. No exceptions. |
| Failure | < 17 rows | The screen violates the density requirement |

A screen that ships with 15 visible rows — previously listed as the minimum — is **failing**. The minimum is 17. The target is 20. Shipping to the minimum is a design defect, not a pass.

Diagnostic: if a stat card occupies more than 64px of vertical space, or panel padding exceeds 16px on any side, or any non-data UI element is added above a table without accounting for it in the 188px overhead budget, the screen is wrong.

### Radius scale

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-sm` | 4px | Chips, small badges |
| `--radius-md` | 6px | Inputs, buttons, small cards |
| `--radius-lg` | 8px | Panels, main cards — the maximum for workspace panels |
| `--radius-xl` | 12px | Dropdowns, modals |
| `--radius-full` | 9999px | Pills (plan badges, series badges) |

Border-radius larger than 8px on workspace panels is banned. Large radii imply floating UI objects; workspace panels are tiles, not cards.

---

## 5. Component patterns

These are principles, not exhaustive specs. Pixel-level implementation details are in ADR 007.

### Table

The scanner, watchlist, and journal are the product's core. Their table pattern is the product's core UI.

```
<table>
  <thead>
    <tr>
      <th>SYMBOL</th>          ← 11px, semibold, uppercase, var(--text-tertiary)
      <th class="text-right">CLOSE</th>   ← numbers right-aligned
    </tr>
  </thead>
  <tbody>
    <tr class="border-b border-subtle hover:bg-surface-3">
      <td>
        <span class="text-sm font-medium text-primary">RELIANCE</span>
        <span class="text-2xs text-tertiary">Reliance Industries</span>
      </td>
      <td class="text-right font-mono tabular-nums">1,247.50</td>
    </tr>
  </tbody>
</table>
```

Rules:
- No `<Card>` wrapper around a table. Tables are full-width in their containing panel.
- Two-line symbol cells (name + company) still fit at 36px: 6px top + 14px (name) + 4px gap + 10px (company) + 6px bottom.
- Numbers: right-aligned, `font-mono tabular-nums`.
- Text: left-aligned.
- Header: `position: sticky; top: 0` so it doesn't scroll away on long lists.
- Selected row: `background: var(--accent-subtle); border-left: 2px solid var(--accent)`.

### Stat card

```jsx
<div className="bg-ds-surface border border-ds-border rounded-lg p-3">
  <p className="text-2xs font-semibold text-ds-t3 uppercase tracking-wider">
    ADV / DECL
  </p>
  <p className="mt-1 text-lg font-semibold font-mono tabular-nums text-ds-t1">
    1,842 <span className="text-sm text-ds-gain">/ 891</span>
  </p>
</div>
```

Max height: 60px. Max padding: 12px/14px. If a stat card needs more than two lines (label + value), the design is wrong.

### Button

| Variant | Background | Text | Border | Height |
|---------|------------|------|--------|--------|
| Primary | `var(--accent)` | `var(--text-on-accent)` | none | 32px |
| Secondary | `var(--surface-2)` | `var(--text-secondary)` | 1px `var(--border-default)` | 32px |
| Ghost | transparent | `var(--text-secondary)` | 1px `var(--border-subtle)` | 32px |
| Danger | `var(--loss-subtle)` | `var(--loss)` | 1px `rgba(225,85,96,0.25)` | 32px |

Geometry: `border-radius: 6px`, `padding: 0 14px`, `font-size: 12px`, `font-weight: 600`. All four variants share identical geometry — only color differs.

Hover: one surface step brighter, text-primary. Active: `scale(0.98)`. Disabled: `opacity: 0.4`. Loading: spinner in icon slot, pointer-events none.

Do not create size variants (small, large). 32px is the one button height on authenticated screens. If a context needs a smaller touch target, use a ghost chip instead.

### Input

```css
background: var(--surface-2);
border: 1px solid var(--border-default);
border-radius: 6px;          /* --radius-md */
height: 32px;
padding: 0 10px;
font-size: 13px;
color: var(--text-primary);
placeholder-color: var(--text-disabled);

/* Focus */
border-color: var(--border-focus);
box-shadow: 0 0 0 3px var(--accent-subtle);
```

### Chip / badge

```
Default:  border 1px var(--border-subtle), text var(--text-secondary), bg transparent, height 24px, px 8px, font-size 11px, radius 4px
Active:   border var(--accent), text var(--accent), bg var(--accent-subtle)
Danger:   border rgba(225,85,96,0.25), text var(--loss), bg var(--loss-subtle)
Warning:  border rgba(232,163,59,0.25), text var(--warn), bg var(--warn-subtle)
Info:     border rgba(90,139,232,0.25), text var(--info), bg var(--info-subtle)
```

Chips are for filters, statuses, plan badges, and series tags. They are not used for navigation.

### Status bar (page header)

```
┌─────────────────────────────────────────────────────────────────┐
│ [page title 15px, weight 500]   [context 12px]   [actions]     │  ← max 44px
└─────────────────────────────────────────────────────────────────┘
```

```css
background: var(--surface-1);
border-bottom: 1px solid var(--border-subtle);
height: 44px; padding: 0 16px;
```

Context (e.g., "EOD 2026-04-19 · 3,046 stocks") is `--text-tertiary`, 12px. Actions are ghost buttons at 32px. No gradient. No padding extravagance.

### Empty state

```
Container: centered in parent panel, max-width 320px
Icon: 20px, color var(--text-disabled)
Title: 13px, weight 500, var(--text-secondary), margin-top 10px
Body (optional): 12px, var(--text-tertiary), max 2 lines, margin-top 4px
CTA (optional): ghost button, margin-top 14px
```

No illustration. No paragraph. No multi-step guidance. If the empty state needs more than two lines, the UX problem is upstream.

### Notification / toast

Toasts are for **actions that the user cannot observe passively** — order placed, watchlist limit reached, ingest failed. They are not for: watchlist item added, screen saved, filter applied. Those outcomes are immediately visible in the UI.

```
Layout: horizontal flex, 12px gap, padding 10px 14px, border-radius 6px
Width: max 380px, pinned bottom-right
Duration: 3s for info/success, persistent for errors (until dismissed)
Icon: 14px, optional
Text: 13px, max one sentence
```

No "🎉 Saved!" copy. No celebration language. No multi-line explanations in a toast.

---

## 6. Iconography

**Library:** `lucide-react`. No other icon library. Do not mix in heroicons, phosphor, radix icons, or emoji as icons.

### Rules

1. **Icons must reduce read time.** An icon is correct when it lets a user skip reading a label — e.g., a search icon before a search input needs no "Search" label. An icon is wrong when it decorates a heading that is already clear without it (e.g., a chart icon before "Scanner").

2. **No icons-as-spacing.** Do not use an icon to add visual weight or breathing room to a section that feels empty. If a section looks sparse, the problem is layout or content — add information, not decoration.

3. **Icon sizes:**
   - Navigation icons: 18px
   - Table action icons (edit, delete, open): 14px  
   - Button icons (left of label): 14px, `stroke-width: 1.75`
   - Status dots (market open/closed): use `●` (U+25CF, 8px) — not an icon
   - Do not use 24px+ icons on authenticated screens.

4. **Icon-only interactive elements** require a minimum 32×32px hit target and an `aria-label`. No exceptions. An icon button with no label and no aria-label is inaccessible.

5. **Tooltips on icons** are permitted only when the icon's meaning is genuinely ambiguous to the intended user. "What does the 🔔 icon do?" is ambiguous. "What does the × button do?" is not. If in doubt: add a visible label instead of a tooltip.

6. **Default stroke-width:** 1.5 for all lucide icons on authenticated screens. Do not use stroke-width 2 (too heavy at small sizes) or stroke-width 1 (too light at small sizes).

---

## 7. Motion

Motion is a tool for communicating **state changes**, not for communicating that the product is "alive." On a workspace screen where a user is making decisions in real time, motion that isn't tied to a state change is noise.

### Duration tokens

Use these tokens for all transition durations. Do not use ad-hoc millisecond values in component code.

| Token | Value | Usage |
|-------|-------|-------|
| `--duration-instant` | `100ms` | Hover color changes (background, border, text color) |
| `--duration-fast` | `180ms` | Element appear/disappear (opacity fades, dropdown appear) |
| `--duration-normal` | `240ms` | Panel collapse/expand, height transitions |

Nothing on authenticated screens should take longer than `--duration-normal` (240ms). If a transition seems to need longer, reconsider whether motion is the right communication channel — a state change that takes longer than 240ms to convey is usually better expressed as a visible UI update (label change, icon swap, color change) than an animation.

### Authenticated screens — permitted motion

| Situation | Animation | Duration |
|-----------|-----------|----------|
| Element loading (spinner) | Rotate, CSS `animation: spin` | Continuous while loading |
| Data appearing after load | `opacity: 0 → 1` | 180ms `ease-out` |
| Panel collapse / expand | `height` transition | 240ms `ease-in-out` |
| Hover color change | `background-color`, `border-color`, `color` transitions | 100ms `ease` |
| WS staleness indicator (amber dot) | Color switch, no animation | Instant |
| Saving state on a form | Button spinner while saving | Continuous while in flight |
| Dropdown / popover appear | `opacity: 0 → 1`, `translateY(-4px → 0)` | 120ms `ease-out` |

### Authenticated screens — banned motion

- **Entrance animations** on page load: elements sliding up from below, fading in from the left, staggered list appearance. The page content is there; it does not need to announce itself.
- **Scale on hover** (`transform: scale(1.02)`) on cards, rows, or buttons. Hover state is communicated by color. Scale makes the layout reflow.
- **Auto-playing animations** at rest — pulsing icons, wiggling indicators, attention-seeking badges.
- **Progress bars** for operations that don't have a known completion percentage. An indeterminate progress bar is a spinner pretending to be informative.
- **Skeleton loaders that animate** (the shimmer effect). Static skeleton shapes are acceptable. Animated shimmer is visual noise.
- **Transition duration > 240ms** (`--duration-normal`) on any authenticated UI element. If a transition needs longer, reconsider whether motion is the right channel.
- Any animation that does not respect `@media (prefers-reduced-motion: reduce)`.

### Landing page — permitted motion

The landing page is editorial and can use entrance animations, scroll-triggered reveals, and hero animations. Rules:
- Duration: ≤ 600ms per element.
- `prefers-reduced-motion: reduce` must suppress all entrance animations and reduce transitions to instant.
- No auto-playing video or GIF unless the user has interacted with the page.

---

## 8. Landing page vs. authenticated screens

These are two different visual contexts with different goals. They must not bleed into each other.

### Landing page (app/(marketing)/, app/page.tsx)

Goal: convince a stranger to sign up. Rules:

- Hero blocks, editorial headlines, large typography (`--text-2xl` and above) are correct.
- Gradient backgrounds, screenshots, feature callouts, testimonials are correct.
- Motion and scroll animations are correct.
- Marketing-tone microcopy ("Track every trade, effortlessly") is correct.
- Surface hierarchy can differ — lighter backgrounds, marketing-specific color usage.

### Authenticated screens (app/(app)/)

Goal: support a user who is already making trading decisions. Rules:

- No hero blocks. No editorial headlines. The user knows what the scanner does.
- No marketing-tone microcopy ("Analyze your portfolio with the power of AI") on any screen the user sees after login.
- No gradients inside panels (the ambient page gradient in `globals.css body` is an exception — it is behind all content, not inside a panel).
- No decorative elements that don't carry information.
- Density, precision, speed.

### The test at the boundary

If you're unsure whether an element belongs on an authenticated screen: ask "does this help the user make a faster or more accurate trading decision?" If the answer is "no, but it looks nice," it does not belong.

---

## 9. Reject list

This list is definitive. When something appears on this list, it is never correct on an authenticated screen, without exception. Items marked ⚠️ have a narrow exception defined.

| Rejected pattern | Why it's wrong |
|-----------------|---------------|
| Hero blocks on authenticated screens | Treats logged-in users as visitors who need to be sold to |
| Editorial subtitles on authenticated screens ("The smarter way to scan") | Same |
| Uppercase workspace labels at body size ("SCANNER WORKSPACE") | Labels the obvious; adds marketing noise to a tool |
| `border-radius > 8px` on workspace panels | Cartoonish on tiled viewport panels; suggests floating cards, not data grids |
| `box-shadow` on workspace panels | False Z-axis elevation; borders express panel structure without the optical noise |
| Gradient backgrounds inside panels | Hurts legibility on nested elements; tokens use flat surfaces for a reason |
| ⚠️ Gradient on `body`/`.app-shell::before` | Exception: the ambient radial gradient in `globals.css` is behind all content and does not appear inside any panel |
| Using `--accent` for non-interactive decoration | Destroys the interactive signal; emerald means "you can click/tap this" |
| Using `--accent` for success / gain states | `--gain: #2DB574` is for bullish states. `--accent: #56D7C1` is for interactive states. They are distinct. |
| Using `--gain` or `--loss` for non-financial states | Gain/loss colors carry a specific semantic meaning in trading contexts; applying them to non-financial UI creates false associations |
| Panel padding > 16px | Wastes vertical space; reduces visible rows below density target |
| Inline `rgba(255,255,255,*)` in component code | Bypasses the token system; breaks light-mode switch when v2 ships |
| Inline hex colors in component code | Same issue — always reference CSS variables |
| Five or more text color levels | If you need a fifth level, you have a layout problem |
| Loading spinners that appear for < 200ms | Flicker is worse than no spinner; debounce loading state by 200ms |
| Success toasts for mundane actions | "Watchlist item added" is visible in the UI; a toast is redundant noise |
| Toasts with > 1 sentence | If the message requires two sentences, it belongs in a modal or error banner |
| Empty state illustrations | No SVG characters, no "no data" mascots. Icon + 2 lines max. |
| Progress bars for indeterminate operations | A spinner communicates "in progress" just as well and is honest about unknown duration |
| Entrance animations on authenticated screens | The screen loads; content appears. It does not need to arrive dramatically. |
| Scale-on-hover on cards or rows | Layout reflow on hover is disorienting; use background-color change only |
| Motion > 240ms (`--duration-normal`) on authenticated elements | If a transition needs longer than 240ms, reconsider whether motion is the right communication channel |
| Ignoring `prefers-reduced-motion` | Accessibility — all transitions must be suppressed at the OS level |
| Emoji in UI copy (button labels, error messages, toasts) | Not a professional tool aesthetic; never on authenticated screens |
| Multiple accent colors | `--accent` is the one interactive color. `--info` is for non-interactive badges only. Do not introduce a second interactive color. |
| Icons > 18px on authenticated screens | Scale communicates importance; large icons inflate perceived importance of chrome |
| Icons with no `aria-label` when icon-only | Inaccessible; every interactive icon-only element needs `aria-label` |
| Tooltips on self-evident icons | × close button, ↓ expand, ⟳ refresh — these need no tooltip |
| "Powered by" or technology attribution in product UI | Users don't care; it reads as insecure |
| Sticky marketing CTAs inside authenticated screens | "Upgrade to Pro" banners every time a free user runs a scan are harassment, not UX |
| Light mode variants in MVP | `dark:` Tailwind variants and `@media (prefers-color-scheme: light)` blocks are banned until v2 — they increase the migration surface |
| shadcn default styles without ds-* token override | shadcn ships with its own gray palette and border-radius defaults. Any shadcn component used in the product must override these with ds-* tokens. |
| Using `--gain` / `--loss` (green/red) for non-directional boolean states | A feature that is "on" is not bullish. An alert that fires is not bearish. Gain/loss colors carry a specific market-direction meaning to traders; applying them to non-financial boolean states creates false associations. Use `--accent` for active states, `--warn` for caution, `--text-tertiary` for inactive. |
| Sparklines or mini-charts as decorative table row elements | A 7-day sparkline column in the scanner table sounds useful but adds 20px of row height and violates the density target. Inline chart elements are only permitted if the column meaningfully changes the scan decision — and if so, its height impact must be justified against the density minimum. Decorative sparklines (added because they look "professional") are banned. |
| Repeated cell background flashing on WebSocket tick updates | Flashing a cell green/red on every price tick is functionally an auto-playing animation. One-time flash on a meaningful state change (e.g., order status: PENDING → FILLED) is permitted at `--duration-fast` (180ms). Repeated flashing every tick is banned. ADR 011's WS staleness indicator uses a color change, not a flash — that pattern is the correct model. |
| Ad-hoc decimal precision on numeric values | Price: 2 decimal places (₹1,247.50). Percentage: 2 decimal places (4.27%). Volume: integer, formatted with commas (1,842,000). Ratio: 2 decimal places (1.24). Do not apply arbitrary decimal places to match a data source's precision — standardize to these values at the display layer. Mismatched precision across a screen breaks the column alignment that tabular numerals enable. |
| Skeleton geometry mismatched to final content density | A skeleton that shows 3 fat placeholder rows for a screen that will render 20 dense rows creates a jarring density jump on load. Skeleton elements must match the final layout's row height and column count. A dense table gets a dense skeleton — not a sparse three-block placeholder. |

---

## 10. Implementation

### Token delivery: CSS variables + Tailwind aliases

The source of truth is `frontend/app/design-tokens.css` (CSS custom properties on `:root`). This file is the only place where hex values and numeric values appear. Everything else references tokens.

Tailwind access via `ds-*` prefix in `tailwind.config.ts`:

```ts
// tailwind.config.ts — theme.extend.colors (already in place)
"ds-bg":         "var(--surface-0)",
"ds-surface":    "var(--surface-1)",
"ds-surface2":   "var(--surface-2)",
"ds-surface3":   "var(--surface-3)",
"ds-float":      "var(--surface-float)",
"ds-border":     "var(--border-default)",
"ds-border-sub": "var(--border-subtle)",
"ds-border-str": "var(--border-strong)",
"ds-t1":         "var(--text-primary)",
"ds-t2":         "var(--text-secondary)",
"ds-t3":         "var(--text-tertiary)",
"ds-accent":     "var(--accent)",
"ds-accent-bg":  "var(--accent-subtle)",
"ds-gain":       "var(--gain)",
"ds-gain-bg":    "var(--gain-subtle)",
"ds-loss":       "var(--loss)",
"ds-loss-bg":    "var(--loss-subtle)",
"ds-warn":       "var(--warn)",
"ds-warn-bg":    "var(--warn-subtle)",
```

Add to `theme.extend.borderRadius`:

```ts
"ds-sm":   "var(--radius-sm)",   // 4px — chips, badges
"ds-md":   "var(--radius-md)",   // 6px — inputs, buttons
"ds-lg":   "var(--radius-lg)",   // 8px — panels (maximum for workspace)
"ds-xl":   "var(--radius-xl)",   // 12px — dropdowns, modals
"ds-full": "var(--radius-full)", // 9999px — pills
```

In component code: `className="bg-ds-surface border border-ds-border rounded-ds-lg text-ds-t2"`. Never `style={{ background: '#12151C' }}` or `className="rounded-[8px]"`.

### Why not a design tokens JSON file (Style Dictionary)?

Style Dictionary (or similar) generates platform-specific output (CSS vars, Swift, Kotlin, etc.) from a single JSON source. The overhead is justified at product scale with multiple platforms. alphavyuh is web-only for MVP. The CSS-variables-as-source approach:
- No build step for tokens (faster iteration)
- Direct inspection in DevTools
- Native CSS cascade (tokens can be scoped to specific components or themes without JS)
- When light mode lands: one `:root [data-theme="light"]` block overrides everything

Revisit Style Dictionary when: (a) a native app ships, or (b) the team grows to the point where a visual changelog for token values is valuable.

### Why not CSS Modules or styled-components?

CSS Modules scope styles per component at build time — incompatible with runtime theme switching (light/dark). Styled-components add JS bundle weight and complicate Server Components. Tailwind + CSS variables is the correct choice for a Next.js 14 App Router project: zero additional runtime, compatible with Server Components, and direct alignment with the existing stack.

### Tech debt from dual token systems

The codebase currently has two competing token references:
1. Legacy hardcoded hex (from the pre-ADR era): `#5b63f5` (old indigo accent), `#26a65b` (old gain green), `#1c1c1a`, `#f2f2f0`
2. Current CSS variables: `var(--accent)` → `#56D7C1`, `var(--gain)` → `#2DB574`, `var(--surface-0)` → `#0B0D11`

Phase 2B migration must eliminate all legacy hex references from authenticated-screen components. The `.claude/rules/frontend.md` color palette list is outdated — it reflects the old light-mode aesthetic. It will be updated during Phase 2B.

Rule for new code: **never write a hex value in a component file.** If a value is not expressible as a `ds-*` Tailwind class or a `var(--*)` CSS variable, either add the token to `design-tokens.css` or reconsider whether the value belongs in the design system at all.

---

## References

- `frontend/app/design-tokens.css` — source of truth for all tokens
- `frontend/tailwind.config.ts` — Tailwind ds-* aliases
- `frontend/app/globals.css` — typography utilities, app shell
- `docs/decisions/007-design-system.md` — implementation details (component pixel specs, WCAG table, layout examples)
- `docs/decisions/011-realtime-architecture.md` — WS staleness indicator (amber dot, no animation)
