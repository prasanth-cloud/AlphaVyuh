-- These row triggers use only NEW fields and pg_catalog built-ins. Pinning
-- their path prevents role-controlled name resolution and clears advisor warnings.
alter function public.update_updated_at() set search_path = '';
alter function public.chart_workspaces_set_updated_at() set search_path = '';
alter function public.workflow_states_set_updated_at() set search_path = '';
alter function public.broker_credentials_set_updated_at() set search_path = '';
