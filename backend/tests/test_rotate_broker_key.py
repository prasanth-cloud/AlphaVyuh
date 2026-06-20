"""
Unit tests for broker key rotation logic.
No DB, no network — tests pure crypto rotation functions only.

Uses MockAdapter-style credential rows (synthetic user_id, broker, key_name).
"""
import secrets

import pytest
from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "scripts"))
from rotate_broker_key import _aad, _decrypt, _encrypt, rotate_row, verify_row


OLD_KEY = secrets.token_bytes(32)
NEW_KEY = secrets.token_bytes(32)

MOCK_CREDS = [
    {
        "id": "row-001",
        "user_id": "11111111-1111-1111-1111-111111111111",
        "broker": "mock",
        "key_name": "access_token",
        "plaintext": "mock_access_token_abc123",
    },
    {
        "id": "row-002",
        "user_id": "11111111-1111-1111-1111-111111111111",
        "broker": "mock",
        "key_name": "api_secret",
        "plaintext": "mock_api_secret_xyz789",
    },
    {
        "id": "row-003",
        "user_id": "22222222-2222-2222-2222-222222222222",
        "broker": "mock",
        "key_name": "access_token",
        "plaintext": "another_user_token",
    },
]


def _make_row(cred: dict) -> dict:
    blob = _encrypt(cred["plaintext"], OLD_KEY, cred["user_id"], cred["broker"], cred["key_name"])
    return {
        "id": cred["id"],
        "user_id": cred["user_id"],
        "broker": cred["broker"],
        "key_name": cred["key_name"],
        "key_value": blob.hex(),
        "key_version": 1,
    }


class TestRotateRow:
    def test_round_trip(self):
        for cred in MOCK_CREDS:
            row = _make_row(cred)
            result = rotate_row(row, OLD_KEY, NEW_KEY)
            assert result["id"] == cred["id"]
            assert result["key_version"] == 2
            new_blob = bytes.fromhex(result["key_value"])
            plaintext = _decrypt(new_blob, NEW_KEY, cred["user_id"], cred["broker"], cred["key_name"])
            assert plaintext == cred["plaintext"]

    def test_old_key_cannot_decrypt_rotated(self):
        row = _make_row(MOCK_CREDS[0])
        result = rotate_row(row, OLD_KEY, NEW_KEY)
        new_blob = bytes.fromhex(result["key_value"])
        with pytest.raises(InvalidTag):
            _decrypt(new_blob, OLD_KEY, MOCK_CREDS[0]["user_id"], MOCK_CREDS[0]["broker"], MOCK_CREDS[0]["key_name"])

    def test_wrong_old_key_raises(self):
        row = _make_row(MOCK_CREDS[0])
        wrong_key = secrets.token_bytes(32)
        with pytest.raises(InvalidTag):
            rotate_row(row, wrong_key, NEW_KEY)

    def test_corrupted_blob_raises(self):
        row = _make_row(MOCK_CREDS[0])
        row["key_value"] = "00" * 10
        with pytest.raises((InvalidTag, Exception)):
            rotate_row(row, OLD_KEY, NEW_KEY)

    def test_aad_mismatch_after_swap(self):
        cred = MOCK_CREDS[0]
        row = _make_row(cred)
        result = rotate_row(row, OLD_KEY, NEW_KEY)
        new_blob = bytes.fromhex(result["key_value"])
        with pytest.raises(InvalidTag):
            _decrypt(new_blob, NEW_KEY, "wrong-user-id", cred["broker"], cred["key_name"])

    def test_empty_plaintext(self):
        cred = {**MOCK_CREDS[0], "plaintext": ""}
        row = _make_row(cred)
        result = rotate_row(row, OLD_KEY, NEW_KEY)
        new_blob = bytes.fromhex(result["key_value"])
        assert _decrypt(new_blob, NEW_KEY, cred["user_id"], cred["broker"], cred["key_name"]) == ""

    def test_unicode_plaintext(self):
        cred = {**MOCK_CREDS[0], "plaintext": "tok_é中文"}
        row = _make_row(cred)
        result = rotate_row(row, OLD_KEY, NEW_KEY)
        new_blob = bytes.fromhex(result["key_value"])
        assert _decrypt(new_blob, NEW_KEY, cred["user_id"], cred["broker"], cred["key_name"]) == cred["plaintext"]


class TestVerifyRow:
    def test_verify_original(self):
        row = _make_row(MOCK_CREDS[0])
        assert verify_row(row, OLD_KEY) is True

    def test_verify_rotated(self):
        row = _make_row(MOCK_CREDS[0])
        result = rotate_row(row, OLD_KEY, NEW_KEY)
        rotated_row = {**row, "key_value": result["key_value"]}
        assert verify_row(rotated_row, NEW_KEY) is True

    def test_verify_wrong_key_raises(self):
        row = _make_row(MOCK_CREDS[0])
        with pytest.raises(InvalidTag):
            verify_row(row, NEW_KEY)


class TestMultipleCredentialRotation:
    def test_all_mock_creds_rotate(self):
        rows = [_make_row(c) for c in MOCK_CREDS]
        for i, row in enumerate(rows):
            result = rotate_row(row, OLD_KEY, NEW_KEY)
            new_blob = bytes.fromhex(result["key_value"])
            assert _decrypt(new_blob, NEW_KEY, row["user_id"], row["broker"], row["key_name"]) == MOCK_CREDS[i]["plaintext"]

    def test_idempotent_rotation_fails(self):
        """A row already rotated to new_key cannot be rotated again with old_key."""
        row = _make_row(MOCK_CREDS[0])
        result = rotate_row(row, OLD_KEY, NEW_KEY)
        rotated_row = {**row, "key_value": result["key_value"]}
        with pytest.raises(InvalidTag):
            rotate_row(rotated_row, OLD_KEY, NEW_KEY)


class TestDryRunVerification:
    def test_dry_run_flow(self):
        """Simulate dry-run: rotate, verify with new key, discard result."""
        for cred in MOCK_CREDS:
            row = _make_row(cred)
            result = rotate_row(row, OLD_KEY, NEW_KEY)
            assert verify_row({**row, "key_value": result["key_value"]}, NEW_KEY) is True
