-- Launch advisor security hardening.
--
-- Generated from a read-only Supabase advisor pass against the documented staging
-- project ref. This migration does not enable live orders, billing, or new data
-- providers; it only tightens function execution grants and function search paths.

-- SECURITY DEFINER functions should not inherit a mutable search_path.
ALTER FUNCTION IF EXISTS public.handle_new_user()
  SET search_path = public;

ALTER FUNCTION IF EXISTS public.update_updated_at()
  SET search_path = public;

ALTER FUNCTION IF EXISTS public.broker_credentials_set_updated_at()
  SET search_path = public;

ALTER FUNCTION IF EXISTS public.workflow_states_set_updated_at()
  SET search_path = public;

ALTER FUNCTION IF EXISTS public.compute_rs_score_for_date(date)
  SET search_path = public;

ALTER FUNCTION IF EXISTS public.get_vcp_lookback(text[], date, int)
  SET search_path = public;

ALTER FUNCTION IF EXISTS public.get_encrypted_credential(uuid, text, text)
  SET search_path = public;

ALTER FUNCTION IF EXISTS public.delete_broker_credentials(uuid, text)
  SET search_path = public;

-- These functions are backend/service-role implementation details. Revoke direct
-- browser/API execution and grant only to service_role where backend jobs need it.
REVOKE EXECUTE ON FUNCTION public.compute_rs_score_for_date(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.compute_rs_score_for_date(date) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_vcp_lookback(text[], date, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_vcp_lookback(text[], date, int) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_encrypted_credential(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_encrypted_credential(uuid, text, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.delete_broker_credentials(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_broker_credentials(uuid, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

