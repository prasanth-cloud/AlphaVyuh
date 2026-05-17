import os

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")

from app.routers.waitlist import WaitlistRequest, _insert_waitlist_row


class _FakeInsert:
    def __init__(self, client, payload):
        self.client = client
        self.payload = payload

    def execute(self):
        self.client.inserts.append(self.payload)
        if self.client.failures:
            message = self.client.failures.pop(0)
            raise Exception(message)
        return type("Result", (), {"data": [self.payload]})()


class _FakeTable:
    def __init__(self, client):
        self.client = client

    def insert(self, payload):
        return _FakeInsert(self.client, payload)


class _FakeClient:
    def __init__(self, failures):
        self.failures = list(failures)
        self.inserts = []

    def table(self, name):
        assert name == "waitlist"
        return _FakeTable(self)


def test_waitlist_insert_uses_launch_schema_first():
    client = _FakeClient([])

    _insert_waitlist_row(
        client,
        WaitlistRequest(email="trader@example.com", source="landing", invite_code="AV-TEST"),
    )

    assert client.inserts == [
        {"email": "trader@example.com", "source": "landing", "invite_code": "AV-TEST"},
    ]


def test_waitlist_insert_falls_back_to_original_schema_when_launch_columns_are_missing():
    client = _FakeClient(["column invite_code does not exist", "column source does not exist"])

    _insert_waitlist_row(
        client,
        WaitlistRequest(email="trader@example.com", source="landing", invite_code="AV-TEST"),
    )

    assert client.inserts == [
        {"email": "trader@example.com", "source": "landing", "invite_code": "AV-TEST"},
        {"email": "trader@example.com", "source": "landing"},
        {"email": "trader@example.com"},
    ]
