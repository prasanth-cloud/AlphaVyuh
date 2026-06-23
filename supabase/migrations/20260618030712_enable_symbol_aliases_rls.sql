-- Symbol aliases are public market-reference data, but exposed-schema tables
-- still need RLS enabled so access is explicit and auditable.
alter table public.symbol_aliases enable row level security;

drop policy if exists "Public read symbol aliases"
  on public.symbol_aliases;

create policy "Public read symbol aliases"
  on public.symbol_aliases
  for select
  to anon, authenticated
  using (true);
