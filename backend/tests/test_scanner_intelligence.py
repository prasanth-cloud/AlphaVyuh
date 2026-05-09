import pandas as pd

from app.services.scanner_intelligence import compute_scanner_intelligence_frame, to_backfill_payload


def _history(rows=170):
    dates = pd.date_range("2025-09-01", periods=rows, freq="B")
    return pd.DataFrame({
        "symbol": ["TEST"] * rows,
        "trade_date": dates.date.astype(str),
        "open": [100 + i * 0.4 for i in range(rows)],
        "high": [103 + i * 0.4 for i in range(rows)],
        "low": [98 + i * 0.4 for i in range(rows)],
        "close": [101 + i * 0.4 for i in range(rows)],
        "volume": [100_000 + i * 100 for i in range(rows)],
        "ema_200": [95 + i * 0.3 for i in range(rows)],
    })


def test_compute_scanner_intelligence_populates_core_fields():
    computed = compute_scanner_intelligence_frame(_history())
    latest = computed.iloc[-1]

    assert latest["ema_150"] > 0
    assert latest["ema_200_slope_30d"] > 0
    assert latest["avg_volume_50d"] > 0
    assert latest["price_perf_6m_pct"] > 0
    assert latest["high_3w"] >= latest["low_3w"]
    assert latest["darvas_box_height_pct"] > 0
    assert isinstance(bool(latest["is_nr7"]), bool)


def test_to_backfill_payload_respects_requested_date_window():
    computed = compute_scanner_intelligence_frame(_history())
    payload = to_backfill_payload(computed, "2026-01-05", "2026-01-09")

    assert payload
    assert {item["trade_date"] for item in payload} <= {
        "2026-01-05",
        "2026-01-06",
        "2026-01-07",
        "2026-01-08",
        "2026-01-09",
    }
    assert all("ema_200_slope_30d" in item for item in payload)
