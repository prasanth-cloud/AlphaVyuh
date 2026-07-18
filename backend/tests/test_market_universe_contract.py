from app.services.market_universe_contract import (
    MARKET_UNIVERSE_CONTRACT,
    active_market_universe_count,
    apply_market_universe_filters,
    market_universe_evidence,
)


class _Query:
    def __init__(self):
        self.operations = []

    def eq(self, field, value):
        self.operations.append(("eq", field, value))
        return self

    def in_(self, field, value):
        self.operations.append(("in", field, value))
        return self

    def select(self, *args, **kwargs):
        return self

    def limit(self, value):
        return self

    def execute(self):
        return type("Result", (), {"count": 1495})()


class _Client:
    def __init__(self):
        self.query = _Query()

    def table(self, name):
        assert name == "stock_universe"
        return self.query


def test_market_universe_contract_names_the_nse_active_equity_scope():
    assert MARKET_UNIVERSE_CONTRACT == {
        "schema_version": 1,
        "id": "nse_active_eq",
        "label": "Active NSE equity universe",
        "market": "NSE",
        "series": ["EQ"],
        "active_only": True,
        "session_basis": "latest_complete_eod_session",
        "numerator": "distinct_symbols_with_valid_eod_row",
        "denominator": "active_stock_universe_symbols",
        "complete_session_min_coverage_pct": 75,
        "healthy_coverage_pct": 90,
    }


def test_market_universe_filter_and_evidence_use_the_same_scope():
    query = apply_market_universe_filters(_Query())
    assert query.operations == [
        ("eq", "stock_universe.market", "NSE"),
        ("in", "stock_universe.series", ["EQ"]),
        ("eq", "stock_universe.is_active", True),
    ]
    assert market_universe_evidence(symbols_count=1495, universe_active=1500) == {
        **MARKET_UNIVERSE_CONTRACT,
        "symbols_count": 1495,
        "universe_active": 1500,
        "coverage_pct": 99.7,
    }
    client = _Client()
    assert active_market_universe_count(client) == 1495
    assert client.query.operations == [
        ("eq", "market", "NSE"),
        ("in", "series", ["EQ"]),
        ("eq", "is_active", True),
    ]
