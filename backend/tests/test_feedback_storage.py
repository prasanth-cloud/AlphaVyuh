import json
import os

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")

from app.routers import feedback


def test_feedback_storage_mode_accepts_waitlist(monkeypatch):
    monkeypatch.setattr(feedback.settings, "feedback_storage_mode", "waitlist")

    assert feedback._feedback_storage_mode() == "waitlist"
    assert feedback._use_waitlist_feedback() is True


def test_feedback_storage_mode_defaults_invalid_values_to_auto(monkeypatch):
    monkeypatch.setattr(feedback.settings, "feedback_storage_mode", "unexpected")

    assert feedback._feedback_storage_mode() == "auto"
    assert feedback._use_waitlist_feedback() is False


def test_waitlist_feedback_row_preserves_report_context():
    context = {
        "page": "/scanner",
        "symbol": "RELIANCE",
        "severity": "high",
        "client": {"viewport": "desktop"},
    }
    row = {
        "id": "feedback-1",
        "email": "user@example.com",
        "source": "feedback-data_issue",
        "notes": f"52 week high scanner is empty\n\ncontext={json.dumps(context)}",
        "status": "invited",
        "created_at": "2026-04-29T12:00:00Z",
    }

    report = feedback._waitlist_feedback_row(row)

    assert report["category"] == "data_issue"
    assert report["page"] == "/scanner"
    assert report["symbol"] == "RELIANCE"
    assert report["severity"] == "high"
    assert report["message"] == "52 week high scanner is empty"
    assert report["status"] == "triaged"
    assert report["context"]["email"] == "user@example.com"


def test_feedback_context_redacts_broker_callback_secrets():
    context = {
        "href": "https://www.alphavyuh.com/broker/callback?broker=zerodha&request_token=rt_123&state=oauth-state&code=code_123",
        "nested": {
            "access_token": "access-secret",
            "safe": "kept",
        },
    }

    sanitized = feedback._sanitize_feedback_context(context)

    assert sanitized["href"] == (
        "https://www.alphavyuh.com/broker/callback?"
        "broker=zerodha&request_token=%5Bredacted%5D&state=%5Bredacted%5D&code=%5Bredacted%5D"
    )
    assert sanitized["nested"]["access_token"] == "[redacted]"
    assert sanitized["nested"]["safe"] == "kept"
