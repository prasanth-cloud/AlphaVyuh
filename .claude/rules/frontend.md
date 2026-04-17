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

## Color palette (Tailwind inline styles)
```
#1c1c1a   dark text / headings
#5b63f5   indigo accent (buttons, links, highlights)
#26a65b   green (profit, success, bullish)
#e5383b   red (loss, error, bearish)
#f2f2f0   background
```
Use these as inline `style={{color: ...}}` or as Tailwind arbitrary values. Avoid inventing new colors.

## Component conventions
- Font: DM Sans via `--font-sans` CSS variable
- Border radius: `rounded-[7px]` for inputs, `rounded-[10px]` for cards, `rounded-[8px]` for buttons
- Cards: `bg-white border border-[#e2e2df] rounded-[10px] p-4`
- Section labels: `text-[11px] font-semibold text-[#888] uppercase tracking-[0.5px]`
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
