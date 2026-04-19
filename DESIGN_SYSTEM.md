# AlphaVyuh Design System

## Using the primitives

ALWAYS import from `@/components/ui`:
```tsx
import { Button, Card, Input, Badge, StatCard, DataTable, DataTableHead, Th, Tr, Td, EmptyState } from '@/components/ui'
```

Do NOT use inline styles for colors, fonts, or spacing.
Use CSS variables: `var(--accent)`, `var(--text-primary)`, `var(--space-4)`, etc.

## Typography classes (in any page)
- `.label`          — 10px uppercase, tracking wide, tertiary color
- `.caption`        — 11px body, tertiary color
- `.body`           — 13px body, primary color
- `.body-secondary` — 13px body, secondary color
- `.heading-card`   — 15px medium, primary
- `.heading-section`— 18px semibold, tight tracking
- `.heading-page`   — 22px semibold, tight tracking

## Numbers
Financial numbers MUST use `.mono`, `.num`, or `fontFamily: 'var(--font-mono)'`
with `fontVariantNumeric: 'tabular-nums'`.

## Colors — only use these
| Token | Use |
|---|---|
| `--surface-0` | Page background |
| `--surface-1` | Cards, panels |
| `--surface-2` | Hover, nested elements |
| `--surface-3` | Active, selected |
| `--surface-float` | Dropdowns, modals |
| `--border-subtle` | Default card border |
| `--border-default` | Hover border |
| `--border-strong` | Emphasis border |
| `--text-primary` | Headlines, primary data |
| `--text-secondary` | Body, secondary data |
| `--text-tertiary` | Labels, captions |
| `--accent` | Brand color — buttons, links, active states |
| `--gain` | Positive P&L — numbers only |
| `--loss` | Negative P&L — numbers only |
| `--warn` | Warnings |
| `--info` | Informational |

Never hardcode `#0D0F14`, `#13161D`, `#00E5C4`, etc. Use the variables.

## Button variants
| Variant | Use |
|---|---|
| `primary` | Main CTA — use sparingly |
| `secondary` | Default action |
| `ghost` | Subtle action |
| `danger` | Destructive action |

## Badge variants
`neutral`, `accent`, `gain`, `loss`, `warn`, `info`

Use `gain`/`loss` only for P&L values. Never decoratively.

## Spacing — 4px grid
`--space-1` (4px) through `--space-16` (64px). Always use these. No arbitrary values.

## Motion
Use sparingly. Standard values: `--motion-instant` (100ms), `--motion-fast` (180ms), `--motion-base` (240ms).
Always pair with `--ease-out` or `--ease-in-out`.

## Design principles
- Typography is the main design element
- Negative space is intentional, not wasted
- Borders and dividers, not shadows
- Hierarchy via font weight, not color
- Green/red for P&L only — never decorative
- No gradients, glassmorphism, or neumorphism
- No emoji as UI elements
