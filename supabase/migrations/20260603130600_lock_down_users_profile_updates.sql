-- Lock down direct client writes to public.users.
--
-- The users row contains trusted entitlement, billing, broker, referral, and
-- Telegram fields. Profile writes must go through backend routes that use the
-- service role and field allowlists; authenticated browser clients only need
-- to read their own row.

alter table public.users enable row level security;

drop policy if exists "Users can update own profile" on public.users;

drop policy if exists "Users can read own profile" on public.users;
create policy "Users can read own profile" on public.users
  for select
  to authenticated
  using (auth.uid() is not null and auth.uid() = id);

revoke all on table public.users from anon, authenticated;
grant select on table public.users to authenticated;
grant all on table public.users to service_role;
