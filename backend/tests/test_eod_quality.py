from datetime import date

import pandas as pd

from app.services.eod_quality import (
    assess_bhavcopy_frame,
    finish_job_run,
    start_job_run,
)


def test_assess_bhavcopy_frame_keeps_safe_rows_and_explains_rejections():
    frame = pd.DataFrame(
        [
            {"symbol": "SAFE", "series": "eq", "open": 100, "high": 110, "low": 99, "close": 108, "volume": 1000},
            {"symbol": "SAFE", "series": "EQ", "open": 100, "high": 110, "low": 99, "close": 108, "volume": 1000},
            {"symbol": "BAD", "series": "EQ", "open": 100, "high": 95, "low": 90, "close": 94, "volume": 1000},
            {"symbol": "MISSING", "series": "EQ", "open": 100, "high": 110, "low": 99, "close": None, "volume": 1000},
            {"symbol": "UNSUPPORTED", "series": "MF", "open": 100, "high": 110, "low": 99, "close": 108, "volume": 1000},
            {"symbol": "BE-SERIES", "series": "BE", "open": 50, "high": 52, "low": 49, "close": 51, "volume": 500},
        ]
    )

    clean, quality = assess_bhavcopy_frame(frame, valid_series={"EQ", "BE"})

    assert clean["symbol"].tolist() == ["SAFE", "BE-SERIES"]
    assert quality == {
        "quality_status": "partial",
        "source_rows": 6,
        "accepted_rows": 2,
        "filtered_series_rows": 1,
        "missing_required_rows": 1,
        "invalid_ohlcv_rows": 1,
        "duplicate_rows": 1,
        "rejected_rows": 4,
        "reasons": [
            "filtered 1 unsupported-series rows",
            "rejected 1 rows with missing required values",
            "rejected 1 rows with invalid OHLCV values",
            "removed 1 duplicate symbol rows",
        ],
    }


def test_assess_bhavcopy_frame_fails_closed_when_no_rows_are_safe():
    frame = pd.DataFrame(
        [{"symbol": "BAD", "series": "EQ", "open": -1, "high": 2, "low": 1, "close": 1, "volume": 1}]
    )

    clean, quality = assess_bhavcopy_frame(frame, valid_series={"EQ"})

    assert clean.empty
    assert quality["quality_status"] == "failed"
    assert quality["invalid_ohlcv_rows"] == 1


class _Response:
    def __init__(self, data=None):
        self.data = data or []


class _Query:
    def __init__(self, calls):
        self.calls = calls

    def insert(self, payload):
        self.calls.append(("insert", payload))
        return self

    def update(self, payload):
        self.calls.append(("update", payload))
        return self

    def eq(self, *args):
        self.calls.append(("eq", args))
        return self

    def execute(self):
        return _Response()


class _Client:
    def __init__(self):
        self.calls = []

    def table(self, name):
        assert name == "job_runs"
        return _Query(self.calls)


def test_job_run_evidence_is_started_and_completed_with_result():
    client = _Client()

    handle = start_job_run(
        client,
        job_type="eod_bhavcopy",
        trade_date=date(2026, 8, 20),
        input_payload={"source_name": "NSE bhavcopy"},
    )
    finish_job_run(client, handle, status="partial", result={"rows_ingested": 2})

    assert handle is not None
    assert client.calls[0][0] == "insert"
    assert client.calls[0][1]["job_type"] == "eod_bhavcopy"
    assert client.calls[0][1]["input_payload"] == {"source_name": "NSE bhavcopy"}
    assert client.calls[1][0] == "update"
    assert client.calls[1][1]["status"] == "partial"
    assert client.calls[1][1]["result"] == {"rows_ingested": 2}
