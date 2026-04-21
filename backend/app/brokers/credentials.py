"""
Broker credential encryption/decryption.

This is the ONLY file that may call encrypt_credential or decrypt_credential.
CI enforces this via: grep -r 'decrypt_credential' backend/app/ | grep -v credentials.py  # must be empty

Encryption: AES-256-GCM with a random 12-byte IV per credential write.
Key: BROKER_CREDS_KEY env var (64 hex chars = 32 bytes). Set in Railway; never committed.
AAD: f"{user_id}:{broker}:{key_name}" binds each ciphertext to its row — prevents
     row-swapping attacks (a ciphertext moved to a different row fails InvalidTag).

key_value layout in DB: [12-byte IV][ciphertext + 16-byte GCM tag]
"""
from __future__ import annotations

import os
import secrets
from typing import Optional

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.services.supabase import get_admin_client


class CredentialNotFoundError(Exception):
    pass


class CredentialDecryptionError(Exception):
    """Raised on GCM InvalidTag. Never includes raw credential bytes."""


def _key() -> bytes:
    raw = os.environ["BROKER_CREDS_KEY"]   # KeyError on missing = startup fails fast
    return bytes.fromhex(raw)


def _aad(user_id: str, broker: str, key_name: str) -> bytes:
    return f"{user_id}:{broker}:{key_name}".encode()


def encrypt_credential(plaintext: str, user_id: str, broker: str, key_name: str) -> bytes:
    iv = secrets.token_bytes(12)
    ct = AESGCM(_key()).encrypt(iv, plaintext.encode(), _aad(user_id, broker, key_name))
    return iv + ct   # ct already includes the 16-byte GCM tag


def decrypt_credential(blob: bytes, user_id: str, broker: str, key_name: str) -> str:
    iv, ct = blob[:12], blob[12:]
    try:
        return AESGCM(_key()).decrypt(iv, ct, _aad(user_id, broker, key_name)).decode()
    except InvalidTag:
        # Wipe local references before raising so raw bytes never reach Sentry locals.
        blob = ct = iv = b""  # noqa: F841
        raise CredentialDecryptionError("decryption failed") from None


# ── DB helpers ────────────────────────────────────────────────────────────────
# These are the only functions in this module that touch the DB.
# Callers: broker router, OAuth callback handler only.

def upsert_broker_credential(
    user_id: str, broker: str, key_name: str, plaintext: str
) -> None:
    ciphertext = encrypt_credential(plaintext, user_id, broker, key_name)
    sb = get_admin_client()
    sb.table("broker_credentials").upsert(
        {
            "user_id":   user_id,
            "broker":    broker,
            "key_name":  key_name,
            "key_value": ciphertext.hex(),   # bytea stored as hex string via REST
            "key_version": 1,
        },
        on_conflict="user_id,broker,key_name",
    ).execute()
    sb.table("broker_credential_audit").insert(
        {"user_id": user_id, "broker": broker, "key_name": key_name, "action": "write"}
    ).execute()


def get_broker_credential(
    user_id: str, broker: str, key_name: str
) -> Optional[str]:
    sb = get_admin_client()
    r = sb.rpc(
        "get_encrypted_credential",
        {"p_user_id": user_id, "p_broker": broker, "p_key_name": key_name},
    ).execute()
    raw = r.data
    if raw is None:
        return None
    blob = bytes.fromhex(raw) if isinstance(raw, str) else bytes(raw)
    plaintext = decrypt_credential(blob, user_id, broker, key_name)
    sb.table("broker_credential_audit").insert(
        {"user_id": user_id, "broker": broker, "key_name": key_name, "action": "read"}
    ).execute()
    return plaintext


def delete_broker_credentials(user_id: str, broker: str) -> None:
    sb = get_admin_client()
    sb.rpc(
        "delete_broker_credentials",
        {"p_user_id": user_id, "p_broker": broker},
    ).execute()
    sb.table("broker_credential_audit").insert(
        {"user_id": user_id, "broker": broker, "key_name": "*", "action": "delete"}
    ).execute()
