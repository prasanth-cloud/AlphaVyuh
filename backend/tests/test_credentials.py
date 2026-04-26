"""
Unit tests for AES-256-GCM credential encryption helpers.
No DB, no network — tests pure crypto logic only.
"""
import os
import secrets

import pytest


# Set env var before importing the module under test
_TEST_KEY = secrets.token_bytes(32).hex()
os.environ["BROKER_CREDS_KEY"] = _TEST_KEY
os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")

from app.brokers.credentials import (  # noqa: E402
    CredentialDecryptionError,
    decrypt_credential,
    encrypt_credential,
)

USER_ID = "11111111-1111-1111-1111-111111111111"
BROKER   = "zerodha"
KEY_NAME = "access_token"
VALUE    = "abc123_plaintext_token"


class TestEncryptDecrypt:
    def test_round_trip(self):
        blob = encrypt_credential(VALUE, USER_ID, BROKER, KEY_NAME)
        assert decrypt_credential(blob, USER_ID, BROKER, KEY_NAME) == VALUE

    def test_ciphertext_is_not_plaintext(self):
        blob = encrypt_credential(VALUE, USER_ID, BROKER, KEY_NAME)
        assert VALUE.encode() not in blob

    def test_iv_is_random_per_call(self):
        blob1 = encrypt_credential(VALUE, USER_ID, BROKER, KEY_NAME)
        blob2 = encrypt_credential(VALUE, USER_ID, BROKER, KEY_NAME)
        assert blob1 != blob2   # different IVs

    def test_ciphertext_min_length(self):
        blob = encrypt_credential(VALUE, USER_ID, BROKER, KEY_NAME)
        # 12 IV + len(plaintext) + 16 GCM tag
        assert len(blob) == 12 + len(VALUE.encode()) + 16

    def test_wrong_user_id_raises(self):
        blob = encrypt_credential(VALUE, USER_ID, BROKER, KEY_NAME)
        with pytest.raises(CredentialDecryptionError):
            decrypt_credential(blob, "22222222-2222-2222-2222-222222222222", BROKER, KEY_NAME)

    def test_wrong_broker_raises(self):
        blob = encrypt_credential(VALUE, USER_ID, BROKER, KEY_NAME)
        with pytest.raises(CredentialDecryptionError):
            decrypt_credential(blob, USER_ID, "upstox", KEY_NAME)

    def test_wrong_key_name_raises(self):
        blob = encrypt_credential(VALUE, USER_ID, BROKER, KEY_NAME)
        with pytest.raises(CredentialDecryptionError):
            decrypt_credential(blob, USER_ID, BROKER, "api_secret")

    def test_truncated_blob_raises(self):
        blob = encrypt_credential(VALUE, USER_ID, BROKER, KEY_NAME)
        with pytest.raises((CredentialDecryptionError, Exception)):
            decrypt_credential(blob[:10], USER_ID, BROKER, KEY_NAME)

    def test_wrong_master_key_raises(self):
        blob = encrypt_credential(VALUE, USER_ID, BROKER, KEY_NAME)
        os.environ["BROKER_CREDS_KEY"] = secrets.token_bytes(32).hex()
        try:
            with pytest.raises(CredentialDecryptionError):
                decrypt_credential(blob, USER_ID, BROKER, KEY_NAME)
        finally:
            os.environ["BROKER_CREDS_KEY"] = _TEST_KEY

    def test_empty_string_round_trip(self):
        blob = encrypt_credential("", USER_ID, BROKER, KEY_NAME)
        assert decrypt_credential(blob, USER_ID, BROKER, KEY_NAME) == ""

    def test_unicode_round_trip(self):
        token = "tok_\u0041\u00e9\u4e2d\u6587"
        blob = encrypt_credential(token, USER_ID, BROKER, KEY_NAME)
        assert decrypt_credential(blob, USER_ID, BROKER, KEY_NAME) == token
