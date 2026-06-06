-- Allow broker-import as a trade_journal source_page value (journal auto-capture from broker sync).

alter table public.trade_journal
  drop constraint if exists trade_journal_source_page_check;

alter table public.trade_journal
  add constraint trade_journal_source_page_check
  check (source_page is null or source_page in ('chart', 'watchlist', 'scanner', 'manual', 'broker-import'));
