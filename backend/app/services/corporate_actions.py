"""
Fetches and stores corporate actions (splits, bonuses, dividends) from yfinance.
Called weekly via scripts/refresh_corporate_actions.py — not on every daily refresh.
"""
from __future__ import annotations

from datetime import date, timedelta

import pandas as pd


def fetch_actions(symbol: str, days_back: int = 365) -> list[dict]:
    """
    Returns recent corporate actions for a symbol from yfinance.
    Returns: [{'symbol': str, 'action_date': str, 'action_type': str, 'ratio': float|None, 'details': str}]
    """
    try:
        import yfinance as yf
    except ImportError:
        return []

    try:
        ticker = yf.Ticker(f"{symbol}.NS")
        splits = ticker.splits
        dividends = ticker.dividends
        cutoff = pd.Timestamp(date.today() - timedelta(days=days_back))
        actions: list[dict] = []

        if splits is not None and not splits.empty:
            for d, ratio in splits[splits.index >= cutoff].items():
                if ratio and ratio > 0:
                    actions.append({
                        "symbol": symbol,
                        "action_date": d.date().isoformat(),
                        "action_type": "split",
                        "ratio": round(float(ratio), 4),
                        "details": f"{ratio:.2f}:1 split",
                    })

        if dividends is not None and not dividends.empty:
            for d, amount in dividends[dividends.index >= cutoff].items():
                if amount and amount > 0:
                    actions.append({
                        "symbol": symbol,
                        "action_date": d.date().isoformat(),
                        "action_type": "dividend",
                        "ratio": None,
                        "details": f"\u20b9{amount:.2f}/share",
                    })

        return actions
    except Exception:
        return []
