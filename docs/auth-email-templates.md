# Auth Email Templates

AlphaVyuh auth emails are versioned under `supabase/templates/` and wired into local Supabase through `supabase/config.toml`.

## Templates

- Confirm sign up: `supabase/templates/confirmation.html`
- Password recovery: `supabase/templates/recovery.html`
- Magic link: `supabase/templates/magic-link.html`
- Invite: `supabase/templates/invite.html`

Each template uses `{{ .ConfirmationURL }}` so Supabase keeps token handling and redirect validation in the Auth service. Application code passes `/auth/callback?next=...` as `emailRedirectTo`, and `frontend/app/auth/callback/route.ts` exchanges the code for a session before redirecting.

## Hosted Supabase

Hosted Supabase projects do not automatically read these local files. Apply the same HTML in:

`Authentication -> Emails -> Templates`

Required project settings:

- Site URL: `https://www.alphavyuh.com`
- Redirect URLs:
  - `https://www.alphavyuh.com/auth/callback`
  - `https://alphavyuh.com/auth/callback`
- Confirm email: enabled
- Email link tracking: disabled in the email provider, if applicable

## Smoke Test

1. Sign up with a fresh email.
2. Confirm the email received has AlphaVyuh branding and a `Confirm email` button.
3. Click the link.
4. Confirm the browser lands inside the app, normally `/onboarding` for a first-time user or the safe `next` target.
5. Try the resend confirmation button from the signup success screen.
