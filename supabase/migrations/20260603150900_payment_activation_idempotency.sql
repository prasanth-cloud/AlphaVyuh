-- Durable Razorpay payment activation idempotency.

create table if not exists public.payment_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  razorpay_order_id text not null,
  razorpay_payment_id text not null,
  plan text not null check (plan in ('pro', 'elite')),
  amount integer not null check (amount >= 0),
  currency text not null default 'INR' check (currency in ('INR','USD')),
  billing text check (billing in ('monthly', 'annual', 'access_code')),
  status text not null default 'success',
  plan_expires_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.payment_logs
  add column if not exists user_id uuid references public.users(id) on delete cascade,
  add column if not exists razorpay_order_id text,
  add column if not exists razorpay_payment_id text,
  add column if not exists plan text,
  add column if not exists amount integer not null default 0,
  add column if not exists currency text not null default 'INR',
  add column if not exists billing text check (billing in ('monthly', 'annual', 'access_code')),
  add column if not exists status text not null default 'success',
  add column if not exists plan_expires_at timestamptz,
  add column if not exists created_at timestamptz not null default now(),
  alter column amount set default 0,
  alter column currency set default 'INR',
  alter column status set default 'success';

update public.payment_logs
set
  razorpay_order_id = coalesce(nullif(razorpay_order_id, ''), 'legacy-' || id::text),
  razorpay_payment_id = coalesce(nullif(razorpay_payment_id, ''), 'legacy-' || id::text),
  plan = case when plan in ('pro', 'elite') then plan else 'pro' end,
  amount = case when amount is null or amount < 0 then 0 else amount end,
  currency = case when currency in ('INR', 'USD') then currency else 'INR' end,
  status = coalesce(nullif(status, ''), 'success'),
  created_at = coalesce(created_at, now());

with duplicate_payments as (
  select
    id,
    razorpay_payment_id,
    row_number() over (
      partition by razorpay_payment_id
      order by created_at desc nulls last, id desc
    ) as duplicate_rank
  from public.payment_logs
  where razorpay_payment_id not like 'access-%'
)
update public.payment_logs p
set razorpay_payment_id = p.razorpay_payment_id || '-legacy-' || p.id::text
from duplicate_payments d
where p.id = d.id
  and d.duplicate_rank > 1;

alter table public.payment_logs
  alter column razorpay_payment_id set not null,
  alter column razorpay_order_id set not null,
  alter column plan set not null,
  alter column amount set not null,
  alter column currency set not null,
  alter column status set not null,
  alter column created_at set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.payment_logs'::regclass
      and conname = 'payment_logs_plan_check'
  ) then
    alter table public.payment_logs
      add constraint payment_logs_plan_check check (plan in ('pro', 'elite')) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.payment_logs'::regclass
      and conname = 'payment_logs_amount_check'
  ) then
    alter table public.payment_logs
      add constraint payment_logs_amount_check check (amount >= 0) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.payment_logs'::regclass
      and conname = 'payment_logs_currency_check'
  ) then
    alter table public.payment_logs
      add constraint payment_logs_currency_check check (currency in ('INR','USD')) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.payment_logs'::regclass
      and conname = 'payment_logs_billing_check'
  ) then
    alter table public.payment_logs
      add constraint payment_logs_billing_check check (billing in ('monthly', 'annual', 'access_code')) not valid;
  end if;
end $$;

alter table public.payment_logs validate constraint payment_logs_plan_check;
alter table public.payment_logs validate constraint payment_logs_amount_check;
alter table public.payment_logs validate constraint payment_logs_currency_check;
alter table public.payment_logs validate constraint payment_logs_billing_check;

create unique index if not exists idx_payment_logs_razorpay_payment_id
  on public.payment_logs (razorpay_payment_id)
  where razorpay_payment_id not like 'access-%';

create index if not exists idx_payment_logs_user_created_at
  on public.payment_logs (user_id, created_at desc);

alter table public.payment_logs enable row level security;

drop policy if exists "Users can read own payment logs" on public.payment_logs;
create policy "Users can read own payment logs"
  on public.payment_logs for select
  using (auth.uid() = user_id);

revoke all on table public.payment_logs from anon, authenticated;
grant select on table public.payment_logs to authenticated;
grant all on table public.payment_logs to service_role;

create or replace function public.activate_razorpay_payment(
  p_user_id uuid,
  p_plan text,
  p_currency text,
  p_billing text,
  p_razorpay_order_id text,
  p_razorpay_payment_id text,
  p_amount integer,
  p_plan_days integer
)
returns table(status text, plan text, expires_at timestamptz, currency text, billing text, replayed boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_payment record;
  new_expires_at timestamptz := now() + make_interval(days => p_plan_days);
begin
  select *
    into existing_payment
    from public.payment_logs
    where razorpay_payment_id = p_razorpay_payment_id
    limit 1;

  if found then
    return query select
      'success'::text,
      existing_payment.plan,
      existing_payment.plan_expires_at,
      existing_payment.currency,
      coalesce(existing_payment.billing, p_billing),
      true;
    return;
  end if;

  insert into public.payment_logs (
    user_id,
    razorpay_order_id,
    razorpay_payment_id,
    plan,
    amount,
    currency,
    billing,
    status,
    plan_expires_at
  )
  values (
    p_user_id,
    p_razorpay_order_id,
    p_razorpay_payment_id,
    p_plan,
    p_amount,
    p_currency,
    p_billing,
    'success',
    new_expires_at
  );

  update public.users
    set plan = p_plan,
        plan_expires_at = new_expires_at,
        billing_currency = p_currency,
        billing_period = p_billing
    where id = p_user_id;

  if not found then
    raise exception 'payment activation user not found';
  end if;

  return query select 'success'::text, p_plan, new_expires_at, p_currency, p_billing, false;
exception
  when unique_violation then
    select *
      into existing_payment
      from public.payment_logs
      where razorpay_payment_id = p_razorpay_payment_id
      limit 1;
    return query select
      'success'::text,
      existing_payment.plan,
      existing_payment.plan_expires_at,
      existing_payment.currency,
      coalesce(existing_payment.billing, p_billing),
      true;
end;
$$;

revoke execute on function public.activate_razorpay_payment(uuid, text, text, text, text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.activate_razorpay_payment(uuid, text, text, text, text, text, integer, integer)
  to service_role;
