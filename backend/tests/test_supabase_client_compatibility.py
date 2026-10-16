"""Exercise the real SDK with synthetic keys and an HTTP boundary stub."""

import os

import httpx
import pytest

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")

from app.services import supabase as service


MODERN_SERVICE_KEY = "sb_secret_unit_test_not_a_real_key"
MODERN_PUBLIC_KEY = "sb_publishable_unit_test_not_a_real_key"
LEGACY_SERVICE_KEY = "unit-test-service.payload.signature"
LEGACY_PUBLIC_KEY = "unit-test-anon.payload.signature"
ALICE_TOKEN = "unit-test-alice.payload.signature"
BOB_TOKEN = "unit-test-bob.payload.signature"
ALICE_ID = "11111111-1111-1111-1111-111111111111"


@pytest.fixture
def sdk_boundary(monkeypatch):
    requests = []
    clients = []
    monkeypatch.setattr(service.settings, "supabase_url", "https://example.supabase.co")
    monkeypatch.setattr(service, "_admin_client", None)

    def send(_client, request, **_kwargs):
        requests.append(request)
        assert request.url.host == "example.supabase.co"
        if request.url.path == "/auth/v1/user":
            return httpx.Response(
                200,
                request=request,
                json={
                    "id": ALICE_ID,
                    "aud": "authenticated",
                    "role": "authenticated",
                    "created_at": "2026-01-01T00:00:00Z",
                    "app_metadata": {},
                    "user_metadata": {},
                },
            )
        assert request.url.path == "/rest/v1/users"
        return httpx.Response(200, request=request, json=[{"id": ALICE_ID}])

    monkeypatch.setattr(httpx.Client, "send", send)
    yield requests, clients
    for client in clients:
        client.auth.close()
        client.postgrest.session.close()


@pytest.mark.parametrize("api_key", [MODERN_SERVICE_KEY, LEGACY_SERVICE_KEY])
def test_admin_client_supports_modern_and_legacy_keys(monkeypatch, sdk_boundary, api_key):
    requests, clients = sdk_boundary
    monkeypatch.setattr(service.settings, "supabase_service_role_key", api_key)

    admin = service.get_admin_client()
    clients.append(admin)
    assert service.get_admin_client() is admin
    assert admin.table("users").select("id").execute().data == [{"id": ALICE_ID}]

    assert len(requests) == 1
    assert requests[0].headers["apikey"] == api_key
    assert requests[0].headers["authorization"] == f"Bearer {api_key}"

    # Auth must validate the caller's JWT while retaining the project's API key.
    assert admin.auth.get_user(ALICE_TOKEN).user.id == ALICE_ID
    assert requests[1].headers["apikey"] == api_key
    assert requests[1].headers["authorization"] == f"Bearer {ALICE_TOKEN}"
    admin.table("users").select("id").execute()
    assert requests[2].headers["authorization"] == f"Bearer {api_key}"


@pytest.mark.parametrize("api_key", [MODERN_PUBLIC_KEY, LEGACY_PUBLIC_KEY])
def test_user_clients_preserve_each_callers_authorization(monkeypatch, sdk_boundary, api_key):
    requests, clients = sdk_boundary
    monkeypatch.setattr(service.settings, "supabase_anon_key", api_key)

    alice = service.get_user_client(ALICE_TOKEN)
    bob = service.get_user_client(BOB_TOKEN)
    clients.extend([alice, bob])
    assert alice is not bob
    alice.table("users").select("id").execute()
    bob.table("users").select("id").execute()
    alice.table("users").select("id").execute()

    assert [request.headers["apikey"] for request in requests] == [api_key] * 3
    assert [request.headers["authorization"] for request in requests] == [
        f"Bearer {ALICE_TOKEN}",
        f"Bearer {BOB_TOKEN}",
        f"Bearer {ALICE_TOKEN}",
    ]
