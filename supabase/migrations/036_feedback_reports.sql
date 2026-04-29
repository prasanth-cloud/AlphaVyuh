-- Private beta feedback and data issue reports.

create table if not exists public.feedback_reports (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.users(id) on delete set null,
  category    text not null default 'general'
    check (category in ('general', 'bug', 'data_issue', 'feature_request')),
  page        text,
  symbol      text,
  severity    text not null default 'normal'
    check (severity in ('low', 'normal', 'high')),
  message     text not null check (length(trim(message)) >= 3),
  context     jsonb not null default '{}'::jsonb,
  status      text not null default 'new'
    check (status in ('new', 'triaged', 'resolved', 'closed')),
  created_at  timestamptz not null default now()
);

create index if not exists idx_feedback_reports_created_at on public.feedback_reports(created_at desc);
create index if not exists idx_feedback_reports_status on public.feedback_reports(status);
create index if not exists idx_feedback_reports_symbol on public.feedback_reports(symbol);
