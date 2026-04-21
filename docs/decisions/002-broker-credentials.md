# ADR 002 — Broker Credential Storage & Encryption

> Covers how we store, decrypt, rotate, and audit broker API keys (Zerodha, Upstox, Dhan). Read the **Decision** line per section; read **Consequences** only if something breaks or you're changing the shape.

---

## Q1 — Encryption approach

**Context.** Broker credentials (API key + access token, sometimes API secret) are long-lived secrets that must survive across sessions. Options: encrypt in application layer before insert (AES-256 in Python), use Postgres `pgcrypto`, or use Supabase's `pgsodium` extension which provides authenticated secret-box encryption keyed by Vault secrets.

**Decision.** Use **pgsodium secret-box** (XSalsa20-Poly1305) via Supabase Vault. Each credential row is encrypted at rest using a key stored in Vault, not in the application layer. The column type is `pg_catalog.bytea`; the plaintext never touches the application server — decryption happens inside the DB query and only the plaintext value is returned to the service-role caller.

Schema:
```sql
create table public.broker_credentials (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  broker      text not null check (broker in ('zerodha', 'upstox', 'dhan')),
  key_name    text not null,          -- e.g. 'api_key', 'access_token'
  key_value   bytea not null,         -- pgsodium-encrypted ciphertext
  key_id      uuid not null,          -- Vault secret key used to encrypt
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, broker, key_name)
);
```

Encryption in migration SQL:
```sql
-- Insert an encrypted credential
insert into public.broker_credentials (user_id, broker, key_name, key_value, key_id)
values (
  $1,
  $2,
  $3,
  pgsodium.crypto_secretbox(convert_to($4, 'utf8'), pgsodium.crypto_secretbox_keygen_id($5)),
  $5
);
```

**Consequences.**
- Plaintext broker keys are never stored in env vars, never logged, never visible to the app server as a column value.
- If pgsodium is not available on a Supabase plan, fallback is `pgcrypto` symmetric encryption — but pgsodium is available on all Supabase projects.
- Key rotation (see Q3) requires re-encrypting rows, which is done inside the DB via SQL update.

---

## Q2 — Who can decrypt

**Context.** The backend runs with the service-role key which bypasses RLS. If the service role can freely decrypt any user's credentials, a compromised backend or a logic bug (wrong `user_id` in a query) leaks credentials across users.

**Decision.** Decryption is **only allowed through a Postgres function that enforces the user scope**:

```sql
create or replace function get_broker_credential(
  p_user_id uuid,
  p_broker  text,
  p_key_name text
) returns text
language plpgsql
security definer  -- runs as postgres, has pgsodium access
as $$
declare
  v_ciphertext bytea;
  v_key_id     uuid;
begin
  select key_value, key_id
    into v_ciphertext, v_key_id
    from public.broker_credentials
   where user_id  = p_user_id   -- enforced: cannot read another user's keys
     and broker   = p_broker
     and key_name = p_key_name;

  if not found then return null; end if;

  return convert_from(
    pgsodium.crypto_secretbox_open(v_ciphertext, pgsodium.crypto_secretbox_keygen(v_key_id)),
    'utf8'
  );
end;
$$;
```

The backend calls `select get_broker_credential($user_id, $broker, $key_name)` — it never has access to the raw `key_value` column. There is no admin path (no endpoint, no function) that returns credentials for a user_id other than the authenticated user.

**Consequences.**
- A backend logic bug passing the wrong `user_id` returns `null`, not another user's key.
- The function is `security definer` (runs as postgres). This is intentional and necessary for pgsodium access — the service-role key does not have pgsodium privileges by default.
- No admin console can dump credentials. If a user loses access, they must reconnect via broker OAuth — there is no recovery path.

---

## Q3 — Rotation plan

**Context.** Zerodha access tokens expire daily (they're session tokens, not long-lived API secrets). Upstox and Dhan have similar patterns. Additionally, if we suspect a credential leak, we need to be able to invalidate without touching every row manually.

**Decision.** Two rotation scenarios:

**Daily token refresh (Zerodha):**
- On broker OAuth callback, call `upsert` into `broker_credentials` with `on conflict (user_id, broker, key_name) do update set key_value = excluded.key_value, updated_at = now()`.
- The new ciphertext replaces the old in-place. No key rotation needed — same Vault key, new plaintext.

**Emergency revocation:**
- Delete the row: `delete from broker_credentials where user_id = $1 and broker = $2`.
- The user must re-authenticate with their broker. There is no silent rotation — revocation is explicit.
- If a Vault key itself is compromised: generate a new key in Vault, run a one-off migration that calls `get_broker_credential()` then re-encrypts under the new key for affected rows. This is an ops task, not automated.

**Consequences.**
- There is no background job that reads and re-writes credentials automatically. This is intentional — automated decryption is a risk surface.
- Zerodha's daily token expiry is handled by the OAuth callback flow, not a background refresh.

---

## Q4 — Audit log

**Context.** We need to know when credentials are read (decrypt calls) and written, both for security review and for debugging "why did a trade fail".

**Decision.** A lightweight audit table, written to by the `get_broker_credential` function:

```sql
create table public.broker_credential_audit (
  id          bigserial primary key,
  user_id     uuid not null,
  broker      text not null,
  key_name    text not null,
  action      text not null check (action in ('read', 'write', 'delete')),
  actor       text,   -- 'system' or a request trace ID
  created_at  timestamptz not null default now()
);
-- No RLS intentionally — audit table is write-only from functions, read only by postgres
-- Users cannot read or delete their own audit rows
```

`get_broker_credential` inserts a `read` row before returning. Write/delete rows are inserted by the upsert/delete paths in the broker credential management routes.

Retention: rows older than 90 days are pruned by a scheduled Postgres function (added in a later migration).

**Consequences.**
- Every decryption of a broker key produces a row. At ~1–5 reads per trade this is low volume.
- The audit table has no user-facing RLS and no user-facing API — it is not visible to the user.
- If the audit insert fails (e.g. disk full), the credential read still succeeds — audit is advisory, not a hard gate.

---

## Q5 — Separation of concerns

**Context.** Broker credentials must not leak into: application logs, error tracking (Sentry), API response bodies, or the frontend state. The key concern is that a trace of the plaintext appears somewhere it shouldn't.

**Decision.**
- The backend never logs credential values. Any log line that traces broker operations uses the `broker` + `user_id` + `key_name` only, never the value.
- Sentry scrubs fields named `api_key`, `access_token`, `refresh_token`, `token` in `beforeSend` (see `docs/observability.md`).
- The broker adapter interface (`lib/brokers/adapter.ts`) receives credentials already decrypted by the DB function — the adapter must not store them on `self` or return them in any method response.
- Frontend never receives broker credentials. The `/api/v1/broker/connect` response returns only `{ connected: true, broker, expires_at }` — not the key.
- `SUPABASE_SERVICE_ROLE_KEY` is the only key that can call `get_broker_credential`. It lives in Railway env vars, never in code, never logged.

**Consequences.**
- If a Sentry event captures an exception thrown inside a broker adapter method, scrubbing must catch the credential before it reaches Sentry. The adapter must not include credentials in exception messages.
- Future broker adapters must be reviewed against this constraint before merge — they must not store credentials as instance attributes that could appear in stack traces.
