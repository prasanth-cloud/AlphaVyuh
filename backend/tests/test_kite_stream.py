from app.services.kite_stream import KiteLiveTicker


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
