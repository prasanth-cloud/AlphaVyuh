"""Tests for email digest service — pure logic, no DB or Resend calls."""
import asyncio
from datetime import date, datetime, timezone
from types import SimpleNamespace

import pytest

from app.services import email_digest
from app.services.email_digest import _detect_triggers, _render_email


class DigestQuery:
    def __init__(self, client, table):
        self.client = client
        self.table = table
        self.target = None
        self.statuses = None

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, field, value):
        assert field == "trade_date"
        self.target = value
        return self

    def in_(self, field, values):
        assert field == "status"
        self.statuses = values
        return self

    def limit(self, *_args):
        return self

    def execute(self):
        if self.table == "daily_ohlcv":
            assert self.target == "2026-10-14"
            return SimpleNamespace(data=[], count=self.client.stored_rows)
        receipt = self.client.receipt
        rows = [receipt] if receipt and receipt.get("trade_date") == self.target else []
        if self.statuses is not None:
            rows = [row for row in rows if row.get("status") in self.statuses]
        return SimpleNamespace(data=rows)


class DigestClient:
    def __init__(self, receipt=None, stored_rows=100):
        self.receipt = receipt
        self.stored_rows = stored_rows
        self.tables = []

    def table(self, name):
        self.tables.append(name)
        return DigestQuery(self, name)


def completed_receipt(**changes):
    return {
        "trade_date": "2026-10-14", "status": "success", "rows_ingested": 100,
        "expected_rows": 100, "partial_ingest": False,
        "source_url": "https://nsearchives.nseindia.com/products/content/sec_bhavdata_full_14102026.csv",
        **changes,
    }


def test_trading_day_uses_canonical_completed_ingest_and_stored_candles():
    client = DigestClient(completed_receipt())

    assert email_digest._is_trading_day(client, date(2026, 10, 14)) is True
    assert client.tables == ["bhavcopy_ingestion_log", "daily_ohlcv"]


@pytest.mark.parametrize("receipt,stored_rows", [
    (None, 100),
    (completed_receipt(status="pending"), 100),
    (completed_receipt(status="partial", partial_ingest=True), 100),
    (completed_receipt(partial_ingest=True), 100),
    (completed_receipt(rows_ingested=0), 0),
    (completed_receipt(expected_rows=2000), 100),
    (completed_receipt(source_url=None), 100),
    (completed_receipt(), 0),
])
def test_digest_rejects_missing_partial_or_unstored_sessions(receipt, stored_rows):
    assert email_digest._is_trading_day(DigestClient(receipt, stored_rows), date(2026, 10, 14)) is False


def test_digest_skips_unconfigured_resend_without_touching_database(monkeypatch):
    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    monkeypatch.setattr(email_digest, "get_admin_client", lambda: pytest.fail("Missing sender credentials must skip before DB access"))

    assert asyncio.run(email_digest.send_daily_digests()) == {"status": "skipped", "reason": "no_resend_key"}


def test_digest_session_date_follows_ist_across_utc_midnight_boundary(monkeypatch):
    class UtcHostDate(date):
        @classmethod
        def today(cls):
            return cls(2026, 10, 14)

    class Clock(datetime):
        @classmethod
        def now(cls, tz=None):
            instant = cls(2026, 10, 14, 20, 0, tzinfo=timezone.utc)
            return instant.astimezone(tz) if tz is not None else instant.replace(tzinfo=None)

    checked_dates = []
    monkeypatch.setenv("RESEND_API_KEY", "re_unit_test_not_a_real_key")
    monkeypatch.setattr(email_digest, "date", UtcHostDate)
    monkeypatch.setattr(email_digest, "datetime", Clock)
    monkeypatch.setattr(email_digest, "get_admin_client", lambda: object())
    monkeypatch.setattr(email_digest, "_is_trading_day", lambda _client, target: checked_dates.append(target) or False)
    monkeypatch.setattr(email_digest.resend.Emails, "send", lambda *_args: pytest.fail("No completed session must send no email"))

    assert asyncio.run(email_digest.send_daily_digests()) == {"status": "skipped", "reason": "no_complete_eod"}
    assert checked_dates == [date(2026, 10, 15)]


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
