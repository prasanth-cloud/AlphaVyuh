"""Tests for email digest service — pure logic, no DB or Resend calls."""
from app.services.email_digest import _detect_triggers, _render_email


class TestDetectTriggers:
    def test_no_triggers(self):
        row = {"rs_score": 50, "volume_ratio": 0.8, "pct_change": 1.0, "w52h_pct": 20.0}
        assert _detect_triggers(row) == []

    def test_rs_trigger(self):
        row = {"rs_score": 90, "volume_ratio": 0.5}
        triggers = _detect_triggers(row)
        assert "RS ≥ 85" in triggers

    def test_volume_trigger(self):
        row = {"volume_ratio": 3.5}
        triggers = _detect_triggers(row)
        assert any("Vol" in t for t in triggers)

    def test_gap_trigger(self):
        row = {"pct_change": 5.2}
        triggers = _detect_triggers(row)
        assert any("Gap" in t for t in triggers)

    def test_near_52w_high(self):
        row = {"w52h_pct": 2.0}
        triggers = _detect_triggers(row)
        assert "Near 52w High" in triggers

    def test_vcp_trigger(self):
        row = {"vcp_contraction": True}
        triggers = _detect_triggers(row)
        assert "VCP" in triggers

    def test_multiple_triggers(self):
        row = {"rs_score": 92, "volume_ratio": 2.5, "pct_change": 4.0, "w52h_pct": 1.5, "vcp_contraction": True}
        triggers = _detect_triggers(row)
        assert len(triggers) == 5

    def test_none_values(self):
        row = {"rs_score": None, "volume_ratio": None, "pct_change": None}
        assert _detect_triggers(row) == []


class TestRenderEmail:
    def test_renders_subject_with_date(self):
        subject, html = _render_email("Test", [], "https://x.com/unsub", "2026-06-20")
        assert "2026-06-20" in subject

    def test_renders_symbol_in_body(self):
        items = [{"symbol": "RELIANCE", "close": 2500.50, "pct_change": 1.5, "triggers": ["RS ≥ 85"]}]
        _, html = _render_email("User", items, "https://x.com/unsub", "2026-06-20")
        assert "RELIANCE" in html
        assert "2,500.50" in html
        assert "+1.50%" in html
        assert "RS ≥ 85" in html

    def test_renders_unsubscribe_link(self):
        _, html = _render_email("User", [], "https://example.com/unsub?token=abc", "2026-06-20")
        assert "https://example.com/unsub?token=abc" in html

    def test_handles_none_values(self):
        items = [{"symbol": "TCS", "close": None, "pct_change": None, "triggers": []}]
        _, html = _render_email("User", items, "https://x.com/unsub", "2026-06-20")
        assert "TCS" in html
        assert "—" in html

    def test_negative_change_color(self):
        items = [{"symbol": "INFY", "close": 1500.0, "pct_change": -2.5, "triggers": []}]
        _, html = _render_email(None, items, "https://x.com/unsub", "2026-06-20")
        assert "#e5383b" in html
        assert "-2.50%" in html
