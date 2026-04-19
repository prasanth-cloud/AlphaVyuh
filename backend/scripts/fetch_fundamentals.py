"""
Fetch fundamental data for all NSE stocks in stock_universe via yfinance.
Run: cd backend && .venv/bin/python scripts/fetch_fundamentals.py
"""
import time
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import yfinance as yf
from app.services.supabase import get_admin_client

def fetch_fundamentals():
    client = get_admin_client()
    rows = client.table("stock_universe").select("symbol,market").eq("is_active", True).execute()
    symbols = rows.data or []
    print(f"Fetching fundamentals for {len(symbols)} symbols...")

    updated = 0
    for row in symbols:
        sym = row["symbol"]
        mkt = (row.get("market") or "NSE").upper()
        ticker_sym = f"{sym}.NS" if mkt in ("NSE", "BSE") else sym

        try:
            t = yf.Ticker(ticker_sym)
            info = t.info or {}

            mc_inr = info.get("marketCap")
            market_cap_cr = round(mc_inr / 1e7, 2) if mc_inr else None

            updates = {
                "market_cap_cr":  market_cap_cr,
                "pe_ratio":       info.get("trailingPE"),
                "pb_ratio":       info.get("priceToBook"),
                "eps":            info.get("trailingEps"),
                "dividend_yield": round(info.get("dividendYield", 0) * 100, 2) if info.get("dividendYield") else None,
                "debt_to_equity": info.get("debtToEquity"),
                "roe":            round(info.get("returnOnEquity", 0) * 100, 2) if info.get("returnOnEquity") else None,
                "book_value":     info.get("bookValue"),
                "face_value":     None,
                "fundamentals_updated_at": "now()",
            }
            # Remove None values so we don't overwrite existing data with None
            updates = {k: v for k, v in updates.items() if v is not None}

            if updates:
                client.table("stock_universe").update(updates).eq("symbol", sym).execute()
                updated += 1
                print(f"  ✓ {sym}: PE={updates.get('pe_ratio','—')} MCap={updates.get('market_cap_cr','—')}Cr")
            else:
                print(f"  - {sym}: no data from yfinance")

        except Exception as e:
            print(f"  ✗ {sym}: {e}")

        time.sleep(0.3)

    print(f"\nDone. Updated {updated}/{len(symbols)} symbols.")

if __name__ == "__main__":
    fetch_fundamentals()
