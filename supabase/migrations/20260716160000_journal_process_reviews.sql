-- Versioned, owner-private process reviews for completed journal trades.
-- Existing rows intentionally remain null/unknown; there is no backfill.

alter table public.trade_journal
  add column if not exists review_schema_version smallint,
  add column if not exists review_planned_setup text,
  add column if not exists review_setup_adherence text,
  add column if not exists review_rule_breaks text[],
  add column if not exists review_lesson text,
  add column if not exists reviewed_at timestamptz;

alter table public.trade_journal
  drop constraint if exists trade_journal_process_review_complete_check,
  add constraint trade_journal_process_review_complete_check
  check (
    (
      review_schema_version is null
      and review_planned_setup is null
      and review_setup_adherence is null
      and review_rule_breaks is null
      and review_lesson is null
      and reviewed_at is null
    )
    or (
      status = 'closed'
      and
      review_schema_version is not null
      and review_planned_setup is not null
      and review_setup_adherence is not null
      and review_rule_breaks is not null
      and review_lesson is not null
      and reviewed_at is not null
      and
      review_schema_version = 1
      and char_length(btrim(review_planned_setup)) between 1 and 80
      and review_setup_adherence in ('followed', 'partial', 'not_followed', 'not_applicable')
      and cardinality(review_rule_breaks) <= 6
      and review_rule_breaks <@ array[
        'setup_not_confirmed',
        'entry_outside_plan',
        'position_risk_exceeded',
        'stop_rule_broken',
        'exit_rule_broken',
        'other'
      ]::text[]
      and (
        (review_setup_adherence in ('followed', 'not_applicable') and cardinality(review_rule_breaks) = 0)
        or
        (review_setup_adherence in ('partial', 'not_followed') and cardinality(review_rule_breaks) >= 1)
      )
      and char_length(btrim(review_lesson)) between 1 and 500
    )
  );

comment on column public.trade_journal.review_schema_version
  is 'Null means unknown/unreviewed. Version 1 identifies a complete explicit process review.';
comment on column public.trade_journal.review_planned_setup
  is 'Trader-named setup assessed in the process review; not inferred from outcome.';
comment on column public.trade_journal.review_setup_adherence
  is 'Trader-recorded adherence: followed, partial, not_followed, or not_applicable.';
comment on column public.trade_journal.review_rule_breaks
  is 'Bounded V1 rule-break codes selected by the trader.';
comment on column public.trade_journal.review_lesson
  is 'One trader-written process lesson for this completed trade.';
comment on column public.trade_journal.reviewed_at
  is 'Server timestamp for the latest complete process-review write.';

create or replace function public.protect_journal_process_review_metadata()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    if coalesce(auth.role(), '') <> 'service_role' and (
      new.review_schema_version is not null
      or new.review_planned_setup is not null
      or new.review_setup_adherence is not null
      or new.review_rule_breaks is not null
      or new.review_lesson is not null
      or new.reviewed_at is not null
    ) then
      raise exception 'journal process-review metadata is server-owned';
    end if;
    return new;
  end if;

  if coalesce(auth.role(), '') <> 'service_role' and (
    new.review_schema_version is distinct from old.review_schema_version
    or new.review_planned_setup is distinct from old.review_planned_setup
    or new.review_setup_adherence is distinct from old.review_setup_adherence
    or new.review_rule_breaks is distinct from old.review_rule_breaks
    or new.review_lesson is distinct from old.review_lesson
    or new.reviewed_at is distinct from old.reviewed_at
  ) then
    raise exception 'journal process-review metadata is server-owned';
  end if;
  return new;
end;
$$;

drop trigger if exists journal_process_review_server_owned on public.trade_journal;
create trigger journal_process_review_server_owned
  before insert or update on public.trade_journal
  for each row execute function public.protect_journal_process_review_metadata();

create index if not exists idx_trade_journal_user_closed_exit_date
  on public.trade_journal (user_id, exit_date desc)
  where status = 'closed';

-- One statement produces one MVCC snapshot for the complete aggregate input.
create or replace function public.get_journal_weekly_review_rows(
  p_user_id uuid,
  p_period_start date,
  p_period_end date,
  p_entry_date_cutoff date default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', journal.id,
        'symbol', journal.symbol,
        'entry_date', journal.entry_date,
        'exit_date', journal.exit_date,
        'review_schema_version', journal.review_schema_version,
        'review_planned_setup', journal.review_planned_setup,
        'review_setup_adherence', journal.review_setup_adherence,
        'review_rule_breaks', journal.review_rule_breaks,
        'review_lesson', journal.review_lesson
      ) order by journal.exit_date, journal.id
    ),
    '[]'::jsonb
  )
  from public.trade_journal as journal
  where p_user_id = auth.uid()
    and journal.user_id = p_user_id
    and journal.status = 'closed'
    and journal.exit_date between p_period_start and p_period_end
    and (
      p_entry_date_cutoff is null
      or journal.entry_date >= p_entry_date_cutoff
    );
$$;

revoke all on function public.get_journal_weekly_review_rows(uuid, date, date, date)
  from public, anon, authenticated;
grant execute on function public.get_journal_weekly_review_rows(uuid, date, date, date)
  to authenticated;

-- Drill-through uses the same single-snapshot, owner/week/status boundary and
-- returns only the requested intersection. Full rows let the existing journal
-- ledger render evidence without a second mutable read.
create or replace function public.get_journal_weekly_review_evidence(
  p_user_id uuid,
  p_week_start date,
  p_week_end date,
  p_entry_ids uuid[],
  p_rule_break text default null,
  p_entry_date_cutoff date default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select coalesce(
    jsonb_agg(to_jsonb(journal) order by journal.exit_date, journal.id),
    '[]'::jsonb
  )
  from public.trade_journal as journal
  where p_user_id = auth.uid()
    and journal.user_id = p_user_id
    and journal.status = 'closed'
    and journal.exit_date between p_week_start and p_week_end
    and journal.id = any(p_entry_ids)
    and (
      p_entry_date_cutoff is null
      or journal.entry_date >= p_entry_date_cutoff
    )
    and (
      p_rule_break is null
      or coalesce(journal.review_rule_breaks, array[]::text[]) @> array[p_rule_break]
    );
$$;

revoke all on function public.get_journal_weekly_review_evidence(uuid, date, date, uuid[], text, date)
  from public, anon, authenticated;
grant execute on function public.get_journal_weekly_review_evidence(uuid, date, date, uuid[], text, date)
  to authenticated;
