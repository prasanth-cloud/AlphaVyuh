# ADR 001 — M1 Auth Design

> Reviewer grilled us on 7 questions before implementation. This doc records what we decided and why. Skim the **Decision** line per question; read **Consequences** only if something breaks.

---

## Q1 — How do session cookies actually get set after login?

**Context.** A Route Handler that calls `supabase.auth.signInWithPassword()` then returns `NextResponse.json({ success: true })` would lose the cookies if it created the response object after the Supabase call — the `setAll` callback would have already fired and written to a response object that's discarded.

**Decision.** Create `NextResponse` first, pass it into `createRouteHandlerClient(response)`. The client's `setAll` writes directly onto `response.cookies`. Return the same object. See `app/api/auth/login/route.ts` and `lib/supabase/server.ts:createRouteHandlerClient`.

**Consequences.**
- `sb-*-auth-token` cookies are set in the browser on the login response.
- Every future Route Handler that does auth work must use `createRouteHandlerClient`, not `createServerSupabaseClient`.
- If you forget and use the wrong factory in a sign-out/refresh route, cookies won't be cleared and the user will appear logged in on the server even after signing out.

---

## Q2 — Signup cookie split-brain

**Context.** Signup calls `supabase.auth.signUp()` from the browser client (`createBrowserClient`). Login goes through a server Route Handler (`createServerClient`). The concern: do both write cookies with identical names/domains so middleware can read them?

**Decision.** Both `createBrowserClient` and `createServerClient` come from `@supabase/ssr` (not the deprecated `auth-helpers-nextjs`). The SSR package guarantees consistent cookie names and formats across browser and server clients. Confirmed: both import from `@supabase/ssr`.

**Consequences.**
- If we ever introduce a second Supabase client library (or a community adapter), re-verify cookie name parity before shipping.
- If email confirmation is enabled later, the confirmation link exchange must also use `@supabase/ssr` (via `/auth/callback` — see Q7).

---

## Q3 — `getSession()` vs `getUser()`: who calls which

**Context.** `getSession()` reads from the local cookie cache without hitting Supabase Auth servers — fast but can return a stale/expired token. `getUser()` makes a live network call and validates the JWT.

**Decision.**
- `getUser()` everywhere that makes a security decision: middleware, Server Components, Route Handlers.
- `getSession()` only in client-side UI that needs the token for display or to pass to the backend (`lib/api.ts:getToken`).
- No manual refresh logic. The `@supabase/ssr` middleware client refreshes the token automatically when the server client detects expiry via cookie comparison.
- Route Handlers return `401` when user is null; the client catches 401s and redirects to `/login`.

**Consequences.**
- Every page navigation triggers a `getUser()` call in the layout (one network round-trip). Acceptable for MVP; revisit if TTFB becomes a concern.
- If we add a non-Next.js API consumer (mobile app, script), it must validate tokens itself — the middleware refresh won't fire for non-browser clients.

---

## Q4 — Middleware DB query and the null-profile race

**Context.** The original implementation queried `public.users` for `onboarding_completed` on every request in middleware — two sequential Supabase round-trips per page load. It also treated `null` profile the same as "onboarding complete," which was wrong.

**Decision.**
- Middleware does **one** thing: `getUser()` → redirect to `/login` if null. No DB query.
- Onboarding check lives in `app/(app)/layout.tsx` (async Server Component): reads `users.onboarding_completed`, redirects to `/onboarding` if false.
- `null` profile (trigger race: user row not yet committed after signup) → treated as **not onboarded**. Onboarding step 1 upserts the `users` row, so the race resolves on first completion.

**Consequences.**
- Every `(app)/` page render does two Supabase calls in the layout: `getUser()` + users row fetch. This is bounded and cacheable if needed later via `React.cache()`.
- A user who somehow has no `users` row after onboarding will be redirect-looped at `/onboarding`. The upsert in onboarding is the safety net.

---

## Q5 — Open redirect via `?next=`

**Context.** Middleware sets `?next=<pathname>` on the login redirect. The login and signup forms read it and redirect after auth. `next.startsWith("/")` alone passes for `//evil.com` and `/\evil.com`.

**Decision.** `lib/safe-redirect.ts:isSafeRedirect()` validates:
1. Must be truthy
2. Must start with `/`
3. Must NOT start with `//`
4. Must NOT start with `/\`

Falls through to `/dashboard` on any failure. Middleware only ever writes bare pathnames (safe by construction); the risk is manually crafted links.

**Consequences.**
- Any new form or server action that consumes a `next` redirect param must import and use `isSafeRedirect`.
- Vitest unit tests cover all documented vectors in `tests/unit/safe-redirect.test.ts`.

---

## Q6 — Trigger failure modes and browser writes to `public.users`

**Context.** `handle_new_user()` is `security definer` and runs on `auth.users` insert. If it fails silently (non-duplicate constraint error), the `public.users` row won't exist and the user will loop at `/onboarding` forever. The concern was also whether any browser-side code tries to upsert directly.

**Decision.**
- Browser code never touches `public.users` directly. All profile writes go through Route Handlers or server actions. RLS on `public.users` has no `INSERT` policy, so any accidental browser insert is blocked at the DB layer.
- The trigger is treated as defense-in-depth. Onboarding step 1 does an idempotent upsert: `INSERT INTO users (...) ON CONFLICT (id) DO UPDATE SET ...`. This is the authoritative write.
- Trigger failure surfaces as an opaque Postgres error from `signUp()`. We accept this; the upsert path recovers it.

**Consequences.**
- If we add a new required column to `public.users`, update both the trigger AND the onboarding upsert or new users will fail onboarding with a constraint error.
- The upsert happens in the onboarding API route — document this in `docs/data-model.md` when it's implemented.

---

## Q7 — No `/auth/callback` route; email confirmation off

**Context.** Magic links, email confirmation, and OAuth all redirect to `<site>/auth/callback` to exchange a code for a session. Without a handler, the user clicks a confirmation link and gets a 404 and no session.

**Decision.** Email confirmation is **OFF** in Supabase for now. Signup returns a session immediately. `/auth/callback` is not implemented.

**Before enabling email confirmation, magic links, or OAuth:**
1. Build `app/api/auth/callback/route.ts` — exchanges `code` for session using `supabase.auth.exchangeCodeForSession(code)`, writes cookies onto `NextResponse`, redirects to `/dashboard`.
2. Set `EMAIL_REDIRECT_TO` in Supabase dashboard to `<domain>/api/auth/callback`.
3. Add a Playwright spec: click confirmation link → lands on `/dashboard` with session set.

**Consequences.**
- Turning on email confirmation without the callback route will silently break all signups.
- This gap is tracked in `CLAUDE.md §8 Known gaps`.
