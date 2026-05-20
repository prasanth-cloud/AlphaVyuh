export type ImportedTrade = {
  symbol: string;
  tradeType: "long" | "short";
  quantity: number | null;
  entryDate: string | null;
  exitDate: string | null;
  entryPrice: number | null;
  exitPrice: number | null;
  pnl: number;
  pnlPct: number | null;
  charges: number | null;
  sourceRow: number;
};

export type RejectedTradeRow = {
  row: number;
  reason: string;
  raw: Record<string, string>;
};

export type TradeReportSummary = {
  broker: string;
  totalRows: number;
  parsedTrades: number;
  rejectedRows: number;
  totalPnl: number;
  grossProfit: number;
  grossLoss: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRate: number;
  profitFactor: number | null;
  expectancy: number;
  averageWin: number;
  averageLoss: number;
  maxDrawdown: number;
  bestTrade: ImportedTrade | null;
  worstTrade: ImportedTrade | null;
  symbolBreakdown: {
    symbol: string;
    trades: number;
    pnl: number;
    winRate: number;
  }[];
  monthlyPnl: {
    month: string;
    pnl: number;
    trades: number;
  }[];
};

export type TradeReportParseResult = {
  trades: ImportedTrade[];
  rejected: RejectedTradeRow[];
  summary: TradeReportSummary;
};

const SAMPLE_TRADE_REPORT_CSV = `symbol,entry_date,exit_date,trade_type,quantity,entry_price,exit_price,pnl,charges
RELIANCE,2026-05-01,2026-05-06,long,12,2840,2915,900,42
TCS,2026-05-02,2026-05-07,long,5,3920,3864,-280,34
AUBANK,2026-05-03,2026-05-10,long,40,612,641,1160,51
ITC,2026-05-06,2026-05-08,short,30,438,431,210,26`;

const SYMBOL_KEYS = [
  "symbol",
  "tradingsymbol",
  "trading_symbol",
  "instrument",
  "instrumentname",
  "scrip",
  "stock",
  "ticker",
  "security",
];

const ENTRY_DATE_KEYS = ["entrydate", "entry_date", "buydate", "buy_date", "opendate", "open_date", "date", "tradedate", "trade_date"];
const EXIT_DATE_KEYS = ["exitdate", "exit_date", "selldate", "sell_date", "closedate", "close_date"];
const TRADE_TYPE_KEYS = ["tradetype", "trade_type", "side", "position", "type", "transactiontype", "transaction_type"];
const QUANTITY_KEYS = ["quantity", "qty", "netqty", "net_qty", "filledqty", "filled_qty"];
const ENTRY_PRICE_KEYS = ["entryprice", "entry_price", "buyprice", "buy_price", "buyavg", "buy_average", "buyaverage", "averagebuyprice", "avgbuyprice"];
const EXIT_PRICE_KEYS = ["exitprice", "exit_price", "sellprice", "sell_price", "sellavg", "sell_average", "sellaverage", "averagesellprice", "avgsellprice"];
const EXECUTION_PRICE_KEYS = ["price", "tradeprice", "trade_price", "averageprice", "average_price", "avgprice", "avg_price", "rate", "executionprice", "execution_price"];
const PNL_KEYS = ["pnl", "p&l", "profitloss", "profit_loss", "realisedpnl", "realizedpnl", "realised_pnl", "realized_pnl", "netpnl", "net_pnl"];
const PNL_PCT_KEYS = ["pnlpct", "pnl_pct", "p&l%", "return", "returnpct", "return_pct"];
const CHARGE_KEYS = ["charges", "brokerage", "fees", "taxes", "totalcharges", "total_charges"];

type ExecutionSide = "buy" | "sell";

type BrokerExecution = {
  symbol: string;
  side: ExecutionSide;
  quantity: number;
  price: number;
  tradeDate: string | null;
  charges: number | null;
  sourceRow: number;
  raw: Record<string, string>;
};

type OpenExecutionLot = BrokerExecution & {
  remainingQuantity: number;
  remainingCharges: number;
};

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9&%]+/g, "");
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function parseNumber(value: string | undefined): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || /^-+$/.test(trimmed)) return null;
  const negative = /^\(.*\)$/.test(trimmed) || /\b(dr|debit)\b/i.test(trimmed);
  const cleaned = trimmed
    .replace(/[(),₹$,%]/g, "")
    .replace(/\b(cr|credit|dr|debit)\b/gi, "")
    .replace(/\s+/g, "");
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return null;
  return negative && parsed > 0 ? -parsed : parsed;
}

function parseDate(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const iso = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) return [iso[1], iso[2].padStart(2, "0"), iso[3].padStart(2, "0")].join("-");

  const dmy = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
  if (dmy) {
    const year = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
    return [year, dmy[2].padStart(2, "0"), dmy[1].padStart(2, "0")].join("-");
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function pick(row: Record<string, string>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = row[key];
    if (value != null && value.trim()) return value;
  }
  return undefined;
}

function parseExecutionSide(value: string | undefined): ExecutionSide | null {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (!normalized) return null;
  if (/^(b|buy|bought)$/.test(normalized) || normalized.includes(" buy")) return "buy";
  if (/^(s|sell|sold)$/.test(normalized) || normalized.includes(" sell")) return "sell";
  return null;
}

function inferTradeType(raw: string | undefined, pnl: number, entryPrice: number | null, exitPrice: number | null): "long" | "short" {
  const value = raw?.toLowerCase() ?? "";
  if (value.includes("short") || value.includes("sell")) return "short";
  if (value.includes("long") || value.includes("buy")) return "long";
  if (entryPrice != null && exitPrice != null && pnl > 0 && exitPrice < entryPrice) return "short";
  return "long";
}

function detectBroker(headers: string[]): string {
  const joined = headers.join(" ");
  const normalized = headers.map(normalizeHeader).join(" ");
  if (/tradingsymbol|kite|zerodha|isin/i.test(joined) || /tradingsymbol|kite|zerodha|isin/i.test(normalized)) return "Zerodha / Kite style CSV";
  if (/upstox|instrumentkey|instrument_key/i.test(joined) || /upstox|instrumentkey/i.test(normalized)) return "Upstox style CSV";
  if (/groww/i.test(joined) || /groww/i.test(normalized)) return "Groww style CSV";
  return "Generic broker CSV";
}

function toRowObject(headers: string[], row: string[]): Record<string, string> {
  const object: Record<string, string> = {};
  headers.forEach((header, index) => {
    object[header] = row[index] ?? "";
  });
  return object;
}

function normalizeTrade(row: Record<string, string>, sourceRow: number): ImportedTrade | RejectedTradeRow {
  const symbol = pick(row, SYMBOL_KEYS)?.toUpperCase().replace(/[^A-Z0-9&-]/g, "");
  if (!symbol) return { row: sourceRow, reason: "Missing symbol column", raw: row };

  const quantity = parseNumber(pick(row, QUANTITY_KEYS));
  const entryPrice = parseNumber(pick(row, ENTRY_PRICE_KEYS));
  const exitPrice = parseNumber(pick(row, EXIT_PRICE_KEYS));
  const explicitPnl = parseNumber(pick(row, PNL_KEYS));
  const charges = parseNumber(pick(row, CHARGE_KEYS));
  const tradeType = inferTradeType(pick(row, TRADE_TYPE_KEYS), explicitPnl ?? 0, entryPrice, exitPrice);
  const calculatedPnl = entryPrice != null && exitPrice != null && quantity != null
    ? (tradeType === "short" ? entryPrice - exitPrice : exitPrice - entryPrice) * quantity
    : null;
  const pnl = explicitPnl ?? calculatedPnl;

  if (pnl == null || !Number.isFinite(pnl)) {
    return { row: sourceRow, reason: "Missing P&L or entry/exit price data", raw: row };
  }

  const entryValue = entryPrice != null && quantity != null ? entryPrice * quantity : null;
  const pnlPct = parseNumber(pick(row, PNL_PCT_KEYS)) ?? (entryValue ? (pnl / entryValue) * 100 : null);

  return {
    symbol,
    tradeType,
    quantity,
    entryDate: parseDate(pick(row, ENTRY_DATE_KEYS)),
    exitDate: parseDate(pick(row, EXIT_DATE_KEYS)) ?? parseDate(pick(row, ENTRY_DATE_KEYS)),
    entryPrice,
    exitPrice,
    pnl: round(pnl),
    pnlPct: pnlPct == null ? null : round(pnlPct, 4),
    charges: charges == null ? null : round(charges),
    sourceRow,
  };
}

function normalizeExecution(row: Record<string, string>, sourceRow: number): BrokerExecution | RejectedTradeRow {
  const symbol = pick(row, SYMBOL_KEYS)?.toUpperCase().replace(/[^A-Z0-9&-]/g, "");
  if (!symbol) return { row: sourceRow, reason: "Missing symbol column", raw: row };

  const side = parseExecutionSide(pick(row, TRADE_TYPE_KEYS));
  if (!side) return { row: sourceRow, reason: "Missing BUY/SELL side", raw: row };

  const quantity = parseNumber(pick(row, QUANTITY_KEYS));
  if (quantity == null || quantity <= 0) return { row: sourceRow, reason: "Missing execution quantity", raw: row };

  const price = parseNumber(pick(row, EXECUTION_PRICE_KEYS));
  if (price == null || price <= 0) return { row: sourceRow, reason: "Missing execution price", raw: row };

  const tradeDate = parseDate(pick(row, ENTRY_DATE_KEYS));
  if (!tradeDate) return { row: sourceRow, reason: "Missing execution date", raw: row };

  return {
    symbol,
    side,
    quantity,
    price,
    tradeDate,
    charges: parseNumber(pick(row, CHARGE_KEYS)),
    sourceRow,
    raw: row,
  };
}

function rowLooksLikeExecution(row: Record<string, string>): boolean {
  return Boolean(pick(row, TRADE_TYPE_KEYS) || pick(row, EXECUTION_PRICE_KEYS));
}

function makeOpenLot(execution: BrokerExecution, quantity = execution.quantity): OpenExecutionLot {
  const ratio = quantity / execution.quantity;
  return {
    ...execution,
    quantity,
    remainingQuantity: quantity,
    remainingCharges: round((execution.charges ?? 0) * ratio, 6),
  };
}

function earliestDate(dates: Array<string | null>): string | null {
  const valid = dates.filter((date): date is string => Boolean(date)).sort();
  return valid[0] ?? null;
}

function buildPairedTrade(
  symbol: string,
  tradeType: "long" | "short",
  closingExecution: BrokerExecution,
  matches: Array<{ lot: OpenExecutionLot; quantity: number; lotCharges: number; closeCharges: number }>,
): ImportedTrade {
  const quantity = matches.reduce((sum, match) => sum + match.quantity, 0);
  const entryValue = matches.reduce((sum, match) => sum + match.lot.price * match.quantity, 0);
  const entryPrice = quantity ? entryValue / quantity : 0;
  const exitPrice = closingExecution.price;
  const charges = matches.reduce((sum, match) => sum + match.lotCharges + match.closeCharges, 0);
  const grossPnl = tradeType === "short"
    ? (entryPrice - exitPrice) * quantity
    : (exitPrice - entryPrice) * quantity;
  const pnl = grossPnl - charges;
  const entryValueTotal = entryPrice * quantity;

  return {
    symbol,
    tradeType,
    quantity: round(quantity, 4),
    entryDate: earliestDate(matches.map((match) => match.lot.tradeDate)),
    exitDate: closingExecution.tradeDate,
    entryPrice: round(entryPrice, 4),
    exitPrice: round(exitPrice, 4),
    pnl: round(pnl),
    pnlPct: entryValueTotal ? round((pnl / entryValueTotal) * 100, 4) : null,
    charges: charges ? round(charges) : null,
    sourceRow: closingExecution.sourceRow,
  };
}

function closeOpenLots(
  lots: OpenExecutionLot[],
  closingExecution: BrokerExecution,
  tradeType: "long" | "short",
): { trades: ImportedTrade[]; closedQuantity: number } {
  let remainingToClose = closingExecution.quantity;
  const matches: Array<{ lot: OpenExecutionLot; quantity: number; lotCharges: number; closeCharges: number }> = [];

  while (remainingToClose > 0 && lots.length > 0) {
    const lot = lots[0];
    const quantity = Math.min(remainingToClose, lot.remainingQuantity);
    const lotChargeRatio = quantity / lot.remainingQuantity;
    const lotCharges = lot.remainingCharges * lotChargeRatio;
    const closeCharges = (closingExecution.charges ?? 0) * (quantity / closingExecution.quantity);

    matches.push({ lot, quantity, lotCharges, closeCharges });

    lot.remainingQuantity = round(lot.remainingQuantity - quantity, 6);
    lot.remainingCharges = round(lot.remainingCharges - lotCharges, 6);
    remainingToClose = round(remainingToClose - quantity, 6);
    if (lot.remainingQuantity <= 0.000001) lots.shift();
  }

  if (matches.length === 0) return { trades: [], closedQuantity: 0 };

  const closedQuantity = matches.reduce((sum, match) => sum + match.quantity, 0);
  return {
    trades: [buildPairedTrade(closingExecution.symbol, tradeType, closingExecution, matches)],
    closedQuantity: round(closedQuantity, 6),
  };
}

function pairExecutionRows(executions: BrokerExecution[]): { trades: ImportedTrade[]; rejected: RejectedTradeRow[] } {
  const longLots = new Map<string, OpenExecutionLot[]>();
  const shortLots = new Map<string, OpenExecutionLot[]>();
  const trades: ImportedTrade[] = [];

  const sortedExecutions = [...executions].sort((a, b) => {
    const byDate = (a.tradeDate ?? "").localeCompare(b.tradeDate ?? "");
    return byDate || a.sourceRow - b.sourceRow;
  });

  for (const execution of sortedExecutions) {
    const opposingLots = execution.side === "sell"
      ? (longLots.get(execution.symbol) ?? [])
      : (shortLots.get(execution.symbol) ?? []);
    const closeResult = closeOpenLots(opposingLots, execution, execution.side === "sell" ? "long" : "short");
    trades.push(...closeResult.trades);

    const remainingQuantity = round(execution.quantity - closeResult.closedQuantity, 6);
    if (remainingQuantity > 0.000001) {
      const sameSideLots = execution.side === "buy"
        ? (longLots.get(execution.symbol) ?? [])
        : (shortLots.get(execution.symbol) ?? []);
      sameSideLots.push(makeOpenLot(execution, remainingQuantity));
      if (execution.side === "buy") longLots.set(execution.symbol, sameSideLots);
      else shortLots.set(execution.symbol, sameSideLots);
    }
  }

  const rejected: RejectedTradeRow[] = [];
  for (const lot of [...longLots.values(), ...shortLots.values()].flat()) {
    rejected.push({
      row: lot.sourceRow,
      reason: "Unmatched open execution row",
      raw: lot.raw,
    });
  }

  return { trades, rejected };
}

function round(value: number, digits = 2): number {
  return Number(value.toFixed(digits));
}

function monthKey(trade: ImportedTrade): string {
  return (trade.exitDate ?? trade.entryDate ?? "Undated").slice(0, 7);
}

function computeMaxDrawdown(trades: ImportedTrade[]): number {
  let peak = 0;
  let equity = 0;
  let maxDrawdown = 0;
  const ordered = [...trades].sort((a, b) => (a.exitDate ?? "").localeCompare(b.exitDate ?? ""));
  for (const trade of ordered) {
    equity += trade.pnl;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, peak - equity);
  }
  return round(maxDrawdown);
}

function summarize(trades: ImportedTrade[], rejectedRows: number, totalRows: number, broker: string): TradeReportSummary {
  const wins = trades.filter((trade) => trade.pnl > 0);
  const losses = trades.filter((trade) => trade.pnl < 0);
  const breakeven = trades.length - wins.length - losses.length;
  const grossProfit = wins.reduce((sum, trade) => sum + trade.pnl, 0);
  const grossLoss = losses.reduce((sum, trade) => sum + trade.pnl, 0);
  const totalPnl = trades.reduce((sum, trade) => sum + trade.pnl, 0);
  const averageWin = wins.length ? grossProfit / wins.length : 0;
  const averageLoss = losses.length ? grossLoss / losses.length : 0;
  const symbolMap = new Map<string, ImportedTrade[]>();
  const monthMap = new Map<string, ImportedTrade[]>();

  for (const trade of trades) {
    symbolMap.set(trade.symbol, [...(symbolMap.get(trade.symbol) ?? []), trade]);
    const key = monthKey(trade);
    monthMap.set(key, [...(monthMap.get(key) ?? []), trade]);
  }

  const symbolBreakdown = [...symbolMap.entries()]
    .map(([symbol, rows]) => {
      const rowWins = rows.filter((trade) => trade.pnl > 0).length;
      return {
        symbol,
        trades: rows.length,
        pnl: round(rows.reduce((sum, trade) => sum + trade.pnl, 0)),
        winRate: rows.length ? round((rowWins / rows.length) * 100, 1) : 0,
      };
    })
    .sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl));

  const monthlyPnl = [...monthMap.entries()]
    .map(([month, rows]) => ({
      month,
      trades: rows.length,
      pnl: round(rows.reduce((sum, trade) => sum + trade.pnl, 0)),
    }))
    .sort((a, b) => a.month.localeCompare(b.month));

  return {
    broker,
    totalRows,
    parsedTrades: trades.length,
    rejectedRows,
    totalPnl: round(totalPnl),
    grossProfit: round(grossProfit),
    grossLoss: round(grossLoss),
    wins: wins.length,
    losses: losses.length,
    breakeven,
    winRate: trades.length ? round((wins.length / trades.length) * 100, 1) : 0,
    profitFactor: grossLoss < 0 ? round(grossProfit / Math.abs(grossLoss), 2) : null,
    expectancy: trades.length ? round(totalPnl / trades.length) : 0,
    averageWin: round(averageWin),
    averageLoss: round(averageLoss),
    maxDrawdown: computeMaxDrawdown(trades),
    bestTrade: trades.reduce<ImportedTrade | null>((best, trade) => !best || trade.pnl > best.pnl ? trade : best, null),
    worstTrade: trades.reduce<ImportedTrade | null>((worst, trade) => !worst || trade.pnl < worst.pnl ? trade : worst, null),
    symbolBreakdown,
    monthlyPnl,
  };
}

export function parseTradeReportCsv(text: string): TradeReportParseResult {
  const rows = parseCsv(text.trim());
  if (rows.length === 0) {
    return {
      trades: [],
      rejected: [],
      summary: summarize([], 0, 0, "Unknown CSV"),
    };
  }

  const headers = rows[0].map(normalizeHeader);
  const broker = detectBroker(rows[0]);
  const trades: ImportedTrade[] = [];
  const rejected: RejectedTradeRow[] = [];
  const executions: BrokerExecution[] = [];

  rows.slice(1).forEach((row, index) => {
    const rowNumber = index + 2;
    const rowObject = toRowObject(headers, row);
    const normalized = normalizeTrade(rowObject, rowNumber);
    if (!("reason" in normalized)) {
      trades.push(normalized);
      return;
    }

    const execution = normalizeExecution(rowObject, rowNumber);
    if (!("reason" in execution)) {
      executions.push(execution);
    } else {
      rejected.push(rowLooksLikeExecution(rowObject) ? execution : normalized);
    }
  });

  if (executions.length > 0) {
    const paired = pairExecutionRows(executions);
    trades.push(...paired.trades);
    rejected.push(...paired.rejected);
  }

  return {
    trades,
    rejected,
    summary: summarize(trades, rejected.length, Math.max(0, rows.length - 1), broker),
  };
}

export function sampleTradeReportCsv(): string {
  return SAMPLE_TRADE_REPORT_CSV;
}
