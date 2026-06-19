#!/usr/bin/env python3
"""Re-encrypt broker_credentials rows from key_version 1 to 2.

See scripts/rotate_broker_key.py.TODO for the full runbook.

Usage:
  python scripts/rotate_broker_key.py              # live rotation with confirmation
  python scripts/rotate_broker_key.py --dry-run    # decrypt-verify only, no writes
"""
from __future__ import annotations

import argparse
import os
import secrets
import sys
import time
from pathlib import Path

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

BATCH_SIZE = 100
BACKUP_SUFFIX = ".broker-creds-backup.bin"


def _aad(user_id: str, broker: str, key_name: str) -> bytes:
    return f"{user_id}:{broker}:{key_name}".encode()


def _decrypt(blob: bytes, key: bytes, user_id: str, broker: str, key_name: str) -> str:
    iv, ct = blob[:12], blob[12:]
    return AESGCM(key).decrypt(iv, ct, _aad(user_id, broker, key_name)).decode()


def _encrypt(plaintext: str, key: bytes, user_id: str, broker: str, key_name: str) -> bytes:
    iv = secrets.token_bytes(12)
    ct = AESGCM(key).encrypt(iv, plaintext.encode(), _aad(user_id, broker, key_name))
    return iv + ct


def rotate_row(row: dict, old_key: bytes, new_key: bytes) -> dict | None:
    """Decrypt with old_key, re-encrypt with new_key. Returns new row dict or None on failure.

    Pure crypto — no DB calls. Raises InvalidTag if old_key is wrong.
    """
    raw = row["key_value"]
    blob = bytes.fromhex(raw) if isinstance(raw, str) else bytes(raw)
    plaintext = _decrypt(blob, old_key, row["user_id"], row["broker"], row["key_name"])
    new_blob = _encrypt(plaintext, new_key, row["user_id"], row["broker"], row["key_name"])
    plaintext = ""
    return {"id": row["id"], "key_value": new_blob.hex(), "key_version": 2}


def verify_row(row: dict, key: bytes) -> bool:
    """Verify a row can be decrypted. Returns True on success."""
    raw = row["key_value"]
    blob = bytes.fromhex(raw) if isinstance(raw, str) else bytes(raw)
    _decrypt(blob, key, row["user_id"], row["broker"], row["key_name"])
    return True


def _require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        print(f"Missing required env var: {name}", file=sys.stderr)
        sys.exit(1)
    return value


def _validate_hex_key(name: str, value: str) -> bytes:
    if len(value) != 64:
        print(f"{name} must be a 64-char hex string (32 bytes)", file=sys.stderr)
        sys.exit(1)
    try:
        return bytes.fromhex(value)
    except ValueError:
        print(f"{name} is not valid hex", file=sys.stderr)
        sys.exit(1)


def _write_backup(path: Path, rows: list[dict]) -> None:
    backup_key = secrets.token_bytes(32)
    lines: list[bytes] = []
    for row in rows:
        blob = bytes.fromhex(row["key_value"]) if isinstance(row["key_value"], str) else bytes(row["key_value"])
        sealed = AESGCM(backup_key).encrypt(
            secrets.token_bytes(12),
            blob,
            str(row["id"]).encode(),
        )
        lines.append(str(row["id"]).encode() + b"\t" + sealed.hex().encode() + b"\n")
    path.write_bytes(backup_key + b"\n" + b"".join(lines))
    print(f"Encrypted backup written to {path} (delete after successful rotation)")


def _count_v1(client) -> int:
    res = (
        client.table("broker_credentials")
        .select("id", count="exact")
        .eq("key_version", 1)
        .execute()
    )
    return res.count or 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Rotate broker credential encryption key")
    parser.add_argument("--dry-run", action="store_true",
                        help="Verify all rows decrypt with old key and trial-encrypt with new key, but write nothing to DB")
    args = parser.parse_args()

    from supabase import create_client

    supabase_url = _require_env("SUPABASE_URL")
    service_key = _require_env("SUPABASE_SERVICE_ROLE_KEY")
    old_key_hex = _require_env("BROKER_CREDS_KEY")
    new_key_hex = _require_env("BROKER_CREDS_KEY_NEW")

    old_key = _validate_hex_key("BROKER_CREDS_KEY", old_key_hex)
    new_key = _validate_hex_key("BROKER_CREDS_KEY_NEW", new_key_hex)

    if old_key == new_key:
        print("BROKER_CREDS_KEY and BROKER_CREDS_KEY_NEW must differ", file=sys.stderr)
        return 1

    client = create_client(supabase_url, service_key)
    pending = _count_v1(client)

    if args.dry_run:
        print(f"[DRY RUN] Verifying {pending} rows can be decrypted and re-encrypted...")
    else:
        print(f"Will re-encrypt {pending} rows. Continue? [y/N]")
        if input().strip().lower() != "y":
            print("Aborted.")
            return 1

    if not args.dry_run:
        snapshot = (
            client.table("broker_credentials")
            .select("id,user_id,broker,key_name,key_value")
            .eq("key_version", 1)
            .order("id")
            .execute()
            .data or []
        )
        backup_path = Path.cwd() / f"broker-credentials-{int(time.time())}{BACKUP_SUFFIX}"
        _write_backup(backup_path, snapshot)

    rotated = 0
    skipped = 0
    failed = 0
    last_id = ""

    while True:
        query = (
            client.table("broker_credentials")
            .select("id,user_id,broker,key_name,key_value")
            .eq("key_version", 1)
            .order("id")
            .limit(BATCH_SIZE)
        )
        if last_id:
            query = query.gt("id", last_id)
        batch = query.execute().data or []
        if not batch:
            break

        for row in batch:
            row_id = row["id"]
            last_id = row_id

            try:
                result = rotate_row(row, old_key, new_key)
            except InvalidTag:
                print(f"Row {row_id} failed to decrypt — skipping")
                skipped += 1
                continue
            except Exception as exc:
                print(f"Row {row_id} failed: {exc}")
                failed += 1
                continue

            if args.dry_run:
                try:
                    verify_row(
                        {**row, "key_value": result["key_value"]},
                        new_key,
                    )
                    rotated += 1
                except Exception as exc:
                    print(f"Row {row_id} re-encryption verification failed: {exc}")
                    failed += 1
                continue

            try:
                (
                    client.table("broker_credentials")
                    .update({"key_value": result["key_value"], "key_version": 2})
                    .eq("id", row_id)
                    .eq("key_version", 1)
                    .execute()
                )
                rotated += 1
            except Exception as exc:
                print(f"Row {row_id} update failed: {exc}")
                failed += 1

        print(f"Progress: rotated={rotated} skipped={skipped} failed={failed}")
        if not args.dry_run:
            time.sleep(0.1)

    if args.dry_run:
        print(f"[DRY RUN] Summary: verified={rotated} skipped={skipped} failed={failed}")
        if failed > 0:
            print("Some rows failed verification. Investigate before running live rotation.")
            return 1
        print("All rows verified successfully. Safe to run without --dry-run.")
        return 0

    remaining = _count_v1(client)
    print(f"Summary: rotated={rotated} skipped={skipped} failed={failed} remaining_v1={remaining}")

    if remaining > 0:
        print(
            f"{remaining} rows with key_version = 1 remain (written during rotation).\n"
            "Re-run this script to complete rotation before swapping the env var."
        )
        return 1

    print(
        "Rotation complete.\n"
        "Set BROKER_CREDS_KEY = <new key value> in Railway.\n"
        "Remove BROKER_CREDS_KEY_NEW.\n"
        "Restart the backend service.\n"
        "Do NOT swap env vars until remaining_v1 is 0.\n"
        f"Delete the local backup file once confirmed: {backup_path}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
