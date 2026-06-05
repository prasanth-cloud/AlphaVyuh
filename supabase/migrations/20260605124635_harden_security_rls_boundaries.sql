-- Harden direct Supabase Data API boundaries for server-owned security state.
--
-- The backend uses the service-role client for profile writes, entitlement
-- changes, broker order idempotency, and scheduled scan-alert snapshots.
-- Browser clients should not be able to mutate those trusted fields directly.

-- public.users contains entitlement and billing state. Keep direct clients
-- read-only; profile updates remain available through backend allowlisted
-- routes that use the service role.
alter table public.users enable row level security;

drop policy if exists "Users can update own profile" on public.users;

drop policy if exists "Users can read own profile" on public.users;
create policy "Users can read own profile" on public.users
  for select
  to authenticated
  using (auth.uid() is not null and auth.uid() = id);

revoke all on table public.users from anon, authenticated;
grant select on table public.users to authenticated;
grant select, insert, update, delete on table public.users to service_role;

-- order_idempotency is trusted broker execution state. The adapters write and
-- reconcile it server-side; direct users must not be able to pre-seed or update
-- cached broker results.
alter table public.order_idempotency enable row level security;

drop policy if exists "Users can read own idempotency rows" on public.order_idempotency;
drop policy if exists "Users can insert own idempotency rows" on public.order_idempotency;
drop policy if exists "Users can update own idempotency rows" on public.order_idempotency;

revoke all on table public.order_idempotency from anon, authenticated;
grant select, insert, update, delete on table public.order_idempotency to service_role;

-- scan_alert_matches rows must belong to the same user as their parent alert.
-- Checking only the child user_id allowed a direct client to cross-bind an
-- attacker-owned match row to a known victim alert_id.
alter table public.scan_alert_matches enable row level security;

drop policy if exists "Users manage own scan_alert_matches" on public.scan_alert_matches;
create policy "Users manage own scan_alert_matches" on public.scan_alert_matches
  for all
  using (
    auth.uid() = user_id
    and exists (
      select 1
      from public.scan_alerts a
      where a.id = scan_alert_matches.alert_id
        and a.user_id = auth.uid()
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.scan_alerts a
      where a.id = scan_alert_matches.alert_id
        and a.user_id = auth.uid()
    )
  );
