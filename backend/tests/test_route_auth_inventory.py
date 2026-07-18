import os

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")

from app.main import app


PUBLIC_ROUTES = {
    ("GET", "/health"),
    ("POST", "/api/v1/waitlist"),
    ("GET", "/api/v1/invite-codes/{code}"),
    ("GET", "/api/v1/community/screens"),
    ("POST", "/api/v1/ingest/bhavcopy"),
    ("POST", "/api/v1/ingest/refresh-today"),
    ("GET", "/api/v1/scanner/presets"),
    ("POST", "/api/v1/alerts/telegram/webhook"),
    ("GET", "/api/v1/options/presets"),
    ("POST", "/api/v1/options/payoff"),
    ("POST", "/api/v1/options/greeks"),
    ("GET", "/api/v1/stocks/quotes"),
    ("GET", "/api/v1/stocks/{symbol}/quote"),
    ("GET", "/api/v1/stocks/{symbol}/fundamentals"),
    ("GET", "/api/v1/stocks/{symbol}/quote-live"),
    ("GET", "/api/v1/market/summary"),
    ("GET", "/api/v1/market/movers"),
    ("GET", "/api/v1/market/markets"),
    ("GET", "/api/v1/market/sectors"),
    ("GET", "/api/v1/market/sectors/audit"),
    ("GET", "/api/v1/market/sector-breadth"),
    ("GET", "/api/v1/charts/{symbol}/candles"),
    ("GET", "/api/v1/charts/{symbol}/candles-live"),
    ("GET", "/api/v1/charts/{symbol}/indicators"),
    ("GET", "/api/v1/charts/search"),
    ("GET", "/api/v1/payments/config"),
    ("GET", "/api/v1/payments/plans"),
    ("POST", "/api/v1/payments/webhook"),
    ("POST", "/api/admin/rotate-broker-keys"),
    ("GET", "/api/v1/email/unsubscribe"),
}

SECRET_GATED_PUBLIC_ROUTES = {
    ("POST", "/api/v1/ingest/bhavcopy"),
    ("POST", "/api/v1/ingest/refresh-today"),
    ("POST", "/api/v1/alerts/telegram/webhook"),
    ("POST", "/api/v1/payments/webhook"),
    ("POST", "/api/admin/rotate-broker-keys"),
    ("GET", "/api/v1/email/unsubscribe"),
}

AUTH_DEPENDENCIES = {"get_current_user_id", "get_current_user_token"}


def _route_deps(route) -> set[str]:
    dependant = getattr(route, "dependant", None)
    if not dependant:
        return set()
    return {getattr(dep.call, "__name__", str(dep.call)) for dep in dependant.dependencies}


def _api_routes():
    for route in app.routes:
        path = getattr(route, "path", "")
        if not path.startswith("/api") and path != "/health":
            continue
        for method in sorted(getattr(route, "methods", []) or []):
            if method in {"HEAD", "OPTIONS"}:
                continue
            yield method, path, _route_deps(route)


def test_backend_route_auth_inventory_is_explicit():
    unexpected_public = []
    stale_allowlist = set(PUBLIC_ROUTES)

    for method, path, deps in _api_routes():
        route = (method, path)
        if deps & AUTH_DEPENDENCIES:
            stale_allowlist.discard(route)
            continue
        if route in PUBLIC_ROUTES:
            stale_allowlist.discard(route)
            continue
        unexpected_public.append(route)

    assert unexpected_public == []
    assert stale_allowlist == set()


def test_sensitive_data_health_routes_require_user_auth():
    routes = {(method, path): deps for method, path, deps in _api_routes()}

    assert "get_current_user_id" in routes[("GET", "/api/v1/data/health")]
    assert "get_current_user_id" in routes[("GET", "/api/v1/data/runs")]


def test_market_analytics_requires_the_validated_user_token():
    routes = {(method, path): deps for method, path, deps in _api_routes()}

    assert "get_current_user_token" in routes[("GET", "/api/v1/market/analytics")]


def test_secret_gated_public_routes_are_named_in_allowlist():
    for route in SECRET_GATED_PUBLIC_ROUTES:
        assert route in PUBLIC_ROUTES
