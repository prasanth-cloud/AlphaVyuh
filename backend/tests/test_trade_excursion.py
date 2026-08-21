import os

import pytest

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")

from app.services import trade_excursion  # noqa: E402


def test_normalize_kite_candles_deduplicates_sorts_and_rejects_bad_ohlc():
    bars = trade_excursion.normalize_kite_candles([
        ["2026-08-03T09:15:00+0530", 103, 105, 102, 104, 200],
        ["2026-08-01T09:15:00+0530", 100, 101, 99, 100.5, 150],
        ["2026-08-02T09:15:00+0530", 101, 100, 98, 99, 100],  # high below open: invalid
        ["2026-08-03T09:15:00+0530", 103, 106, 102, 105, 250],  # latest duplicate wins
        ["bad-time", 1, 2, 1, 2, 1],
    ])

    assert [bar["time"] for bar in bars] == [
        "2026-08-01T03:45:00+00:00",
        "2026-08-03T03:45:00+00:00",
    ]
    assert bars[-1]["high"] == 106.0
    assert bars[-1]["volume"] == 250


def test_calculate_excursion_supports_long_and_short_paths():
    long_row = trade_excursion.calculate_excursion(
        {"id": "long-1", "symbol": "RELIANCE", "trade_type": "long", "entry_price": 100, "stop_loss": 95},
        [{"high": 108, "low": 96}],
        basis="intraday_path",
        interval="15minute",
        source="zerodha_kite",
    )
    short_row = trade_excursion.calculate_excursion(
        {"id": "short-1", "symbol": "RELIANCE", "trade_type": "short", "entry_price": 100, "stop_loss": 105},
        [{"high": 104, "low": 92}],
        basis="intraday_path",
        interval="15minute",
        source="zerodha_kite",
    )

    assert long_row == {
        "journal_entry_id": "long-1",
        "symbol": "RELIANCE",
        "mae_pct": -4.0,
        "mfe_pct": 8.0,
        "mae_r": -0.8,
        "mfe_r": 1.6,
        "bars_count": 1,
        "basis": "intraday_path",
        "interval": "15minute",
        "source": "zerodha_kite",
    }
    assert short_row["mae_pct"] == -4.0
    assert short_row["mfe_pct"] == 8.0
    assert short_row["mae_r"] == -0.8
    assert short_row["mfe_r"] == 1.6


def test_capture_uses_encrypted_server_credential_without_returning_it(monkeypatch):
    monkeypatch.setenv("KITE_API_KEY", "public-test-api-key")
    calls: dict[str, object] = {}

    def fake_credential(user_id, broker, key_name):
        assert (user_id, broker, key_name) == ("user-1", "zerodha", "access_token")
        return "encrypted-boundary-token"

    def fake_instruments(**kwargs):
        assert kwargs["access_token"] is None
        return "instrument_token,exchange,tradingsymbol\n123,NSE,RELIANCE\n"

    def fake_history(access_token, instrument_token, interval, from_date, to_date, **kwargs):
        calls.update({"access_token": access_token, "instrument_token": instrument_token, "interval": interval})
        return [["2026-08-01T09:15:00+0530", 100, 105, 98, 103, 1000]]

    monkeypatch.setattr(trade_excursion, "get_broker_credential", fake_credential)
    monkeypatch.setattr(trade_excursion.kite_api, "get_instruments", fake_instruments)
    monkeypatch.setattr(trade_excursion.kite_api, "get_historical_data", fake_history)

    result = trade_excursion.capture_zerodha_intraday_path(
        user_id="user-1",
        symbol="reliance",
        entry_date="2026-08-01",
        exit_date="2026-08-01",
        interval="15minute",
    )

    assert calls == {"access_token": "encrypted-boundary-token", "instrument_token": 123, "interval": "15minute"}
    assert result.symbol == "RELIANCE"
    assert result.bars[0]["high"] == 105.0
    assert "encrypted-boundary-token" not in repr(result)


def test_capture_rejects_unsupported_interval_without_touching_credentials(monkeypatch):
    credential_calls = 0

    def fail_if_called(*_args, **_kwargs):
        nonlocal credential_calls
        credential_calls += 1
        return "should-not-be-read"

    monkeypatch.setattr(trade_excursion, "get_broker_credential", fail_if_called)

    with pytest.raises(trade_excursion.IntradayPathError) as exc:
        trade_excursion.capture_zerodha_intraday_path(
            user_id="user-1",
            symbol="RELIANCE",
            entry_date="2026-08-01",
            exit_date="2026-08-01",
            interval="1minute",
        )

    assert exc.value.kind == "provider"
    assert credential_calls == 0
