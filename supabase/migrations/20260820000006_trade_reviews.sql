-- Durable post-trade review records.
--
-- trade_journal remains the execution ledger. A trade_review is the user's
-- review artifact for that ledger row, with one owner-scoped record per
-- journal entry. The legacy mistakes/lessons columns remain readable during
-- the transition; the review table is the durable home for new review data.

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.trade_journal'::regclass
      and conname = 'trade_journal_user_id_id_key'
  ) then
    alter table public.trade_journal
      add constraint trade_journal_user_id_id_key unique (user_id, id);
  end if;
end
$$;

create table if not exists public.trade_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  journal_entry_id uuid not null,
  setup_id uuid,
  status text not null default 'draft'
    check (status in ('draft', 'completed')),
  plan_adherence text not null default 'unknown'
    check (plan_adherence in ('followed', 'partial', 'not_followed', 'unknown')),
  mistakes text,
  lesson text,
  follow_up text,
  source text not null default 'manual'
    check (source in ('manual', 'generated', 'journal_sync')),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, journal_entry_id),
  unique (user_id, id),
  constraint trade_reviews_user_journal_fkey
    foreign key (user_id, journal_entry_id)
    references public.trade_journal (user_id, id)
    on delete cascade,
  constraint trade_reviews_user_setup_fkey
    foreign key (user_id, setup_id)
    references public.setups (user_id, id)
    on delete set null
);

alter table public.trade_reviews enable row level security;

drop policy if exists trade_reviews_owner on public.trade_reviews;
create policy trade_reviews_owner
  on public.trade_reviews
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create index if not exists trade_reviews_user_updated_idx
  on public.trade_reviews (user_id, updated_at desc);

create index if not exists trade_reviews_user_setup_idx
  on public.trade_reviews (user_id, setup_id, updated_at desc)
  where setup_id is not null;

create or replace function public.trade_reviews_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end
$$ language plpgsql;

drop trigger if exists trade_reviews_updated_at on public.trade_reviews;
create trigger trade_reviews_updated_at
  before update on public.trade_reviews
  for each row execute function public.trade_reviews_set_updated_at();

-- Older journal clients already submit mistakes/lessons through the journal
-- PATCH endpoint. Keep those writes durable without making old clients know
-- about the new review resource. Explicit review API writes are not touched by
-- this trigger, so plan_adherence and follow_up survive journal updates.
create or replace function public.sync_trade_review_from_journal()
returns trigger as $$
declare
  next_status text;
  next_reviewed_at timestamptz;
begin
  if new.status = 'closed'
     and (
       nullif(btrim(coalesce(new.mistakes, '')), '') is not null
       or nullif(btrim(coalesce(new.lessons, '')), '') is not null
     ) then
    next_status := case
      when nullif(btrim(coalesce(new.lessons, '')), '') is not null then 'completed'
      else 'draft'
    end;
    next_reviewed_at := case when next_status = 'completed' then now() else null end;

    insert into public.trade_reviews as current_review (
      user_id,
      journal_entry_id,
      setup_id,
      status,
      mistakes,
      lesson,
      source,
      reviewed_at
    ) values (
      new.user_id,
      new.id,
      new.setup_id,
      next_status,
      nullif(btrim(new.mistakes), ''),
      nullif(btrim(new.lessons), ''),
      'journal_sync',
      next_reviewed_at
    )
    on conflict (user_id, journal_entry_id) do update
      set setup_id = excluded.setup_id,
          status = excluded.status,
          mistakes = excluded.mistakes,
          lesson = excluded.lesson,
          reviewed_at = case
            when excluded.status = 'completed' then coalesce(current_review.reviewed_at, now())
            else null
          end,
          updated_at = now();
  end if;
  return new;
end
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trade_journal_review_sync on public.trade_journal;
create trigger trade_journal_review_sync
  after insert or update of status, setup_id, mistakes, lessons on public.trade_journal
  for each row execute function public.sync_trade_review_from_journal();

comment on table public.trade_reviews is
  'Durable owner-scoped post-trade review artifact joined to one trade_journal entry and optional setup.';

comment on column public.trade_reviews.plan_adherence is
  'User assessment of whether the recorded setup plan was followed; it is not an investment recommendation.';
