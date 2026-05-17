-- Lock down founder-beta intake and feedback tables.
--
-- These tables contain emails, invite codes, user-submitted feedback, page/symbol
-- context, and admin triage state. All product access flows through backend
-- service-role routes, so anon/authenticated roles should not read or mutate the
-- tables directly through Supabase APIs.

alter table if exists public.waitlist enable row level security;
alter table if exists public.invite_codes enable row level security;
alter table if exists public.feedback_reports enable row level security;

revoke all on table public.waitlist from anon, authenticated;
revoke all on table public.invite_codes from anon, authenticated;
revoke all on table public.feedback_reports from anon, authenticated;

grant all on table public.waitlist to service_role;
grant all on table public.invite_codes to service_role;
grant all on table public.feedback_reports to service_role;
