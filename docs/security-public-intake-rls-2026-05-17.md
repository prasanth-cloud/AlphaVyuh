# Public Intake RLS Hardening - 2026-05-17

## Summary

The security agent lane found that founder-beta intake tables were stored in the
Supabase `public` schema without explicit RLS or direct-role revokes:

- `public.waitlist`
- `public.invite_codes`
- `public.feedback_reports`

These tables contain emails, founder invite material, user-submitted feedback,
page/symbol context, and admin triage state. Backend routes already mediate all
product access through the service-role client, so direct `anon` and
`authenticated` table access is not required.

## Change

Added migration:

- `supabase/migrations/20260517123000_public_intake_feedback_rls.sql`

The migration:

- enables RLS on all three tables
- revokes direct table access from `anon` and `authenticated`
- preserves `service_role` access for existing backend routes

## Agent Notes

- **Security Agent:** identified and validated the missing DB-layer control.
- **QA/Security Reviewer:** confirmed current frontend/backend flows use backend
  APIs and service-role routes, not direct browser Supabase table access.
- **Manager Agent:** converted the finding into a bounded migration and a
  regression test.

The reviewer also caught a signup reliability edge case: when production is on
the original waitlist schema, the fallback insert still attempted the later
`source` column. The waitlist route now falls back all the way to email-only
insert so founder-beta signup stays available during partial migration windows.

## What We Learned

Backend route guards are necessary, but Supabase-backed products need the same
access intent expressed at the database layer. Public-schema tables that store
contact data, feedback, invite codes, or admin state should be deny-by-default
unless they are intentionally public reference data.

## Remaining Gate

This migration must be applied to production Supabase and recorded with migration
evidence before merge if the repository migration-drift gate requires it.
