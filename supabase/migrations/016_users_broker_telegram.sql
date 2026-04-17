-- Add broker integration + Telegram columns to users table
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS telegram_chat_id    text,
  ADD COLUMN IF NOT EXISTS broker_type         text,
  ADD COLUMN IF NOT EXISTS broker_api_key      text,
  ADD COLUMN IF NOT EXISTS broker_api_secret   text,
  ADD COLUMN IF NOT EXISTS broker_connected_at timestamptz;
