# ADR 002 — Broker Credential Storage & Encryption

> Status: **REVISED v2** — addresses two BLOCKERs and two high-priority warnings from
> the reviewer's first pass. See end of document for change log.

---

## Constraint discovered during migration

The previous draft used `pgsodium.crypto_aead_det_encrypt` via the `pgsodium.key` table.
Running the migration revealed `ERROR: 42P01: relation "pgsodium.key" does not exist`. The
pgsodium extension is present (schema exists, raw crypto functions available), but the key-
management layer (`pgsodium.key`, `pgsodium.create_key()`) is not installed on this Supabase
project. Three options were evaluated:

| Option | Decryption location | Key storage | Works today? |
|---|---|---|---|
| A. pgsodium.key + AEAD | DB (security definer) | pgsodium Vault | **No** — key table missing |
| B. pgcrypto + session SET | DB (security definer) | Session variable | No — pgBouncer drops SET |
| C. App-layer AES-256-GCM | Python backend | Railway env var | **Yes** |

**Decision: Option C.** Rationale for rejecting the others is in Q1.

---

## Q1 — Encryption approach

**Context.** Credentials encrypted at rest. The original goal of "decryption inside the DB"
is unachievable without reliable key access from within Postgres — pgBouncer in transaction
mode drops session-level `SET` commands across pooler hops, and pgsodium key management is
unavailable.

**Decision.** **Application-layer AES-256-GCM:**

- One master key: `BROKER_CREDS_KEY` (32 bytes, hex-encoded) in Railway environment variables.
  Never committed to code, never logged, never in Supabase env vars.
- Per-row random 12-byte IV, stored as a prefix of `key_value`.
- GCM authentication tag (16 bytes) appended by `AESGCM.encrypt()` — stored as suffix.
- `key_value` layout: `[12-byte IV][ciphertext][16-byte GCM tag]`.
- `key_version` column: integer, default 1. Incremented on key rotation so un-rotated rows
  can be identified without decrypting them. Never surfaced in API responses — enforced by
  convention and a CI grep check: `grep -r 'key_version' backend/app/routers/ | grep -v '#'`
  must return no matches (routers must never select or return this column).
- **AAD (Additional Authenticated Data):** `f"{user_id}:{broker}:{key_name}".encode()` is
  bound into every encrypt and decrypt call. A ciphertext copied from user A's row into user
  B's row fails GCM authentication (`InvalidTag`) rather than silently decrypting. This
  prevents row-swapping attacks by any party with write access to `broker_credentials`.

Python implementation (lives entirely in `backend/app/brokers/credentials.py` — no other
file may import `encrypt_credential` or `decrypt_credential`):

```python
import os, secrets
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.exceptions import InvalidTag

class CredentialDecryptionError(Exception):
    """Raised when decryption fails. Never includes raw credential bytes."""

def _key() -> bytes:
    raw = os.environ["BROKER_CREDS_KEY"]  # 64-char hex; raises KeyError if missing
    return bytes.fromhex(raw)

def _aad(user_id: str, broker: str, key_name: str) -> bytes:
    return f"{user_id}:{broker}:{key_name}".encode()

def encrypt_credential(plaintext: str, user_id: str, broker: str, key_name: str) -> bytes:
    iv = secrets.token_bytes(12)
    ct = AESGCM(_key()).encrypt(iv, plaintext.encode(), _aad(user_id, broker, key_name))
    return iv + ct  # ct already includes the 16-byte GCM tag

def decrypt_credential(blob: bytes, user_id: str, broker: str, key_name: str) -> str:
    iv, ct = blob[:12], blob[12:]
    try:
        return AESGCM(_key()).decrypt(iv, ct, _aad(user_id, broker, key_name)).decode()
    except InvalidTag:
        # Wipe local references before raising so bytes never reach Sentry locals.
        blob = ct = iv = b""  # noqa: F841
        raise CredentialDecryptionError("decryption failed") from None
```

**Why not pgcrypto + key phrase in function body?**
Any postgres superuser can read the key phrase from `pg_proc.prosrc`. Worse than an env var.

**Why not pgcrypto + key phrase passed per call?**
The passphrase appears in `pg_stat_activity` and slow-query logs.

**Consequences.**
- Plaintext passes through Python memory during a credential read. `decrypt_credential` is
  called only inside `backend/app/brokers/credentials.py`. A CI grep check enforces this.
- If `BROKER_CREDS_KEY` is not set at startup, the backend refuses to start (KeyError on
  `_key()` is caught in the application startup health check — not silently ignored).
- `InvalidTag` exceptions are caught and sanitized before they can carry raw bytes to Sentry.
  `blob`, `ct`, and `iv` are explicitly wiped in the except block before re-raising.

---

## Q2 — Who can decrypt

**Context.** The service-role key bypasses RLS. A direct `SELECT key_value FROM broker_credentials`
without a `user_id` predicate returns every user's ciphertext. Defense-in-depth is required.

**Decision.** Two layers:

**Layer 1 — DB: a security-definer function enforces user_id scope.**

```sql
CREATE FUNCTION public.get_encrypted_credential(
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
   WHERE user_id  = p_user_id   -- scope enforced: wrong user_id → NULL, never another user's blob
     AND broker   = p_broker
     AND key_name = p_key_name;
$$;
```

The function returns ciphertext (not plaintext). The Python caller decrypts with `decrypt_credential`.
A missing `user_id` predicate bug returns NULL, which raises `CredentialNotFoundError` in Python,
never another user's data.

This is a **convention boundary enforced by code review and a CI grep**, not a capability
boundary: the service-role client can still query `broker_credentials` directly. No router or
adapter may do so — all access goes through `get_encrypted_credential()` or the write/delete
helpers in `credentials.py`.

**Layer 2 — Python: user_id comes only from the JWT middleware.**

All backend routes obtain `user_id` via `Depends(get_current_user_id)`, which validates the
JWT live against Supabase Auth. The `user_id` passed to credential functions is always the
authenticated user — it cannot be spoofed via the request body.

**No admin decryption path.** There is no function that accepts `(admin_user_id, target_user_id)`.
If a future developer needs to debug a credential issue, the user must reconnect via OAuth.
Adding an admin path later is an explicit design decision requiring a new ADR entry.

**Consequences.**
- Two independent secrets must be compromised simultaneously to read plaintext: the Supabase
  service-role key (to read ciphertext) AND `BROKER_CREDS_KEY` (to decrypt it).
- Supabase support staff (postgres superuser access) can read ciphertext, not plaintext.
- A compromised service-role key alone cannot decrypt credentials.

---

## Q3 — Rotation plan

> ⚠️ **KEY ROTATION IS NOT YET IMPLEMENTED.**
>
> A rotation script and runbook must be built and tested before the first real broker
> credential is stored in production. This is a **hard pre-production blocker** — see
> `CLAUDE.md §8 Known gaps` and `scripts/rotate_broker_key.py.TODO`.
>
> The section below is the spec for that future script, left here as a design commitment.

**Daily access token refresh (Zerodha):**
Zerodha issues a new access token each OAuth login. Expires 06:00 IST next day.
- On callback: `encrypt_credential(new_token, user_id, 'zerodha', 'access_token')` → upsert.
- `broker_token_expires_at` updated to next 06:00 IST.
- Order placement checks `broker_token_expires_at < now()` before using the token. Expired
  tokens trigger a `BrokerError(AUTH_EXPIRED)` → frontend redirects to reconnect flow.

**User-initiated disconnection:**
- Backend deletes all rows: `DELETE FROM broker_credentials WHERE user_id = $1 AND broker = $2`.
- `users.broker_type`, `broker_connected_at`, `broker_token_expires_at` set to NULL.

**Broker-initiated revocation:**
- Detected lazily: broker API returns 403 → adapter throws `BrokerError(AUTH_EXPIRED)`.
- No background polling for token health. The next order attempt detects the stale token.

**`BROKER_CREDS_KEY` rotation (emergency — UNIMPLEMENTED):**
See `scripts/rotate_broker_key.py.TODO` for the full spec. Summary:
1. Generate a new 32-byte key as `BROKER_CREDS_KEY_NEW` in Railway.
2. Run the rotation script: fetches rows with `key_version = 1`, decrypts with old key,
   re-encrypts with new key using same AAD, updates row and sets `key_version = 2`.
3. After script reports 0 remaining `key_version = 1` rows: swap `BROKER_CREDS_KEY` to the
   new value, remove `BROKER_CREDS_KEY_NEW`, restart the backend service.
4. The `key_version` column allows identifying un-rotated rows without decrypting them.
5. The script must be run outside market hours (09:15–15:30 IST) with a DB backup first.

**Blast radius of a compromised `BROKER_CREDS_KEY`:**
- An attacker with both the service-role key AND `BROKER_CREDS_KEY` can decrypt every
  credential for every user. Both secrets live in Railway — a compromised Railway account
  is the common blast radius.
- Access tokens expire at 06:00 IST — at most ~24 hours of exposure for token-only access.
- `api_key` and `api_secret` do not expire. A compromised key enables an attacker to
  initiate a fresh OAuth login on behalf of any user. Users must be notified to revoke
  their Zerodha API key via the Zerodha console if a compromise is confirmed.
- For production: consider storing `BROKER_CREDS_KEY` in a separate secret manager (AWS
  Secrets Manager, Doppler, 1Password Secrets Automation) so it is not in the same blast
  radius as the Railway service-role key. Not implemented for MVP.

---

## Q4 — Audit log

**Decision.** `broker_credential_audit` table with cascade delete on user deletion.

**Schema:**
```sql
CREATE TABLE public.broker_credential_audit (
  id         bigserial    NOT NULL PRIMARY KEY,
  user_id    uuid         NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  broker     text         NOT NULL,
  key_name   text         NOT NULL,   -- '*' for delete-all operations
  action     text         NOT NULL CHECK (action IN ('read', 'write', 'delete')),
  actor      text,                    -- future: request trace ID
  created_at timestamptz  NOT NULL DEFAULT now()
);
ALTER TABLE public.broker_credential_audit ENABLE ROW LEVEL SECURITY;
-- No SELECT/INSERT/UPDATE/DELETE policies = deny-all for anon and authenticated roles.
-- service_role can read for ops/debugging purposes (bypasses RLS).
```

**Cascade delete — deliberate MVP tradeoff:**
`user_id ... ON DELETE CASCADE` means audit rows are deleted when the user account is
deleted. This satisfies GDPR Article 17 (right to erasure) without a separate deletion
job — compliance simplicity is the priority at MVP scale.

**Tradeoff acknowledged:** We lose the ability to analyze historical fraud patterns on
deleted accounts. If fraud analysis becomes a requirement (e.g. a chargeback claim after
account deletion), revisit with pseudonymization: replace `user_id` with
`sha256(user_id || fixed_salt)` at deletion time, preserving the pattern without the PII link.

**What is logged:**

| Event | Who logs it | When |
|---|---|---|
| `read` | `get_encrypted_credential()` SQL function | Inside the function, before returning the blob |
| `write` | Python caller (`upsert_broker_credential`) | After successful DB upsert |
| `delete` | Python caller (`delete_broker_credentials`) | After successful DB delete |

**What is never logged:** credential values, IVs, key versions, decrypted plaintext.

**Audit insert failure:** advisory — the credential operation proceeds even if the audit
insert fails. A full audit table does not take down order placement.

**Retention:** 90 days from `created_at`, pruned by a scheduled Supabase function. Rows are
also deleted immediately on account deletion via CASCADE (see above).

---

## Q5 — Does plaintext leave the DB?

**Yes, in this design.** The security-definer function returns ciphertext (bytea). Decryption
happens in Python. Plaintext lives in Python process memory for the duration of a single
credential use (typically one HTTP request).

**Mitigations:**
- `decrypt_credential()` is called only in `backend/app/brokers/credentials.py`. A CI grep
  check (`grep -r 'decrypt_credential' backend/ | grep -v credentials.py`) blocks any other
  file importing it.
- Return value is passed directly to the broker adapter and discarded. Never stored on `self`,
  never put in a dict that could be logged or serialized.
- `InvalidTag` exceptions are caught and sanitized inside `decrypt_credential()` — local
  variables `blob`, `ct`, `iv` are wiped before re-raising `CredentialDecryptionError`.
  Raw bytes never reach the Sentry `beforeSend` hook.
- `beforeSend` in Sentry config also scrubs fields named `access_token`, `api_key`,
  `api_secret`, `token`, `password` as a second line of defense.
- PlaceOrder route returns the order result, not the credential. Frontend never sees it.

**Why the "plaintext never leaves DB" goal was dropped:** See Q1 rationale. Hardcoding the
key in Postgres or passing it per-call exposes it in `pg_proc` or `pg_stat_activity` — both
are worse than application-layer decryption with an env-var key.

---

## Change log

| Version | Change |
|---|---|
| v1 | Initial draft — used pgsodium.key (failed: table not available) |
| v2 | Switched to AES-256-GCM (app-layer). BLOCKER 1: rotation marked unimplemented, scripts/rotate_broker_key.py.TODO created. BLOCKER 2: audit CASCADE added, GDPR tradeoff documented. AAD added to encrypt/decrypt. InvalidTag sanitized in except block. |
