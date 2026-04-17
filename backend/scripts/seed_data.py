"""
Seed 1 year of NSE data for top ~170 stocks via yfinance.
Run once (or re-run — upsert is idempotent):

    cd backend
    .venv/bin/python scripts/seed_data.py

Takes ~15–20 minutes. Progress is printed as it goes.
"""
import sys
import os
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

from app.services.yfinance_ingest import fetch_and_ingest, NSE_UNIVERSE


def main():
    symbols = NSE_UNIVERSE
    print(f"Seeding {len(symbols)} stocks with 1 year of daily data...\n")
    success = failed = skipped = 0
    for i, sym in enumerate(symbols):
        print(f"[{i + 1:3d}/{len(symbols)}] {sym:<20}", end=" ... ", flush=True)
        result = fetch_and_ingest(sym, "1y")
        if result["status"] == "success":
            print(f"OK  {result['rows']} rows")
            success += 1
        elif result["status"] == "no_data":
            print("no data (delisted/not on NSE?)")
            skipped += 1
        else:
            print(f"FAIL  {result.get('error', '')[:80]}")
            failed += 1
        time.sleep(0.4)   # stay well within Yahoo's rate limit

    print(f"\n{'=' * 50}")
    print(f"Done:  {success} success,  {skipped} skipped,  {failed} failed")
    print(f"Total symbols attempted: {len(symbols)}")


if __name__ == "__main__":
    main()
