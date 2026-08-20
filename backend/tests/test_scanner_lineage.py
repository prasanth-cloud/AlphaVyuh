from __future__ import annotations

import os

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")

from app.routers.scanner import ScanFilters, ScanRequest
from app.services.scanner_lineage import add_lineage_ids, record_scanner_run


class _Result:
    def __init__(self, data):
        self.data = data


class _Query:
    def __init__(self, client, table_name):
        self.client = client
        self.table_name = table_name
        self.payload = None

    def insert(self, payload):
        self.payload = payload
        return self

    def execute(self):
        if self.table_name == "scanner_runs":
            self.client.runs.append(self.payload)
            return _Result([self.payload])
        if self.table_name == "scanner_candidates":
            rows = self.payload if isinstance(self.payload, list) else [self.payload]
            self.client.candidates.extend(rows)
            return _Result(rows)
        raise AssertionError(f"Unexpected table {self.table_name}")


class _Client:
    def __init__(self):
        self.runs = []
        self.candidates = []

    def table(self, table_name):
        return _Query(self, table_name)


def test_record_scanner_run_keeps_explainability_and_ranked_snapshots() -> None:
    client = _Client()
    body = ScanRequest(
        filters=ScanFilters(rs_score_min=70, series=["EQ"]),
        preset_id="trend_template",
        sort_by="setup_score",
        page=1,
        page_size=25,
    )
    response = {
        "trade_date": "2026-08-20",
        "total_matches": 2,
        "source_metadata": {"mode": "eod", "as_of": "2026-08-20"},
    }
    definition = {
        "id": "definition-1",
        "universe": "all_nse",
        "groups": [{
            "operator": "or",
            "filters": [{"kind": "price_min", "value": 100}],
        }],
    }
    candidates = [
        {
            "symbol": "TCS",
            "close": 3900,
            "setup_score": 88,
            "match_reasons": ["RS score 88"],
            "confidence_reasons": ["strong relative strength"],
            "data_warnings": [],
            "internal_only": "not persisted",
        },
        {
            "symbol": "INFY",
            "close": 1500,
            "setup_score": 76,
            "match_reasons": ["Price above SMA stack"],
        },
    ]

    lineage = record_scanner_run(
        client,
        user_id="user-1",
        body=body,
        response=response,
        candidates=candidates,
        definition=definition,
    )

    assert len(client.runs) == 1
    assert client.runs[0]["user_id"] == "user-1"
    assert client.runs[0]["input_definition"]["filters"]["rs_score_min"] == 70
    assert client.runs[0]["input_definition"]["normalized_definition"]["groups"][0]["operator"] == "or"
    assert len(client.candidates) == 2
    assert [row["rank"] for row in client.candidates] == [1, 2]
    assert client.candidates[0]["matched_conditions"]["match_reasons"] == ["RS score 88"]
    assert client.candidates[0]["result_snapshot"]["close"] == 3900
    assert "internal_only" not in client.candidates[0]["result_snapshot"]

    attached = add_lineage_ids(
        {**response, "results": candidates},
        scan_run_id=lineage["scan_run_id"],
        candidate_ids_by_symbol=lineage["candidate_ids_by_symbol"],
    )
    assert attached["scan_run_id"] == lineage["scan_run_id"]
    assert attached["results"][0]["candidate_id"] == lineage["candidate_ids_by_symbol"]["TCS"]
    assert attached["results"][1]["scan_run_id"] == lineage["scan_run_id"]
