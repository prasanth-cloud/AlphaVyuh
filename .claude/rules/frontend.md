# Frontend Rules

## Framework reality
- Next.js 14.2 App Router, but **all pages use `"use client"`** — no Server Components in `(app)/`
- Route protection is handled by `frontend/middleware.ts` (server-side, checks Supabase session)
- Protected routes: `dashboard`, `scanner`, `watchlist`, `charts`, `journal`, `settings`, `onboarding`

## API calls
- **All API calls go through `frontend/lib/api.ts`** — never `fetch()` directly from a page component
- `authHeaders()` is async — always `await` it
- `API` constant = `process.env.NEXT_PUBLIC_API_URL` — must be set in `.env.local`
- Network errors from fire-and-forget calls (e.g. `deleteDrawing`) must be caught; unhandled promise rejections show as Next.js error overlays

## Color palette — USE TOKENS, NOT HEX

**The legacy hex values below are OUTDATED and must not be used in new code.** The current design system is governed by ADR 012 (`docs/decisions/012-design-system.md`). All colors are CSS custom properties in `frontend/app/design-tokens.css`, with Tailwind access via `ds-*` aliases.

| Use case | Token | Tailwind class |
|----------|-------|----------------|
| Page background | `var(--surface-0)` | `bg-ds-bg` |
| Panel / card background | `var(--surface-1)` | `bg-ds-surface` |
| Input / nested background | `var(--surface-2)` | `bg-ds-surface2` |
| Hover / selected state | `var(--surface-3)` | `bg-ds-surface3` |
| Primary text | `var(--text-primary)` | `text-ds-t1` |
| Secondary text | `var(--text-secondary)` | `text-ds-t2` |
| Captions / headers | `var(--text-tertiary)` | `text-ds-t3` |
| Brand accent (interactive only) | `var(--accent)` | `text-ds-accent` / `bg-ds-accent` |
| Positive P&L | `var(--gain)` | `text-ds-gain` |
| Negative P&L | `var(--loss)` | `text-ds-loss` |
| Caution / plan limits | `var(--warn)` | `text-ds-warn` |
| Panel border | `var(--border-default)` | `border-ds-border` |

**Never write a hex value in a component file.** If a value can't be expressed as a `ds-*` class or `var(--)` CSS variable, it doesn't belong in the codebase — add it to `design-tokens.css` first.

**Legacy values (do not use):** `#1c1c1a`, `#5b63f5`, `#26a65b`, `#e5383b`, `#f2f2f0`, `#888`, `#e2e2df`. These appear in older components and will be migrated in Phase 2B.

## Component conventions
- Font: **Inter** via `var(--font-sans)` CSS variable. DM Sans is deprecated.
- All numeric data: `font-mono tabular-nums` (JetBrains Mono, `var(--font-mono)`)
- Border radius: `rounded-ds-md` (6px) for inputs/buttons, `rounded-ds-lg` (8px) for cards/panels
- Cards: `bg-ds-surface border border-ds-border rounded-ds-lg p-3` (padding 12px, **not** p-4/16px)
- Section labels in tables: `text-[11px] font-semibold text-ds-t3 uppercase tracking-[0.06em]`
- No emoji in UI unless explicitly requested

## Entitlements on frontend
- UI can show/hide features based on plan (fetched from `GET /api/v1/payments/status`)
- **Never use plan state to skip backend calls** — the backend enforces limits
- If a user bypasses the UI gate, the backend returns the correct limit

## PWA
- `public/manifest.json` and `public/sw.js` exist
- `ServiceWorkerRegistrar.tsx` registers the SW on mount
- Offline fallback: `app/offline/page.tsx`
- Missing: `public/icon-192.png` and `public/icon-512.png` (manifest references them; do not fix without approval)

## Page structure
```
app/(auth)/          login, signup, reset-password (no navbar)
app/(app)/           all protected pages (navbar via layout.tsx)
  dashboard, scanner, watchlist, charts/[symbol], journal
  options, alerts, settings, onboarding
  community/         shared screens + upvotes (backend community router currently broken — see CLAUDE.md)
  broker/callback/   Zerodha OAuth callback
  privacy/, terms/   static legal pages
app/offline/         PWA fallback
```
Onboarding guard is in `app/(app)/layout.tsx` — checks `onboarding_completed` on the user profile.

## Never do
- Import a `fetch()` directly in a page; add the function to `lib/api.ts` instead
- Use `localStorage` for auth tokens — Supabase handles session storage
- Add server-side `getServerSideProps` or `getStaticProps` — this is all client-rendered
- Assume `process.env.NEXT_PUBLIC_API_URL` is always set — handle undefined gracefully
- Add new colors outside the palette without asking
