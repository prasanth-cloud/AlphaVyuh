from __future__ import annotations

import pytest

from app.services.audit_log import AuditLogUnavailable, record_audit_event


class _Result:
    def __init__(self, data):
        self.data = data


class _Query:
    def __init__(self, client):
        self.client = client
        self.payload = None

    def insert(self, payload):
        self.payload = payload
        return self

    def execute(self):
        if self.client.error:
            raise RuntimeError("audit table unavailable")
        self.client.rows.append(self.payload)
        return _Result([{"id": "audit-1", **self.payload}])


class _Client:
    def __init__(self, error=False):
        self.error = error
        self.rows = []

    def table(self, _table_name):
        return _Query(self)


def test_audit_event_redacts_sensitive_metadata_and_bounds_text() -> None:
    client = _Client()

    result = record_audit_event(
        client,
        user_id="user-1",
        event_type="broker.order.submitted",
        outcome="submitted",
        metadata={
            "symbol": "RELIANCE",
            "access_token": "do-not-store",
            "nested": {"api_key": "also-do-not-store", "note": "x" * 500},
        },
    )

    assert result is not None
    assert client.rows[0]["metadata"]["access_token"] == "[REDACTED]"
    assert client.rows[0]["metadata"]["nested"]["api_key"] == "[REDACTED]"
    assert len(client.rows[0]["metadata"]["nested"]["note"]) == 240


def test_required_audit_event_fails_closed() -> None:
    with pytest.raises(AuditLogUnavailable):
        record_audit_event(
            _Client(error=True),
            user_id="user-1",
            event_type="broker.order.intent.accepted",
            outcome="accepted",
            required=True,
        )


def test_advisory_audit_event_does_not_break_existing_flow() -> None:
    assert record_audit_event(
        _Client(error=True),
        user_id="user-1",
        event_type="broker.order.reconciled",
        outcome="reconciled",
    ) is None
