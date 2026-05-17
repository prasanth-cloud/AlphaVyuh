import os

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")

from app.routers.ai import generate_journal_analysis, generate_trade_lesson


def _trade(symbol: str, pnl: float, setup: str | None = "Breakout", holding_days: int = 2) -> dict:
    return {
        "id": f"{symbol}-1",
        "symbol": symbol,
        "trade_type": "long",
        "setup_type": setup,
        "entry_date": "2026-04-20",
        "entry_price": 100,
        "exit_date": "2026-04-22",
        "exit_price": 110 if pnl > 0 else 95,
        "quantity": 10,
        "pnl": pnl,
        "pnl_pct": pnl / 10,
        "holding_days": holding_days,
        "stop_loss": 95,
        "target_price": 115,
        "entry_reason": "Clean breakout",
        "exit_reason": "Plan exit",
        "mistakes": "Entered before volume confirmation",
    }


def test_generate_trade_lesson_uses_trade_fields():
    lesson = generate_trade_lesson(_trade("RELIANCE", 1000))

    assert "RELIANCE" in lesson
    assert "winner" in lesson
    assert "Breakout" in lesson


def test_generate_trade_lesson_references_original_review_context():
    lesson = generate_trade_lesson({
        **_trade("RELIANCE", -500, "Breakout", 5),
        "entry_reason": "Enter only after volume confirmation above the pivot",
        "exit_reason": "Exited after losing the pivot",
        "mistakes": "Chased before confirmation",
    })

    assert "Original idea noted" in lesson
    assert "volume confirmation" in lesson
    assert "Exit note" in lesson
    assert "Review note" in lesson


def test_generate_journal_analysis_is_local_markdown():
    trades = [
        _trade("RELIANCE", 1000, "Breakout", 2),
        _trade("TCS", -600, "Pullback", 7),
        _trade("INFY", 400, None, 1),
    ]

    analysis = generate_journal_analysis(trades)

    assert "## Key Patterns" in analysis
    assert "## Top Mistakes" in analysis
    assert "3 closed trades" in analysis
    assert "Claude" not in analysis
