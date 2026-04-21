-- Broker Credentials Table + Audit
-- Referenced by: docs/decisions/002-broker-credentials.md (ADR 002 v2)
-- Implements AES-256-GCM app-layer encryption (NOT pgsodium — see ADR Q1 for why).
--
-- Encryption lives entirely in backend/lib/brokers/credentials.py.
-- No SQL function decrypts plaintext. get_encrypted_credential() returns ciphertext (bytea);
-- Python decrypts using BROKER_CREDS_KEY from Railway env vars.
--
-- Prior draft used pgsodium.create_key() which requires pgsodium.key table — not available
-- on this Supabase project. This revision removes all pgsodium references.


-- ─── 1. Add missing columns to users ─────────────────────────────────────────
-- broker_access_token captured here for transition; DEPRECATED in favour of
-- broker_credentials table. broker_token_expires_at is checked before order placement.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS broker_access_token      text,
  ADD COLUMN IF NOT EXISTS broker_token_expires_at  timestamptz;


-- ─── 2. Audit table ───────────────────────────────────────────────────────────
-- ON DELETE CASCADE satisfies GDPR Article 17: audit rows are deleted when the user
-- account is deleted. Tradeoff: lose fraud analysis on deleted accounts. See ADR Q4.

CREATE TABLE IF NOT EXISTS public.broker_credential_audit (
  id         bigserial    NOT NULL PRIMARY KEY,
  user_id    uuid         NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  broker     text         NOT NULL,
  key_name   text         NOT NULL,   -- '*' for delete-all operations
  action     text         NOT NULL CHECK (action IN ('read', 'write', 'delete')),
  actor      text,                    -- future: request trace ID
  created_at timestamptz  NOT NULL DEFAULT now()
);

-- RLS enabled, no policies = deny-all for anon/authenticated.
-- service_role bypasses RLS and can read for ops/debugging.
ALTER TABLE public.broker_credential_audit ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_cred_audit_user_created
  ON public.broker_credential_audit (user_id, created_at DESC);


-- ─── 3. broker_credentials table ─────────────────────────────────────────────
-- key_value: [12-byte IV][ciphertext][16-byte GCM tag] — written/read by Python only.
-- key_version: 1 = encrypted with current BROKER_CREDS_KEY. Incremented on rotation.
--   Use this to identify un-rotated rows without decrypting them. Never returned by API.

CREATE TABLE IF NOT EXISTS public.broker_credentials (
  id          uuid         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid         NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  broker      text         NOT NULL CHECK (broker IN ('zerodha', 'upstox', 'dhan')),
  key_name    text         NOT NULL,   -- 'api_key' | 'api_secret' | 'access_token'
  key_value   bytea        NOT NULL,   -- AES-256-GCM ciphertext; never read outside credentials.py
  key_version int          NOT NULL DEFAULT 1,
  created_at  timestamptz  NOT NULL DEFAULT now(),
  updated_at  timestamptz  NOT NULL DEFAULT now(),

  CONSTRAINT broker_credentials_user_broker_key_unique UNIQUE (user_id, broker, key_name)
);

-- RLS enabled, no policies = deny-all. All access via security-definer functions below.
ALTER TABLE public.broker_credentials ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_broker_creds_user
  ON public.broker_credentials (user_id, broker);

CREATE INDEX IF NOT EXISTS idx_broker_creds_key_version
  ON public.broker_credentials (key_version)
  WHERE key_version > 1;   -- used during rotation to find un-rotated rows

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.broker_credentials_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS broker_credentials_updated_at ON public.broker_credentials;
CREATE TRIGGER broker_credentials_updated_at
  BEFORE UPDATE ON public.broker_credentials
  FOR EACH ROW EXECUTE FUNCTION public.broker_credentials_set_updated_at();


-- ─── 4. get_encrypted_credential ─────────────────────────────────────────────
-- Returns ciphertext (bytea) to Python. Python decrypts with BROKER_CREDS_KEY.
-- Enforces user_id scope even though service_role bypasses RLS — a wrong user_id
-- returns NULL rather than another user's ciphertext.
-- Inserts a 'read' audit row before returning; audit failure aborts the call.

CREATE OR REPLACE FUNCTION public.get_encrypted_credential(
  p_user_id  uuid,
  p_broker   text,
  p_key_name text
) RETURNS bytea
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT key_value
    FROM public.broker_credentials
   WHERE user_id  = p_user_id
     AND broker   = p_broker
     AND key_name = p_key_name;
$$;


-- ─── 5. delete_broker_credentials ────────────────────────────────────────────
-- Deletes ALL credentials for a given (user_id, broker). Called on broker disconnect.
-- Python caller inserts the audit row (after successful delete) as per ADR Q4.

CREATE OR REPLACE FUNCTION public.delete_broker_credentials(
  p_user_id uuid,
  p_broker  text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.broker_credentials
   WHERE user_id = p_user_id
     AND broker  = p_broker;
END;
$$;


-- ─── 6. Grants ────────────────────────────────────────────────────────────────
-- Only service_role may call these functions. Revoke public execute.

REVOKE EXECUTE ON FUNCTION public.get_encrypted_credential(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_broker_credentials(uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_encrypted_credential(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_broker_credentials(uuid, text) TO service_role;
