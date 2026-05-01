create table if not exists public.chart_workspaces (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  symbol      text not null,
  timeframe   text not null,
  indicators  jsonb not null default '[]'::jsonb,
  drawings    jsonb not null default '[]'::jsonb,
  updated_at  timestamptz not null default now(),
  unique (user_id, symbol, timeframe)
);

insert into public.chart_workspaces (user_id, symbol, timeframe, indicators, drawings, updated_at)
select
  cl.user_id,
  upper(cl.symbol),
  cl.timeframe,
  to_jsonb(cl.indicators),
  coalesce(d.drawings, '[]'::jsonb),
  coalesce(cl.updated_at, now())
from public.chart_layouts cl
left join (
  select
    user_id,
    upper(symbol) as symbol,
    timeframe,
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'kind', case
          when lower(tool_type) in ('horizontal', 'hline', 'horizontalray', 'hray') then 'hline'
          else 'trendline'
        end,
        'p1', points->0,
        'p2', points->1,
        'price', coalesce((points->0->>'price')::numeric, (points->1->>'price')::numeric),
        'color', coalesce(style->>'color', '#f4f7fb'),
        'width', coalesce((style->>'width')::int, 2),
        'label', style->>'label'
      )
      order by created_at
    ) as drawings
  from public.drawings
  group by user_id, upper(symbol), timeframe
) d on d.user_id = cl.user_id and d.symbol = upper(cl.symbol) and d.timeframe = cl.timeframe
on conflict (user_id, symbol, timeframe) do update
set indicators = excluded.indicators,
    drawings = excluded.drawings,
    updated_at = excluded.updated_at;

insert into public.chart_workspaces (user_id, symbol, timeframe, indicators, drawings, updated_at)
select
  user_id,
  upper(symbol),
  timeframe,
  '[]'::jsonb,
  jsonb_agg(
    jsonb_build_object(
      'id', id,
      'kind', case
        when lower(tool_type) in ('horizontal', 'hline', 'horizontalray', 'hray') then 'hline'
        else 'trendline'
      end,
      'p1', points->0,
      'p2', points->1,
      'price', coalesce((points->0->>'price')::numeric, (points->1->>'price')::numeric),
      'color', coalesce(style->>'color', '#f4f7fb'),
      'width', coalesce((style->>'width')::int, 2),
      'label', style->>'label'
    )
    order by created_at
  ),
  now()
from public.drawings
group by user_id, upper(symbol), timeframe
on conflict (user_id, symbol, timeframe) do update
set drawings = excluded.drawings,
    updated_at = excluded.updated_at;

alter table public.chart_workspaces enable row level security;

drop policy if exists "Users can manage own chart workspaces" on public.chart_workspaces;
create policy "Users can manage own chart workspaces" on public.chart_workspaces
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.chart_workspaces_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists chart_workspaces_updated_at on public.chart_workspaces;
create trigger chart_workspaces_updated_at
  before update on public.chart_workspaces
  for each row execute function public.chart_workspaces_set_updated_at();

drop table if exists public.drawings;
