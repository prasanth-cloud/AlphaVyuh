-- Public launch security hardening.
--
-- Supabase advisors flagged mutable search_path settings and direct
-- anon/authenticated EXECUTE grants on helper and SECURITY DEFINER functions.
-- These functions are invoked by triggers or backend service-role paths, not
-- directly by browser clients. Keep app behavior unchanged while reducing the
-- RPC attack surface.

do $$
begin
  if to_regprocedure('public.handle_new_user_watchlist()') is not null then
    execute 'alter function public.handle_new_user_watchlist() set search_path = public';
    execute 'revoke execute on function public.handle_new_user_watchlist() from public, anon, authenticated';
    execute 'grant execute on function public.handle_new_user_watchlist() to service_role';
  end if;

  if to_regprocedure('public.update_updated_at()') is not null then
    execute 'alter function public.update_updated_at() set search_path = public';
    execute 'revoke execute on function public.update_updated_at() from public, anon, authenticated';
    execute 'grant execute on function public.update_updated_at() to service_role';
  end if;

  if to_regprocedure('public.broker_credentials_set_updated_at()') is not null then
    execute 'alter function public.broker_credentials_set_updated_at() set search_path = public';
    execute 'revoke execute on function public.broker_credentials_set_updated_at() from public, anon, authenticated';
    execute 'grant execute on function public.broker_credentials_set_updated_at() to service_role';
  end if;

  if to_regprocedure('public.compute_rs_score_for_date(date)') is not null then
    execute 'alter function public.compute_rs_score_for_date(date) set search_path = public';
    execute 'revoke execute on function public.compute_rs_score_for_date(date) from public, anon, authenticated';
    execute 'grant execute on function public.compute_rs_score_for_date(date) to service_role';
  end if;

  if to_regprocedure('public.workflow_states_set_updated_at()') is not null then
    execute 'alter function public.workflow_states_set_updated_at() set search_path = public';
    execute 'revoke execute on function public.workflow_states_set_updated_at() from public, anon, authenticated';
    execute 'grant execute on function public.workflow_states_set_updated_at() to service_role';
  end if;

  if to_regprocedure('public.handle_new_user()') is not null then
    execute 'alter function public.handle_new_user() set search_path = public';
    execute 'revoke execute on function public.handle_new_user() from public, anon, authenticated';
    execute 'grant execute on function public.handle_new_user() to service_role';
  end if;

  if to_regprocedure('public.delete_broker_credentials(uuid,text)') is not null then
    execute 'alter function public.delete_broker_credentials(uuid,text) set search_path = public';
    execute 'revoke execute on function public.delete_broker_credentials(uuid,text) from public, anon, authenticated';
    execute 'grant execute on function public.delete_broker_credentials(uuid,text) to service_role';
  end if;

  if to_regprocedure('public.get_encrypted_credential(uuid,text,text)') is not null then
    execute 'alter function public.get_encrypted_credential(uuid,text,text) set search_path = public';
    execute 'revoke execute on function public.get_encrypted_credential(uuid,text,text) from public, anon, authenticated';
    execute 'grant execute on function public.get_encrypted_credential(uuid,text,text) to service_role';
  end if;

  if to_regprocedure('public.get_vcp_lookback(text[],date,integer)') is not null then
    execute 'alter function public.get_vcp_lookback(text[],date,integer) set search_path = public';
    execute 'revoke execute on function public.get_vcp_lookback(text[],date,integer) from public, anon, authenticated';
    execute 'grant execute on function public.get_vcp_lookback(text[],date,integer) to service_role';
  end if;

  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'alter function public.rls_auto_enable() set search_path = public';
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
    execute 'grant execute on function public.rls_auto_enable() to service_role';
  end if;
end $$;
