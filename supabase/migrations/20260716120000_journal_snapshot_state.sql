-- Immutable structured chart state captured at the journal decision boundary.

alter table public.trade_journal
  add column if not exists snapshot_image_path text,
  add column if not exists snapshot_state_path text,
  add column if not exists snapshot_state_version integer,
  add column if not exists snapshot_captured_at timestamptz;

alter table public.trade_journal
  drop constraint if exists trade_journal_snapshot_state_version_check,
  add constraint trade_journal_snapshot_state_version_check
  check (
    (snapshot_state_path is null and snapshot_state_version is null and snapshot_captured_at is null)
    or
    (snapshot_state_path is not null and snapshot_state_version = 1 and snapshot_captured_at is not null)
  );

comment on column public.trade_journal.snapshot_state_path
  is 'Private Storage path to immutable structured chart state captured for this journal decision.';
comment on column public.trade_journal.snapshot_image_path
  is 'Reserved private Storage path for a future image capture. Null in the structured-state-only slice.';
comment on column public.trade_journal.snapshot_state_version
  is 'Version of the structured chart snapshot payload. Version 1 is the initial contract.';
comment on column public.trade_journal.snapshot_captured_at
  is 'Server-attested attachment timestamp for the immutable structured chart state.';

create or replace function public.prevent_journal_snapshot_rewrite()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    if coalesce(auth.role(), '') <> 'service_role' and (
      new.snapshot_state_path is not null
      or new.snapshot_image_path is not null
      or new.snapshot_state_version is not null
      or new.snapshot_captured_at is not null
    ) then
      raise exception 'journal chart snapshot metadata is server-owned';
    end if;
    return new;
  end if;

  if coalesce(auth.role(), '') <> 'service_role' and (
    new.snapshot_state_path is distinct from old.snapshot_state_path
    or new.snapshot_image_path is distinct from old.snapshot_image_path
    or new.snapshot_state_version is distinct from old.snapshot_state_version
    or new.snapshot_captured_at is distinct from old.snapshot_captured_at
  ) then
    raise exception 'journal chart snapshot metadata is server-owned';
  end if;
  if old.snapshot_state_path is not null and (
    new.snapshot_state_path is distinct from old.snapshot_state_path
    or new.snapshot_state_version is distinct from old.snapshot_state_version
    or new.snapshot_captured_at is distinct from old.snapshot_captured_at
  ) then
    raise exception 'journal chart snapshots are immutable';
  end if;
  if old.snapshot_image_path is not null
    and new.snapshot_image_path is distinct from old.snapshot_image_path
  then
    raise exception 'journal chart snapshot images are immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists journal_snapshot_immutable on public.trade_journal;
create trigger journal_snapshot_immutable
  before insert or update on public.trade_journal
  for each row execute function public.prevent_journal_snapshot_rewrite();

-- Delete and return private-object paths in one row-locking statement. This
-- serializes against the backend's conditional snapshot-path UPDATE: either
-- the attach commits first and these paths are returned, or deletion commits
-- first and the attach observes the missing row and cleans its upload.
create or replace function public.delete_trade_journal_with_snapshot_paths(
  p_entry_id uuid,
  p_user_id uuid
)
returns table(snapshot_state_path text, snapshot_image_path text)
language plpgsql
security invoker
set search_path = public
as $$
begin
  return query
  delete from public.trade_journal as journal
  where journal.id = p_entry_id
    and journal.user_id = p_user_id
  returning journal.snapshot_state_path, journal.snapshot_image_path;
end;
$$;

revoke all on function public.delete_trade_journal_with_snapshot_paths(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.delete_trade_journal_with_snapshot_paths(uuid, uuid)
  to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'trade-snapshots',
  'trade-snapshots',
  false,
  65536,
  array['application/json']::text[]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users can read own trade snapshots" on storage.objects;
create policy "Users can read own trade snapshots"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'trade-snapshots'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Writes intentionally have no authenticated-client policy. The owner-checking
-- backend performs first-write-only uploads with its service-role client.
-- Deterministic object paths make failed attachment retries recoverable. A
-- periodic orphan audit/cleanup remains a separate operational follow-up.
