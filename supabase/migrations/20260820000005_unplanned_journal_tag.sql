-- Make the no-setup path explicit for journal analytics and review.
-- Existing rows with no durable setup remain valid, but must not look like
-- planned trades simply because their legacy setup_type was null.

update public.trade_journal
set setup_type = 'unplanned'
where setup_id is null
  and (setup_type is null or btrim(setup_type) = '');
