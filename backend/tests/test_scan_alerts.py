import os

import pytest
from fastapi import HTTPException

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")

from app.routers import alerts


def test_scan_alert_sort_validation_rejects_unknown_sort_key():
    with pytest.raises(HTTPException) as exc_info:
        alerts._validate_sort("unknown_column", "desc")

    assert exc_info.value.status_code == 400
    assert "Invalid sort_by" in str(exc_info.value.detail)


def test_scan_alert_sort_validation_rejects_unknown_sort_order():
    with pytest.raises(HTTPException) as exc_info:
        alerts._validate_sort("volume_ratio", "sideways")

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == "sort_order must be asc or desc"


def test_recent_matches_route_is_not_shadowed_by_dynamic_alert_route():
    paths = [route.path for route in alerts.router.routes]

    recent_index = paths.index("/api/v1/alerts/recent/matches")
    dynamic_index = paths.index("/api/v1/alerts/{alert_id}/matches")

    assert recent_index < dynamic_index
