-- ⚠️ ADR 010 — Schema provenance normalisation
-- Resolves potential drift between dashboard-era objects and local migration files.
-- Each statement is idempotent (DROP IF EXISTS / CREATE ... IF NOT EXISTS).
--
-- Risk categories addressed:
--   1. RLS policy name mismatches (dashboard default: "Enable X for users based on user_id")
--   2. Duplicate triggers from dashboard-era schema changes
--   3. Function signature alignment

-- ── 1. RLS policy dedup ──────────────────────────────────────────────────────
-- Dashboard-era Supabase UI creates policies with default names like:
--   "Enable insert for users based on user_id"
--   "Enable read access for all users"
--   "Enable delete for users based on user_id"
-- These may coexist with the canonical names from local migrations.
-- Drop the dashboard-era names; the canonical policies already cover the access.

-- users
DROP POLICY IF EXISTS "Enable read access for all users" ON public.users;
DROP POLICY IF EXISTS "Enable insert for users based on user_id" ON public.users;
DROP POLICY IF EXISTS "Enable update for users based on user_id" ON public.users;
DROP POLICY IF EXISTS "Enable delete for users based on user_id" ON public.users;

-- saved_screens
DROP POLICY IF EXISTS "Enable insert for users based on user_id" ON public.saved_screens;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.saved_screens;
DROP POLICY IF EXISTS "Enable update for users based on user_id" ON public.saved_screens;
DROP POLICY IF EXISTS "Enable delete for users based on user_id" ON public.saved_screens;
DROP POLICY IF EXISTS "Enable CRUD for users based on user_id" ON public.saved_screens;

-- watchlists
DROP POLICY IF EXISTS "Enable insert for users based on user_id" ON public.watchlists;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.watchlists;
DROP POLICY IF EXISTS "Enable update for users based on user_id" ON public.watchlists;
DROP POLICY IF EXISTS "Enable delete for users based on user_id" ON public.watchlists;
DROP POLICY IF EXISTS "Enable CRUD for users based on user_id" ON public.watchlists;

-- watchlist_items
DROP POLICY IF EXISTS "Enable insert for users based on user_id" ON public.watchlist_items;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.watchlist_items;
DROP POLICY IF EXISTS "Enable update for users based on user_id" ON public.watchlist_items;
DROP POLICY IF EXISTS "Enable delete for users based on user_id" ON public.watchlist_items;
DROP POLICY IF EXISTS "Enable CRUD for users based on user_id" ON public.watchlist_items;

-- chart_layouts
DROP POLICY IF EXISTS "Enable insert for users based on user_id" ON public.chart_layouts;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.chart_layouts;
DROP POLICY IF EXISTS "Enable update for users based on user_id" ON public.chart_layouts;
DROP POLICY IF EXISTS "Enable CRUD for users based on user_id" ON public.chart_layouts;

-- drawings
DROP POLICY IF EXISTS "Enable insert for users based on user_id" ON public.drawings;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.drawings;
DROP POLICY IF EXISTS "Enable update for users based on user_id" ON public.drawings;
DROP POLICY IF EXISTS "Enable CRUD for users based on user_id" ON public.drawings;

-- trade_journal
DROP POLICY IF EXISTS "Enable insert for users based on user_id" ON public.trade_journal;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.trade_journal;
DROP POLICY IF EXISTS "Enable update for users based on user_id" ON public.trade_journal;
DROP POLICY IF EXISTS "Enable delete for users based on user_id" ON public.trade_journal;
DROP POLICY IF EXISTS "Enable CRUD for users based on user_id" ON public.trade_journal;

-- shared_screens
DROP POLICY IF EXISTS "Enable insert for users based on user_id" ON public.shared_screens;
DROP POLICY IF EXISTS "Enable update for users based on user_id" ON public.shared_screens;
DROP POLICY IF EXISTS "Enable CRUD for users based on user_id" ON public.shared_screens;

-- screen_upvotes
DROP POLICY IF EXISTS "Enable insert for users based on user_id" ON public.screen_upvotes;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.screen_upvotes;
DROP POLICY IF EXISTS "Enable CRUD for users based on user_id" ON public.screen_upvotes;

-- subscriptions
DROP POLICY IF EXISTS "Enable read access for all users" ON public.subscriptions;
DROP POLICY IF EXISTS "Enable CRUD for users based on user_id" ON public.subscriptions;

-- price_alerts
DROP POLICY IF EXISTS "Enable insert for users based on user_id" ON public.price_alerts;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.price_alerts;
DROP POLICY IF EXISTS "Enable CRUD for users based on user_id" ON public.price_alerts;

-- broker_credentials
DROP POLICY IF EXISTS "Enable insert for users based on user_id" ON public.broker_credentials;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.broker_credentials;
DROP POLICY IF EXISTS "Enable CRUD for users based on user_id" ON public.broker_credentials;

-- order_idempotency
DROP POLICY IF EXISTS "Enable insert for users based on user_id" ON public.order_idempotency;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.order_idempotency;
DROP POLICY IF EXISTS "Enable CRUD for users based on user_id" ON public.order_idempotency;

-- ── 2. Trigger dedup ────────────────────────────────────────────────────────
-- The ADR 010 M1 signup trigger incident: dashboard-era trigger names differ
-- from local migration names. Drop known dashboard-era naming patterns.

-- auth.users signup trigger — canonical name is "on_auth_user_created"
DROP TRIGGER IF EXISTS "on_auth_user_created_trigger" ON auth.users;
DROP TRIGGER IF EXISTS "handle_new_user_trigger" ON auth.users;
DROP TRIGGER IF EXISTS "create_user_profile" ON auth.users;

-- trade_journal updated_at — canonical name is "journal_updated_at"
DROP TRIGGER IF EXISTS "set_updated_at" ON public.trade_journal;
DROP TRIGGER IF EXISTS "trade_journal_updated_at" ON public.trade_journal;
DROP TRIGGER IF EXISTS "update_trade_journal_updated_at" ON public.trade_journal;

-- ── 3. Function alignment ───────────────────────────────────────────────────
-- CREATE OR REPLACE is idempotent on body, so re-applying canonical functions
-- ensures the local-file version is active. Only functions from 001-031 scope.

-- handle_new_user (001_users.sql) — ensure SECURITY DEFINER is set
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, avatar_url)
  VALUES (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;

-- update_updated_at (012_trade_journal.sql)
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;
