"""
AlphaVyuh — NSE Data Seed Script
Seeds daily_ohlcv with 1 year of real NSE data via yfinance.

Run from project root:
    cd ~/alphavyuh
    python seed_now.py

Or with explicit env file:
    SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_KEY=eyJ... python seed_now.py
"""

import os, sys, time

# ── Load .env manually (handles any project structure) ────────────────────────
def load_env():
    """Try every common .env location."""
    candidates = [
        os.path.join(os.getcwd(), '.env'),
        os.path.join(os.getcwd(), 'backend', '.env'),
        os.path.join(os.path.dirname(__file__), '.env'),
        os.path.join(os.path.dirname(__file__), 'backend', '.env'),
        os.path.expanduser('~/alphavyuh/backend/.env'),
        os.path.expanduser('~/alphavyuh/.env'),
    ]
    for path in candidates:
        if os.path.exists(path):
            print(f"Loading env from: {path}")
            with open(path) as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith('#') and '=' in line:
                        k, _, v = line.partition('=')
                        # Strip quotes if present
                        v = v.strip().strip('"').strip("'")
                        if k.strip() and not os.environ.get(k.strip()):
                            os.environ[k.strip()] = v
            return path
    return None

found = load_env()
if not found:
    print("WARNING: No .env file found. Relying on environment variables already set.")

# ── Validate credentials ──────────────────────────────────────────────────────
SUPABASE_URL = os.environ.get('SUPABASE_URL', '').strip()
SUPABASE_KEY = (
    os.environ.get('SUPABASE_SERVICE_KEY', '') or
    os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '') or
    os.environ.get('SUPABASE_ANON_KEY', '')
).strip()

if not SUPABASE_URL:
    print("\nERROR: SUPABASE_URL is not set.")
    print("Fix: Set SUPABASE_URL to the reachable AlphaVyuh Supabase project in backend/.env")
    print("Or run: SUPABASE_URL=https://<project-ref>.supabase.co SUPABASE_SERVICE_KEY=eyJ... python seed_now.py")
    sys.exit(1)

if not SUPABASE_KEY:
    print("\nERROR: SUPABASE_SERVICE_KEY is not set.")
    print("Fix: Add SUPABASE_SERVICE_KEY=eyJ... to backend/.env")
    sys.exit(1)

print(f"Supabase URL host: {SUPABASE_URL.split('//')[-1].split('/')[0] if '//' in SUPABASE_URL else '[configured]'}")
print("Supabase key: [configured, redacted]")

# ── Install dependencies if missing ──────────────────────────────────────────
def ensure(pkg, import_name=None):
    import_name = import_name or pkg
    try:
        __import__(import_name)
    except ImportError:
        print(f"Installing {pkg}...")
        os.system(f"{sys.executable} -m pip install {pkg} -q")

ensure('yfinance')
ensure('pandas')
ensure('supabase')

# ── Imports ───────────────────────────────────────────────────────────────────
import yfinance as yf
import pandas as pd
from supabase import create_client

sb = create_client(SUPABASE_URL, SUPABASE_KEY)

# ── Top 100 NSE symbols ───────────────────────────────────────────────────────
SYMBOLS = [
    "RELIANCE","TCS","HDFCBANK","INFY","ICICIBANK","HINDUNILVR","SBIN","BAJFINANCE",
    "BHARTIARTL","KOTAKBANK","LT","HCLTECH","ASIANPAINT","AXISBANK","MARUTI","TITAN",
    "SUNPHARMA","ULTRACEMCO","WIPRO","POWERGRID","NTPC","JSWSTEEL","TATASTEEL","ONGC",
    "COALINDIA","TECHM","INDUSINDBK","DIVISLAB","DRREDDY","BAJAJ-AUTO","HEROMOTOCO",
    "CIPLA","EICHERMOT","BRITANNIA","HINDALCO","TATACONSUM","GRASIM","BPCL","IOC",
    "ADANIPORTS","TATAMOTOR","M&M","BAJAJFINSV","TATAMOTORS","UPL","SBILIFE",
    "HDFCLIFE","APOLLOHOSP","PIDILITIND","HAVELLS","SIEMENS","VOLTAS","BERGEPAINT",
    "GODREJCP","MUTHOOTFIN","COLPAL","MARICO","TRENT","JUBLFOOD","NAUKRI","ZOMATO",
    "DIXON","POLYCAB","ASTRAL","CAMS","PERSISTENT","COFORGE","MPHASIS","LTTS",
    "IRCTC","RVNL","IRFC","NHPC","SJVN","RECLTD","PFC","HUDCO","BANKBARODA",
    "CANBK","PNB","FEDERALBNK","IDFCFIRSTB","RBLBANK","BANDHANBNK","AUBANK",
    "DMART","ABFRL","BATAINDIA","CEATLTD","MGL","IGL","CONCOR","AMBUJACEM",
    "GRASIM","SHREECEM","INDIGO","SPICEJET","STAR","IDEA","VODA",
]
SYMBOLS = list(dict.fromkeys(SYMBOLS))[:100]  # deduplicate, cap at 100

SECTOR_MAP = {
    "RELIANCE":"Energy","TCS":"IT","HDFCBANK":"Banking","INFY":"IT",
    "ICICIBANK":"Banking","HINDUNILVR":"FMCG","SBIN":"Banking","BAJFINANCE":"NBFC",
    "BHARTIARTL":"Telecom","KOTAKBANK":"Banking","LT":"Industrials","HCLTECH":"IT",
    "ASIANPAINT":"Paints","AXISBANK":"Banking","MARUTI":"Auto","TITAN":"Retail",
    "SUNPHARMA":"Pharma","ULTRACEMCO":"Cement","WIPRO":"IT","POWERGRID":"Power",
    "NTPC":"Power","JSWSTEEL":"Metal","TATASTEEL":"Metal","ONGC":"Energy",
    "COALINDIA":"Mining","TECHM":"IT","INDUSINDBK":"Banking","DIVISLAB":"Pharma",
    "DRREDDY":"Pharma","BAJAJ-AUTO":"Auto","HEROMOTOCO":"Auto","CIPLA":"Pharma",
    "EICHERMOT":"Auto","BRITANNIA":"FMCG","HINDALCO":"Metal","TATACONSUM":"FMCG",
    "GRASIM":"Cement","BPCL":"Energy","IOC":"Energy","ADANIPORTS":"Logistics",
    "TATAMOTOR":"Auto","M&M":"Auto","BAJAJFINSV":"NBFC","TATAMOTORS":"Auto",
    "UPL":"Agro","SBILIFE":"Insurance","HDFCLIFE":"Insurance",
    "APOLLOHOSP":"Healthcare","PIDILITIND":"Chemicals","HAVELLS":"Consumer",
    "SIEMENS":"Industrials","VOLTAS":"Consumer","BERGEPAINT":"Paints",
    "GODREJCP":"FMCG","MUTHOOTFIN":"NBFC","COLPAL":"FMCG","MARICO":"FMCG",
    "TRENT":"Retail","JUBLFOOD":"QSR","NAUKRI":"Tech","ZOMATO":"Tech",
    "DIXON":"Electronics","POLYCAB":"Industrials","ASTRAL":"Chemicals",
    "CAMS":"Finance","PERSISTENT":"IT","COFORGE":"IT","MPHASIS":"IT",
    "LTTS":"IT","IRCTC":"Travel","RVNL":"Infra","IRFC":"Finance",
    "NHPC":"Power","SJVN":"Power","RECLTD":"Finance","PFC":"Finance",
    "HUDCO":"Finance","BANKBARODA":"Banking","CANBK":"Banking","PNB":"Banking",
    "FEDERALBNK":"Banking","IDFCFIRSTB":"Banking","RBLBANK":"Banking",
    "BANDHANBNK":"Banking","AUBANK":"Banking","DMART":"Retail",
    "BATAINDIA":"Retail","CEATLTD":"Auto Ancillary","MGL":"Gas","IGL":"Gas",
    "CONCOR":"Logistics","AMBUJACEM":"Cement","INDIGO":"Aviation",
}

# ── Helpers ───────────────────────────────────────────────────────────────────
def safe_float(val, decimals=4):
    try:
        v = float(val)
        if v != v or abs(v) > 1e12:  # NaN or inf
            return None
        return round(v, decimals)
    except:
        return None

def safe_int(val):
    try:
        v = float(val)
        if v != v:
            return None
        return int(v)
    except:
        return None

# ── Compute RSI without pandas-ta ─────────────────────────────────────────────
def compute_rsi(close_series, period=14):
    delta = close_series.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(alpha=1/period, min_periods=period, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1/period, min_periods=period, adjust=False).mean()
    rs = avg_gain / avg_loss.replace(0, 1e-10)
    return 100 - (100 / (1 + rs))

def compute_atr(high, low, close, period=14):
    tr = pd.concat([
        high - low,
        (high - close.shift(1)).abs(),
        (low - close.shift(1)).abs()
    ], axis=1).max(axis=1)
    return tr.ewm(alpha=1/period, min_periods=period, adjust=False).mean()

# ── Seed one symbol ───────────────────────────────────────────────────────────
def seed_symbol(symbol: str) -> int:
    ticker = f"{symbol}.NS"
    try:
        df = yf.download(ticker, period="1y", interval="1d",
                         progress=False, auto_adjust=True, timeout=20)
        if df.empty or len(df) < 20:
            return 0

        df = df.reset_index()
        # Flatten MultiIndex if yfinance returns one
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = [col[0] if col[1] == '' or col[1] == ticker else col[0]
                         for col in df.columns]
        df.columns = [str(c).lower().strip() for c in df.columns]

        # Rename date column
        for col in ['date', 'datetime', 'index']:
            if col in df.columns:
                df = df.rename(columns={col: 'trade_date'})
                break

        if 'close' not in df.columns or 'trade_date' not in df.columns:
            return 0

        close = df['close'].astype(float)
        high  = df['high'].astype(float) if 'high' in df.columns else close
        low   = df['low'].astype(float) if 'low' in df.columns else close
        volume = df['volume'].astype(float) if 'volume' in df.columns else pd.Series([0]*len(df))

        # Indicators — all computed in pandas, no pandas-ta needed
        df['prev_close']     = close.shift(1)
        df['pct_change']     = close.pct_change() * 100
        df['avg_volume_20d'] = volume.rolling(20, min_periods=1).mean()
        df['week_52_high']   = close.rolling(252, min_periods=20).max()
        df['week_52_low']    = close.rolling(252, min_periods=20).min()
        df['ema_20']         = close.ewm(span=20, adjust=False).mean()
        df['ema_50']         = close.ewm(span=50, adjust=False).mean()
        df['ema_200']        = close.ewm(span=200, adjust=False).mean()
        df['sma_20']         = close.rolling(20, min_periods=1).mean()
        df['rsi_14']         = compute_rsi(close)
        df['atr_14']         = compute_atr(high, low, close)

        # MACD
        ema12 = close.ewm(span=12, adjust=False).mean()
        ema26 = close.ewm(span=26, adjust=False).mean()
        df['macd_line']   = ema12 - ema26
        df['macd_signal'] = df['macd_line'].ewm(span=9, adjust=False).mean()
        df['macd_hist']   = df['macd_line'] - df['macd_signal']

        # Bollinger Bands
        bb_mid = close.rolling(20, min_periods=1).mean()
        bb_std = close.rolling(20, min_periods=1).std()
        df['bb_upper']  = bb_mid + 2 * bb_std
        df['bb_middle'] = bb_mid
        df['bb_lower']  = bb_mid - 2 * bb_std
        df['bb_width']  = (df['bb_upper'] - df['bb_lower']) / bb_mid.replace(0, 1)

        # Flags
        df['is_new_52w_high'] = close >= df['week_52_high']
        df['is_new_52w_low']  = close <= df['week_52_low']
        df['is_inside_bar']   = (high < high.shift(1)) & (low > low.shift(1))

        # Upsert stock_universe
        sb.table("stock_universe").upsert({
            "symbol": symbol,
            "company_name": symbol,
            "series": "EQ",
            "sector": SECTOR_MAP.get(symbol, "Diversified"),
            "is_active": True,
        }, on_conflict="symbol").execute()

        # Build rows
        rows = []
        for _, row in df.iterrows():
            try:
                td = row.get('trade_date')
                if td is None: continue
                if hasattr(td, 'date'): td = td.date()
                c = safe_float(row.get('close'))
                if not c or c <= 0: continue

                rows.append({
                    "symbol":        symbol,
                    "trade_date":    str(td),
                    "open":          safe_float(row.get('open')),
                    "high":          safe_float(row.get('high')),
                    "low":           safe_float(row.get('low')),
                    "close":         c,
                    "prev_close":    safe_float(row.get('prev_close')),
                    "volume":        safe_int(row.get('volume')),
                    "pct_change":    safe_float(row.get('pct_change')),
                    "avg_volume_20d":safe_int(row.get('avg_volume_20d')),
                    "week_52_high":  safe_float(row.get('week_52_high')),
                    "week_52_low":   safe_float(row.get('week_52_low')),
                    "ema_20":        safe_float(row.get('ema_20')),
                    "ema_50":        safe_float(row.get('ema_50')),
                    "ema_200":       safe_float(row.get('ema_200')),
                    "sma_20":        safe_float(row.get('sma_20')),
                    "rsi_14":        safe_float(row.get('rsi_14')),
                    "atr_14":        safe_float(row.get('atr_14')),
                    "macd_line":     safe_float(row.get('macd_line')),
                    "macd_signal":   safe_float(row.get('macd_signal')),
                    "macd_hist":     safe_float(row.get('macd_hist')),
                    "bb_upper":      safe_float(row.get('bb_upper')),
                    "bb_middle":     safe_float(row.get('bb_middle')),
                    "bb_lower":      safe_float(row.get('bb_lower')),
                    "bb_width":      safe_float(row.get('bb_width')),
                    "is_new_52w_high": bool(row.get('is_new_52w_high', False)),
                    "is_new_52w_low":  bool(row.get('is_new_52w_low', False)),
                    "is_inside_bar":   bool(row.get('is_inside_bar', False)),
                })
            except Exception:
                continue

        # Upsert in batches of 50
        for i in range(0, len(rows), 50):
            chunk = rows[i:i+50]
            try:
                sb.table("daily_ohlcv").upsert(
                    chunk, on_conflict="symbol,trade_date"
                ).execute()
            except Exception as e:
                print(f"    batch error: {e}")

        return len(rows)

    except Exception as e:
        print(f"    error: {type(e).__name__}: {e}")
        return 0

# ── Main ──────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print(f"\n{'='*55}")
    print(f"AlphaVyuh NSE Seed — {len(SYMBOLS)} stocks, 1 year of data")
    print(f"{'='*55}\n")

    total_rows = 0
    errors = 0

    for i, sym in enumerate(SYMBOLS):
        print(f"[{i+1:3d}/{len(SYMBOLS)}] {sym:<16}", end="", flush=True)
        n = seed_symbol(sym)
        if n > 0:
            print(f"✓ {n} rows")
            total_rows += n
        else:
            print(f"✗ skipped")
            errors += 1
        time.sleep(0.4)  # be kind to Yahoo Finance

    print(f"\n{'='*55}")
    print(f"Done.")
    print(f"Total rows inserted: {total_rows:,}")
    print(f"Errors / skipped:    {errors}")
    print(f"\nVerifying in Supabase...")

    try:
        r = sb.table("daily_ohlcv")\
            .select("trade_date, symbol, close, rsi_14")\
            .order("trade_date", desc=True)\
            .limit(5)\
            .execute()
        print(f"\nLatest 5 rows in daily_ohlcv:")
        for row in r.data:
            print(f"  {row['trade_date']}  {row['symbol']:<14}  "
                  f"₹{row['close']:<10.2f}  RSI {row['rsi_14']:.1f}" if row.get('rsi_14') else
                  f"  {row['trade_date']}  {row['symbol']:<14}  ₹{row['close']:.2f}")
        print(f"\n✅ Data is ready. Run the overnight build now.")
    except Exception as e:
        print(f"Verification error: {e}")
