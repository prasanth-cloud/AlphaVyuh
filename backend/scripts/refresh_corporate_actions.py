"""
Weekly sync of corporate actions (splits, dividends) for all active NSE symbols.

Run: cd backend && .venv/bin/python scripts/refresh_corporate_actions.py
Or via GitHub Actions on Saturday mornings.
"""
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent / ".env")

from supabase import create_client
from app.services.corporate_actions import fetch_actions


def main():
    sb = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_ROLE_KEY"))

    rows = sb.table("stock_universe").select("symbol").eq("is_active", True).execute()
    symbols = [r["symbol"] for r in (rows.data or [])]
    print(f"Fetching corporate actions for {len(symbols)} symbols...")

    total_actions = 0
    errors = 0

    for i, sym in enumerate(symbols):
        try:
            actions = fetch_actions(sym, days_back=365)
            if actions:
                sb.table("corporate_actions").upsert(
                    actions, on_conflict="symbol,action_date,action_type"
                ).execute()
                total_actions += len(actions)
        except Exception as e:
            errors += 1
            print(f"  ERROR {sym}: {e}", file=sys.stderr)

        if (i + 1) % 100 == 0:
            print(f"  {i + 1}/{len(symbols)} processed · {total_actions} actions stored")
        time.sleep(0.15)

    print(f"\nDone. {total_actions} corporate actions stored. {errors} errors.")
    return 0 if errors == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
