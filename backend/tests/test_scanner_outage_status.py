import asyncio
import os

import pytest
from fastapi import HTTPException

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")

from app.routers import scanner  # noqa: E402


class _Result:
    def __init__(self, data=None):
        self.data = data


class _FailingQuery:
    def __getattr__(self, _name):
        return lambda *args, **kwargs: self

    def execute(self):
        raise RuntimeError("scanner query down")


class _FailingClient:
    def table(self, _name):
        return _FailingQuery()


class _ScreensQuery:
    def __init__(self, data=None):
        self.data = data if data is not None else []

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def order(self, *_args, **_kwargs):
        return self

    def execute(self):
        return _Result(self.data)


class _ScreensClient:
    def __init__(self, data=None):
        self.data = data

    def table(self, table_name):
        assert table_name == "saved_screens"
        return _ScreensQuery(self.data)


class _VcpRpcQuery:
    def __init__(self, symbols):
        self.symbols = symbols

    def execute(self):
        if "BROKEN" in self.symbols:
            raise RuntimeError("vcp lookback down")
        return _Result([
            {"symbol": symbol, "history": [{"close": 100}, {"close": 102}]}
            for symbol in self.symbols
        ])


class _VcpClient:
    def rpc(self, function_name, params):
        assert function_name == "get_vcp_lookback"
        return _VcpRpcQuery(params["p_symbols"])


def test_run_scanner_raises_503_when_admin_client_is_unavailable(monkeypatch):
    monkeypatch.setattr(scanner.scanner_limiter, "is_allowed", lambda user_id: True)
    monkeypatch.setattr(scanner, "get_admin_client", lambda: (_ for _ in ()).throw(RuntimeError("db down")))

    with pytest.raises(HTTPException) as exc:
        asyncio.run(scanner.run_scanner(scanner.ScanRequest(), user_id="user-1"))

    assert exc.value.status_code == 503
    assert exc.value.detail == "Scanner data is temporarily unavailable."


def test_execute_scan_raises_503_when_trade_date_is_unavailable(monkeypatch):
    monkeypatch.setattr(scanner, "get_latest_complete_trade_date", lambda client: None)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(scanner.execute_scan(object(), scanner.ScanRequest(), plan="pro"))

    assert exc.value.status_code == 503
    assert exc.value.detail == "No complete trade date is available for scanner."


def test_execute_scan_raises_503_when_primary_and_fallback_queries_fail():
    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            scanner.execute_scan(
                _FailingClient(),
                scanner.ScanRequest(),
                plan="pro",
                trade_date="2026-05-19",
            )
        )

    assert exc.value.status_code == 503
    assert exc.value.detail == "Scanner query could not complete; try a narrower preset."


def test_list_screens_keeps_valid_empty_state(monkeypatch):
    monkeypatch.setattr(scanner, "get_admin_client", lambda: _ScreensClient(data=[]))

    assert asyncio.run(scanner.list_screens(user_id="user-1")) == {"screens": []}


def test_list_screens_raises_503_when_saved_screen_query_fails(monkeypatch):
    monkeypatch.setattr(scanner, "get_admin_client", lambda: _FailingClient())

    with pytest.raises(HTTPException) as exc:
        asyncio.run(scanner.list_screens(user_id="user-1"))

    assert exc.value.status_code == 503
    assert exc.value.detail == "Saved scanner screens are temporarily unavailable."


def test_vcp_pass2_raises_503_when_any_lookback_chunk_fails(monkeypatch):
    monkeypatch.setattr(scanner, "VCP_RPC_CHUNK", 1)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            scanner._run_vcp_pass2(
                _VcpClient(),
                [{"symbol": "RELIANCE"}, {"symbol": "BROKEN"}],
                "2026-05-20",
                scanner.ScanFilters(vcp_min_pivots=2),
            )
        )

    assert exc.value.status_code == 503
    assert exc.value.detail == "VCP scanner lookback is temporarily unavailable."
