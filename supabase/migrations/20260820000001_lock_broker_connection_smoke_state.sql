-- Read-only broker smoke results are server-generated safety state.
-- Keep authenticated users able to view their connection status, but prevent
-- direct table writes from forging a fresh smoke pass through the Supabase API.

do $$
begin
  if to_regclass('public.broker_connections') is not null then
    execute 'drop policy if exists broker_connections_owner on public.broker_connections';
    execute 'drop policy if exists broker_connections_read_own on public.broker_connections';
    execute $policy$
      create policy broker_connections_read_own
        on public.broker_connections
        for select
        to authenticated
        using ((select auth.uid()) = user_id)
    $policy$;
    execute 'revoke insert, update, delete on table public.broker_connections from anon, authenticated';
  end if;
end
$$;
