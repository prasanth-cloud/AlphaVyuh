import asyncio

import pytest

from app.services.kite_stream import (
    MAX_KITE_STREAM_SUBSCRIBERS_PER_USER,
    KiteLiveTicker,
    KiteStreamError,
)


def test_normalize_tick_maps_kite_quote_fields():
    tick = KiteLiveTicker._normalize_tick(
        "RELIANCE",
        {
            "instrument_token": 738561,
            "last_price": 2910.25,
            "volume_traded": 123456,
            "ohlc": {"open": 2875.0, "high": 2922.5, "low": 2860.0, "close": 2890.0},
        },
        "2026-05-03T10:00:00+00:00",
    )

    assert tick["symbol"] == "RELIANCE"
    assert tick["close"] == 2910.25
    assert tick["prev_close"] == 2890.0
    assert tick["pct_change"] == 0.7
    assert tick["volume"] == 123456
    assert tick["source"] == "kite_ws"


def test_subscribe_enforces_per_user_stream_cap(monkeypatch):
    ticker = KiteLiveTicker()
    monkeypatch.setattr(ticker, "_resolve_tokens", lambda _symbols: [738561])
    monkeypatch.setattr(ticker, "_ensure_ticker", lambda: None)
    monkeypatch.setattr(ticker, "_subscribe_tokens", lambda *_args, **_kwargs: None)

    async def run():
        subscribers = [
            await ticker.subscribe(["RELIANCE"], user_id="user-1")
            for _ in range(MAX_KITE_STREAM_SUBSCRIBERS_PER_USER)
        ]
        with pytest.raises(KiteStreamError) as exc:
            await ticker.subscribe(["TCS"], user_id="user-1")
        assert "Too many live market streams" in str(exc.value)
        for subscriber in subscribers:
            ticker.unsubscribe(subscriber)

    asyncio.run(run())
