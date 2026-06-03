-- Ensure scan alert match snapshots cannot point at another user's parent alert.

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
