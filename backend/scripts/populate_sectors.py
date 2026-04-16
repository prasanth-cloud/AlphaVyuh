"""
Populate sector column in stock_universe via Yahoo Finance.
Run: python scripts/populate_sectors.py

Rate-limited to avoid getting blocked. Takes ~10-15 mins for all stocks.
"""
import os
import sys
import time
import json

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

import yfinance as yf
from supabase import create_client

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
BATCH = 5       # symbols per yfinance batch
SLEEP = 1.0     # seconds between batches

# Known sector map — covers ~200 major stocks instantly without API calls
KNOWN_SECTORS = {
    # IT
    "TCS": "Information Technology", "INFY": "Information Technology",
    "WIPRO": "Information Technology", "HCLTECH": "Information Technology",
    "TECHM": "Information Technology", "LTIM": "Information Technology",
    "PERSISTENT": "Information Technology", "MPHASIS": "Information Technology",
    "COFORGE": "Information Technology", "OFSS": "Information Technology",
    "KPITTECH": "Information Technology", "TATAELXSI": "Information Technology",
    "CYIENT": "Information Technology", "NIITTECH": "Information Technology",
    "HEXAWARE": "Information Technology", "MASTEK": "Information Technology",

    # Banking & Finance
    "HDFCBANK": "Financial Services", "ICICIBANK": "Financial Services",
    "KOTAKBANK": "Financial Services", "SBIN": "Financial Services",
    "AXISBANK": "Financial Services", "INDUSINDBK": "Financial Services",
    "BANDHANBNK": "Financial Services", "FEDERALBNK": "Financial Services",
    "IDFCFIRSTB": "Financial Services", "RBLBANK": "Financial Services",
    "YESBANK": "Financial Services", "PNB": "Financial Services",
    "BANKBARODA": "Financial Services", "CANBK": "Financial Services",
    "UNIONBANK": "Financial Services", "MAHABANK": "Financial Services",
    "BAJFINANCE": "Financial Services", "BAJAJFINSV": "Financial Services",
    "HDFC": "Financial Services", "LICHSGFIN": "Financial Services",
    "CHOLAFIN": "Financial Services", "MUTHOOTFIN": "Financial Services",
    "MANAPPURAM": "Financial Services", "SBICARD": "Financial Services",
    "HDFCAMC": "Financial Services", "NIPPONLIFE": "Financial Services",
    "ICICIGI": "Financial Services", "ICICIPRULI": "Financial Services",
    "SBILIFE": "Financial Services", "HDFCLIFE": "Financial Services",

    # Pharma & Healthcare
    "SUNPHARMA": "Healthcare", "DRREDDY": "Healthcare",
    "CIPLA": "Healthcare", "LUPIN": "Healthcare",
    "DIVISLAB": "Healthcare", "BIOCON": "Healthcare",
    "AUROPHARMA": "Healthcare", "ALKEM": "Healthcare",
    "TORNTPHARM": "Healthcare", "IPCALAB": "Healthcare",
    "ABBOTINDIA": "Healthcare", "PFIZER": "Healthcare",
    "GLAXO": "Healthcare", "NATCOPHARM": "Healthcare",
    "GRANULES": "Healthcare", "GLENMARK": "Healthcare",
    "APOLLOHOSP": "Healthcare", "FORTIS": "Healthcare",
    "MAXHEALTH": "Healthcare", "MEDANTA": "Healthcare",
    "LALPATHLAB": "Healthcare", "METROPOLIS": "Healthcare",

    # Auto
    "MARUTI": "Automobile", "M&M": "Automobile",
    "TATAMOTORS": "Automobile", "BAJAJ-AUTO": "Automobile",
    "HEROMOTOCO": "Automobile", "EICHERMOT": "Automobile",
    "ASHOKLEY": "Automobile", "TVSMOTOR": "Automobile",
    "MOTHERSON": "Automobile", "BOSCHLTD": "Automobile",
    "MINDA": "Automobile", "BALKRISIND": "Automobile",
    "APOLLO_TYRE": "Automobile", "MRF": "Automobile",
    "CEATLTD": "Automobile", "TIINDIA": "Automobile",

    # Energy & Oil
    "RELIANCE": "Energy", "ONGC": "Energy",
    "BPCL": "Energy", "IOC": "Energy",
    "HINDPETRO": "Energy", "GAIL": "Energy",
    "PETRONET": "Energy", "GUJGASLTD": "Energy",
    "IGL": "Energy", "MGL": "Energy",
    "NTPC": "Energy", "POWERGRID": "Energy",
    "ADANIPOWER": "Energy", "TATAPOWER": "Energy",
    "ADANIGREEN": "Energy", "ADANITRANS": "Energy",
    "CESC": "Energy", "TORNTPOWER": "Energy",
    "NHPC": "Energy", "SJVN": "Energy",

    # Metals & Mining
    "TATASTEEL": "Metals & Mining", "HINDALCO": "Metals & Mining",
    "JSWSTEEL": "Metals & Mining", "SAIL": "Metals & Mining",
    "VEDL": "Metals & Mining", "NMDC": "Metals & Mining",
    "COALINDIA": "Metals & Mining", "HINDCOPPER": "Metals & Mining",
    "NATIONALUM": "Metals & Mining", "RATNAMANI": "Metals & Mining",

    # FMCG
    "HINDUNILVR": "FMCG", "ITC": "FMCG",
    "NESTLEIND": "FMCG", "BRITANNIA": "FMCG",
    "DABUR": "FMCG", "GODREJCP": "FMCG",
    "MARICO": "FMCG", "COLPAL": "FMCG",
    "EMAMILTD": "FMCG", "VGUARD": "FMCG",
    "TATACONSUM": "FMCG", "VARUN_BEVERAGES": "FMCG",
    "VBL": "FMCG", "RADICO": "FMCG",

    # Cement
    "ULTRACEMCO": "Cement", "AMBUJACEM": "Cement",
    "ACC": "Cement", "SHREECEM": "Cement",
    "DALMIACEMEN": "Cement", "RAMCOCEM": "Cement",
    "JKCEMENT": "Cement", "HEIDELBERG": "Cement",
    "JKLAKSHMI": "Cement", "STARCEMENT": "Cement",

    # Realty
    "DLF": "Realty", "GODREJPROP": "Realty",
    "OBEROIRLTY": "Realty", "PRESTIGE": "Realty",
    "PHOENIXLTD": "Realty", "BRIGADE": "Realty",
    "SOBHA": "Realty", "MAHLIFE": "Realty",
    "KOLTEPATIL": "Realty", "SUNTECK": "Realty",

    # Telecom
    "BHARTIARTL": "Telecom", "IDEA": "Telecom",
    "TATACOMM": "Telecom", "HFCL": "Telecom",
    "RAILTEL": "Telecom", "STLTECH": "Telecom",

    # Capital Goods / Industrials
    "LT": "Capital Goods", "BHEL": "Capital Goods",
    "ABB": "Capital Goods", "SIEMENS": "Capital Goods",
    "CUMMINSIND": "Capital Goods", "THERMAX": "Capital Goods",
    "BEL": "Capital Goods", "HAL": "Capital Goods",
    "BHARAT_FORGE": "Capital Goods", "BHARATFORGE": "Capital Goods",
    "SCHAEFFLER": "Capital Goods", "TIMKEN": "Capital Goods",
    "GRINDWELL": "Capital Goods", "SKFINDIA": "Capital Goods",
    "KEC": "Capital Goods", "KALPATPOWR": "Capital Goods",
    "POLYCAB": "Capital Goods", "HAVELLS": "Capital Goods",
    "DIXON": "Capital Goods", "KAYNES": "Capital Goods",

    # Consumer Durables
    "VOLTAS": "Consumer Durables", "BLUESTARCO": "Consumer Durables",
    "WHIRLPOOL": "Consumer Durables", "CROMPTON": "Consumer Durables",
    "SYMPHONY": "Consumer Durables", "TITAN": "Consumer Durables",
    "KALYANKJIL": "Consumer Durables", "SENCO": "Consumer Durables",
    "RAJESHEXPO": "Consumer Durables",

    # Chemicals
    "PIDILITIND": "Chemicals", "ATUL": "Chemicals",
    "DEEPAKNITR": "Chemicals", "FINEORG": "Chemicals",
    "ALKYLAMINE": "Chemicals", "BALRAMCHIN": "Chemicals",
    "GNFC": "Chemicals", "GUJFLUORO": "Chemicals",
    "NAVINFLUOR": "Chemicals", "SRF": "Chemicals",
    "TATACHEM": "Chemicals", "COROMANDEL": "Chemicals",
    "CHAMBALFERT": "Chemicals", "RCF": "Chemicals",

    # Paints
    "ASIANPAINT": "Paints", "BERGEPAINT": "Paints",
    "KANSAINER": "Paints", "AKZOINDIA": "Paints",
    "INDIGO": "Aviation",

    # Logistics
    "DELHIVERY": "Logistics", "BLUEDART": "Logistics",
    "MAHINDRACIE": "Logistics", "TCI": "Logistics",
    "VRL": "Logistics",

    # Media
    "ZEEL": "Media & Entertainment", "SUNTV": "Media & Entertainment",
    "PVRINOX": "Media & Entertainment", "NAZARA": "Media & Entertainment",
    "NETWORK18": "Media & Entertainment",
}


def fetch_sectors_yfinance(symbols: list[str]) -> dict[str, str]:
    """Fetch sector for a batch of symbols via yfinance."""
    result = {}
    for sym in symbols:
        try:
            ticker = yf.Ticker(f"{sym}.NS")
            info = ticker.fast_info
            # fast_info doesn't have sector; use info dict
            full_info = ticker.info
            sector = full_info.get("sector") or full_info.get("industry") or ""
            if sector:
                result[sym] = sector
        except Exception:
            pass
    return result


def main():
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)

    # Get all active symbols without sector
    print("Fetching symbols without sector data...")
    res = (
        sb.table("stock_universe")
        .select("symbol")
        .eq("is_active", True)
        .is_("sector", "null")
        .execute()
    )
    symbols = [r["symbol"] for r in (res.data or [])]
    print(f"Found {len(symbols)} symbols without sector data")

    # First pass: apply known sectors instantly
    known_updates = {s: sec for s, sec in KNOWN_SECTORS.items() if s in symbols}
    if known_updates:
        print(f"Applying {len(known_updates)} known sector mappings...")
        for sym, sector in known_updates.items():
            sb.table("stock_universe").update({"sector": sector}).eq("symbol", sym).execute()
        print(f"  Done.")

    # Remove already-mapped symbols
    remaining = [s for s in symbols if s not in known_updates]
    print(f"{len(remaining)} symbols remaining — fetching via Yahoo Finance...")

    updated = 0
    for i in range(0, len(remaining), BATCH):
        batch = remaining[i:i + BATCH]
        sectors = fetch_sectors_yfinance(batch)
        for sym, sector in sectors.items():
            sb.table("stock_universe").update({"sector": sector}).eq("symbol", sym).execute()
            updated += 1
        done = min(i + BATCH, len(remaining))
        print(f"  {done}/{len(remaining)} — updated {updated} via Yahoo Finance", end="\r")
        time.sleep(SLEEP)

    print(f"\nDone! Applied {len(known_updates)} known + {updated} via Yahoo Finance.")

    # Summary
    res2 = sb.table("stock_universe").select("sector").not_.is_("sector", "null").execute()
    print(f"Total stocks with sector data: {len(res2.data or [])}")


if __name__ == "__main__":
    main()
