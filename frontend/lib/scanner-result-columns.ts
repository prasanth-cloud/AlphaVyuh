export type ScannerResultView = {
  symbol: string;
  company_name: string;
  close: number;
  volume: number;
  pct_change?: number | null;
  volume_ratio?: number | null;
  rsi_14?: number | null;
  rs_score?: number | null;
  week_52_high_pct?: number | null;
  ema_20?: number | null;
  ema_50?: number | null;
  ema_200?: number | null;
  atr_pct?: number | null;
  adx_14?: number | null;
  macd_hist?: number | null;
  setup_score?: number | null;
  sector?: string | null;
  market_cap_cr?: number | null;
  pe_ratio?: number | null;
  pb_ratio?: number | null;
  roe?: number | null;
  roce?: number | null;
  eps?: number | null;
  dividend_yield?: number | null;
};

export type ScannerColumnId =
  | "symbol"
  | "company_name"
  | "close"
  | "volume"
  | "pct_change"
  | "volume_ratio"
  | "rsi_14"
  | "rs_score"
  | "week_52_high_pct"
  | "ema_20"
  | "ema_50"
  | "ema_200"
  | "atr_pct"
  | "adx_14"
  | "macd_hist"
  | "market_cap_cr"
  | "pe_ratio"
  | "pb_ratio"
  | "roe"
  | "roce"
  | "eps"
  | "dividend_yield"
  | "setup_score"
  | "sector";

export type ScannerColumnDef = {
  id: ScannerColumnId;
  label: string;
  group: "default" | "technical" | "fundamental";
  align?: "left" | "right";
  width?: number;
  sortKey?: string;
};

export const SCANNER_COLUMN_DEFS: ScannerColumnDef[] = [
  { id: "symbol", label: "Ticker", group: "default", width: 120 },
  { id: "company_name", label: "Name", group: "default", width: 160 },
  { id: "close", label: "Price", group: "default", align: "right", width: 92, sortKey: "close" },
  { id: "volume", label: "Volume", group: "default", align: "right", width: 88, sortKey: "volume" },
  { id: "pct_change", label: "% Chg", group: "technical", align: "right", width: 74, sortKey: "pct_change" },
  { id: "volume_ratio", label: "Vol ×", group: "technical", align: "right", width: 60, sortKey: "volume_ratio" },
  { id: "rsi_14", label: "RSI", group: "technical", align: "right", width: 50, sortKey: "rsi_14" },
  { id: "rs_score", label: "RS", group: "technical", align: "right", width: 50, sortKey: "rs_score" },
  { id: "week_52_high_pct", label: "52W H%", group: "technical", align: "right", width: 68, sortKey: "week_52_high_pct" },
  { id: "ema_20", label: "EMA 20", group: "technical", align: "right", width: 72 },
  { id: "ema_50", label: "EMA 50", group: "technical", align: "right", width: 72 },
  { id: "ema_200", label: "EMA 200", group: "technical", align: "right", width: 72 },
  { id: "atr_pct", label: "ATR %", group: "technical", align: "right", width: 64 },
  { id: "adx_14", label: "ADX", group: "technical", align: "right", width: 56 },
  { id: "macd_hist", label: "MACD hist", group: "technical", align: "right", width: 72 },
  { id: "setup_score", label: "Score", group: "technical", align: "right", width: 66, sortKey: "setup_score" },
  { id: "sector", label: "Sector", group: "fundamental", width: 120 },
  { id: "market_cap_cr", label: "Mkt cap (Cr)", group: "fundamental", align: "right", width: 88 },
  { id: "pe_ratio", label: "P/E", group: "fundamental", align: "right", width: 56 },
  { id: "pb_ratio", label: "P/B", group: "fundamental", align: "right", width: 56 },
  { id: "roe", label: "ROE %", group: "fundamental", align: "right", width: 64 },
  { id: "roce", label: "ROCE %", group: "fundamental", align: "right", width: 64 },
  { id: "eps", label: "EPS", group: "fundamental", align: "right", width: 64 },
  { id: "dividend_yield", label: "Div yield %", group: "fundamental", align: "right", width: 80 },
];

export const SCANNER_DEFAULT_COLUMN_IDS: ScannerColumnId[] = [
  "symbol",
  "company_name",
  "close",
  "volume",
];

const STORAGE_KEY = "alphavyuh-scanner-columns-v1";

function isColumnId(value: string): value is ScannerColumnId {
  return SCANNER_COLUMN_DEFS.some((col) => col.id === value);
}

export function readScannerVisibleColumns(): ScannerColumnId[] {
  if (typeof window === "undefined") return [...SCANNER_DEFAULT_COLUMN_IDS];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [...SCANNER_DEFAULT_COLUMN_IDS];
    const parsed = JSON.parse(raw) as string[];
    const valid = parsed.filter(isColumnId);
    return valid.length > 0 ? valid : [...SCANNER_DEFAULT_COLUMN_IDS];
  } catch {
    return [...SCANNER_DEFAULT_COLUMN_IDS];
  }
}

export function persistScannerVisibleColumns(columns: ScannerColumnId[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(columns));
}

function fmtNum(value: number | null | undefined, digits = 2): string {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toLocaleString("en-IN", { maximumFractionDigits: digits });
}

export function formatScannerColumnValue(id: ScannerColumnId, row: ScannerResultView): string {
  switch (id) {
    case "symbol":
      return row.symbol;
    case "company_name":
      return row.company_name;
    case "close":
      return fmtNum(row.close, 2);
    case "volume":
      return fmtNum(row.volume, 0);
    case "pct_change":
      return row.pct_change == null ? "—" : `${row.pct_change >= 0 ? "+" : ""}${fmtNum(row.pct_change, 2)}%`;
    case "volume_ratio":
      return row.volume_ratio == null ? "—" : `${fmtNum(row.volume_ratio, 2)}×`;
    case "rsi_14":
      return fmtNum(row.rsi_14, 1);
    case "rs_score":
      return fmtNum(row.rs_score, 0);
    case "week_52_high_pct":
      return row.week_52_high_pct == null ? "—" : `${fmtNum(row.week_52_high_pct, 1)}%`;
    case "ema_20":
      return fmtNum(row.ema_20, 2);
    case "ema_50":
      return fmtNum(row.ema_50, 2);
    case "ema_200":
      return fmtNum(row.ema_200, 2);
    case "atr_pct":
      return row.atr_pct == null ? "—" : `${fmtNum(row.atr_pct, 2)}%`;
    case "adx_14":
      return fmtNum(row.adx_14, 1);
    case "macd_hist":
      return fmtNum(row.macd_hist, 3);
    case "setup_score":
      return row.setup_score == null ? "—" : fmtNum(row.setup_score, 0);
    case "sector":
      return row.sector ?? "—";
    case "market_cap_cr":
      return fmtNum(row.market_cap_cr, 0);
    case "pe_ratio":
      return fmtNum(row.pe_ratio, 2);
    case "pb_ratio":
      return fmtNum(row.pb_ratio, 2);
    case "roe":
      return row.roe == null ? "—" : `${fmtNum(row.roe, 1)}%`;
    case "roce":
      return row.roce == null ? "—" : `${fmtNum(row.roce, 1)}%`;
    case "eps":
      return fmtNum(row.eps, 2);
    case "dividend_yield":
      return row.dividend_yield == null ? "—" : `${fmtNum(row.dividend_yield, 2)}%`;
    default:
      return "—";
  }
}

export function resolveScannerColumns(ids: ScannerColumnId[]): ScannerColumnDef[] {
  return ids
    .map((id) => SCANNER_COLUMN_DEFS.find((col) => col.id === id))
    .filter((col): col is ScannerColumnDef => col != null);
}
