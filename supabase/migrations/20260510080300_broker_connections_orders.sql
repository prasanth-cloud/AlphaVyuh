-- Broker connection metadata and order audit logs.
--
-- Token storage intentionally stays in public.broker_credentials, which already
-- uses app-layer AES-GCM encryption and credential audit logs. This table keeps
-- sanitized connection/account metadata for status screens and sync timestamps.

CREATE TABLE IF NOT EXISTS public.broker_connections (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  broker text NOT NULL CHECK (broker IN ('zerodha', 'upstox')),
  broker_user_id text,
  broker_user_name text,
  token_expires_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  connected_at timestamptz NOT NULL DEFAULT now(),
  last_synced_at timestamptz,
  connection_status text NOT NULL DEFAULT 'connected_read_only',
  scopes jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(user_id, broker)
);

CREATE INDEX IF NOT EXISTS broker_connections_user_idx
  ON public.broker_connections(user_id);

ALTER TABLE public.broker_connections ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'broker_connections'
      AND policyname = 'broker_connections_owner'
  ) THEN
    CREATE POLICY broker_connections_owner ON public.broker_connections
      FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.broker_orders (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  broker text NOT NULL CHECK (broker IN ('simulated', 'zerodha', 'upstox')),
  broker_order_id text,
  journal_id uuid,
  symbol text NOT NULL,
  exchange text NOT NULL DEFAULT 'NSE',
  side text NOT NULL CHECK (side IN ('BUY', 'SELL')),
  quantity integer NOT NULL CHECK (quantity > 0),
  order_type text NOT NULL CHECK (order_type IN ('MARKET', 'LIMIT', 'SL', 'SL-M')),
  price numeric,
  trigger_price numeric,
  status text NOT NULL DEFAULT 'PENDING',
  idempotency_key text,
  placed_at timestamptz NOT NULL DEFAULT now(),
  raw_response jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS broker_orders_user_idx
  ON public.broker_orders(user_id, placed_at DESC);

CREATE INDEX IF NOT EXISTS broker_orders_user_broker_id_idx
  ON public.broker_orders(user_id, broker, broker_order_id)
  WHERE broker_order_id IS NOT NULL;

ALTER TABLE public.broker_orders ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'broker_orders'
      AND policyname = 'broker_orders_owner'
  ) THEN
    CREATE POLICY broker_orders_owner ON public.broker_orders
      FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
