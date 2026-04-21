-- Broker Credentials Table
-- Referenced by: docs/decisions/002-broker-credentials.md
-- Implements the pgsodium secret-box encryption design approved in ADR 002.
--
-- Overview:
--   Plaintext broker credentials (api_key, api_secret, access_token) are stored
--   encrypted using pgsodium AEAD. Application code MUST call the security-definer
--   functions below — never read/write public.broker_credentials directly.
--
-- Transition plan:
--   The plaintext columns (broker_api_key, broker_api_secret, broker_access_token)
--   on public.users remain for the duration of the transition. New writes use
--   upsert_broker_credential(). Reads are migrated in the feat/kite-adapter branch.
--   Drop the users columns in a subsequent migration once broker.py is fully migrated.


-- ─── 1. Add missing columns to users ─────────────────────────────────────────
-- broker_access_token was added to the live DB but never captured in a migration.
-- broker_token_expires_at tracks Zerodha's daily session expiry (required before
-- placing orders — stale token = silent simulated-mode fallback, which is a bug).

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS broker_access_token   text,            -- DEPRECATED: use broker_credentials table
  ADD COLUMN IF NOT EXISTS broker_token_expires_at timestamptz;   -- must be checked before order placement


-- ─── 2. Audit table ───────────────────────────────────────────────────────────
-- Records every credential read, write, and delete. Write-only from security-definer
-- functions; no direct client access. No delete policy — rows are pruned by a
-- scheduled job, not by clients. Audit insert failure aborts the parent transaction.

CREATE TABLE IF NOT EXISTS public.broker_credential_audit (
  id         bigserial   NOT NULL PRIMARY KEY,
  user_id    uuid        NOT NULL,   -- not FK'd to avoid cascade deletes removing audit trail
  broker     text        NOT NULL,
  key_name   text        NOT NULL,   -- '*' for delete-all operations
  action     text        NOT NULL CHECK (action IN ('read', 'write', 'delete')),
  actor      text,                   -- future: request trace ID or 'scheduler'
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS: enabled with no policies = deny-all for anon/authenticated roles.
-- service_role bypasses RLS and can read audit rows for admin purposes.
ALTER TABLE public.broker_credential_audit ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_cred_audit_user_created
  ON public.broker_credential_audit (user_id, created_at DESC);


-- ─── 3. broker_credentials table ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.broker_credentials (
  id         uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  broker     text        NOT NULL CHECK (broker IN ('zerodha', 'upstox', 'dhan')),
  -- key_name: logical name for this credential slot, e.g. 'api_key', 'api_secret', 'access_token'
  key_name   text        NOT NULL,
  -- pgsodium AEAD ciphertext. Decrypt via get_broker_credential() only.
  -- AEAD additional data = user_id || '.' || broker || '.' || key_name
  -- which binds each ciphertext to its row context — prevents row-swapping attacks.
  key_value  bytea       NOT NULL,
  -- UUID of the pgsodium.key used to encrypt this row.
  -- Stored per-row so individual key rotation is possible without re-encrypting all rows.
  key_id     uuid        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT broker_credentials_user_broker_key_unique UNIQUE (user_id, broker, key_name)
);

-- RLS: enabled with no policies = deny-all.
-- All access must go through the security-definer functions below.
ALTER TABLE public.broker_credentials ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_broker_creds_user
  ON public.broker_credentials (user_id, broker);

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


-- ─── 4. pgsodium key setup ────────────────────────────────────────────────────
-- Creates the 'broker_credentials' key in pgsodium Vault if it does not exist.
-- Idempotent: safe to run on re-migration or new environments.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pgsodium.key WHERE name = 'broker_credentials') THEN
    PERFORM pgsodium.create_key('aead-det', 'broker_credentials');
  END IF;
END;
$$;


-- ─── 5. upsert_broker_credential ─────────────────────────────────────────────
-- Called by the backend (service role) after a successful broker OAuth callback.
-- Encrypts the plaintext value with pgsodium AEAD before storing.
-- Idempotent: subsequent calls for the same (user_id, broker, key_name) update in place.
--
-- Parameters:
--   p_user_id  — the authenticated user (validated by caller via JWT middleware)
--   p_broker   — 'zerodha' | 'upstox' | 'dhan'
--   p_key_name — 'api_key' | 'api_secret' | 'access_token'
--   p_value    — plaintext credential value

CREATE OR REPLACE FUNCTION public.upsert_broker_credential(
  p_user_id  uuid,
  p_broker   text,
  p_key_name text,
  p_value    text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgsodium
AS $$
DECLARE
  v_key_id uuid;
  v_cipher bytea;
  v_aad    bytea;
BEGIN
  -- Resolve the shared broker_credentials pgsodium key
  SELECT id INTO v_key_id FROM pgsodium.key WHERE name = 'broker_credentials' LIMIT 1;
  IF v_key_id IS NULL THEN
    RAISE EXCEPTION 'pgsodium key "broker_credentials" not found. Apply migration 026 or run setup.';
  END IF;

  -- Additional authenticated data binds this ciphertext to its exact row context.
  -- A ciphertext moved to a different (user_id, broker, key_name) row will fail to decrypt.
  v_aad    := convert_to(p_user_id::text || '.' || p_broker || '.' || p_key_name, 'utf8');
  v_cipher := pgsodium.crypto_aead_det_encrypt(convert_to(p_value, 'utf8'), v_aad, v_key_id);

  INSERT INTO public.broker_credentials (user_id, broker, key_name, key_value, key_id)
    VALUES (p_user_id, p_broker, p_key_name, v_cipher, v_key_id)
    ON CONFLICT (user_id, broker, key_name) DO UPDATE
      SET key_value  = EXCLUDED.key_value,
          key_id     = EXCLUDED.key_id,
          updated_at = now();

  INSERT INTO public.broker_credential_audit (user_id, broker, key_name, action)
    VALUES (p_user_id, p_broker, p_key_name, 'write');
END;
$$;


-- ─── 6. get_broker_credential ────────────────────────────────────────────────
-- Called by the backend (service role) to decrypt a credential at use-time.
-- Enforces user_id scope even though service_role bypasses RLS — a logic bug
-- passing the wrong user_id returns NULL rather than another user's credential.
-- Inserts an audit row BEFORE decryption; a failed audit insert aborts the call.
--
-- Returns NULL if no credential exists for the given (user_id, broker, key_name).

CREATE OR REPLACE FUNCTION public.get_broker_credential(
  p_user_id  uuid,
  p_broker   text,
  p_key_name text
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgsodium
AS $$
DECLARE
  v_cipher bytea;
  v_key_id uuid;
  v_aad    bytea;
BEGIN
  SELECT key_value, key_id
    INTO v_cipher, v_key_id
    FROM public.broker_credentials
   WHERE user_id  = p_user_id
     AND broker   = p_broker
     AND key_name = p_key_name;

  IF NOT FOUND THEN
    -- Returns NULL, not an exception, so callers can check IS NULL.
    -- Note: timing difference between found/not-found leaks 1 bit (user has
    -- a credential for this broker). Acceptable at current threat model.
    RETURN NULL;
  END IF;

  -- Audit insert before decryption. If this fails, the whole function fails —
  -- no credential is returned without an audit trail.
  INSERT INTO public.broker_credential_audit (user_id, broker, key_name, action)
    VALUES (p_user_id, p_broker, p_key_name, 'read');

  v_aad := convert_to(p_user_id::text || '.' || p_broker || '.' || p_key_name, 'utf8');

  RETURN convert_from(
    pgsodium.crypto_aead_det_decrypt(v_cipher, v_aad, v_key_id),
    'utf8'
  );
END;
$$;


-- ─── 7. delete_broker_credentials ────────────────────────────────────────────
-- Called when a user disconnects a broker (deletes ALL credentials for that broker).
-- A single audit row with key_name='*' records the bulk delete.

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

  -- Audit even if nothing was deleted (idempotent disconnect is safe)
  INSERT INTO public.broker_credential_audit (user_id, broker, key_name, action)
    VALUES (p_user_id, p_broker, '*', 'delete');
END;
$$;


-- ─── 8. Grants ────────────────────────────────────────────────────────────────
-- Only service_role calls these functions. Revoke public execute.

REVOKE EXECUTE ON FUNCTION public.upsert_broker_credential(uuid, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_broker_credential(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_broker_credentials(uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.upsert_broker_credential(uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_broker_credential(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_broker_credentials(uuid, text) TO service_role;
