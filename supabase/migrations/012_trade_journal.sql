-- Trade Journal
CREATE TABLE IF NOT EXISTS public.trade_journal (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  symbol        text NOT NULL,
  company_name  text,
  trade_type    text NOT NULL CHECK (trade_type IN ('long', 'short')),
  setup_type    text,
  entry_date    date NOT NULL,
  entry_price   numeric(12,2) NOT NULL,
  quantity      integer NOT NULL,
  exit_date     date,
  exit_price    numeric(12,2),
  pnl           numeric(14,2),
  pnl_pct       numeric(8,4),
  holding_days  integer,
  stop_loss     numeric(12,2),
  target_price  numeric(12,2),
  risk_reward   numeric(6,2),
  entry_reason  text,
  exit_reason   text,
  mistakes      text,
  lessons       text,
  status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'cancelled')),
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

ALTER TABLE public.trade_journal ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own journal" ON public.trade_journal
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_journal_user ON public.trade_journal(user_id, entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_journal_symbol ON public.trade_journal(user_id, symbol);
CREATE INDEX IF NOT EXISTS idx_journal_status ON public.trade_journal(user_id, status);

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS journal_updated_at ON public.trade_journal;
CREATE TRIGGER journal_updated_at
  BEFORE UPDATE ON public.trade_journal
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at();
