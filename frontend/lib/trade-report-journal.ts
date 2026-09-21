import { createJournalEntry, getJournalEntries, updateJournalEntry } from "@/lib/api";
import type { CreateJournalEntry } from "@/lib/api";
import type { ImportedTrade, TradeReportParseResult } from "@/lib/trade-report-import";

export type TradeReportJournalImportResult = {
  imported: number;
  skipped: number;
  ineligible: number;
  total: number;
  message: string;
};

const IMPORT_MARKER_PREFIX = "alphavyuh-report-import";

function failedImportResult(result: TradeReportParseResult, imported: number, skipped: number, ineligible: number): TradeReportJournalImportResult {
  const prefix = imported > 0
    ? `Journal import stopped after ${imported} trade${imported === 1 ? "" : "s"} ${imported === 1 ? "was" : "were"} saved.`
    : "Journal import could not start. No trades were saved.";

  return {
    imported,
    skipped,
    ineligible,
    total: result.trades.length,
    message: `${prefix} Check Data Status, then try the import again.`,
  };
}

function markerForTrade(trade: ImportedTrade): string {
  return [
    IMPORT_MARKER_PREFIX,
    trade.symbol,
    trade.tradeType,
    trade.entryDate ?? "no-entry-date",
    trade.exitDate ?? "no-exit-date",
    trade.quantity ?? "no-qty",
    trade.entryPrice ?? "no-entry",
    trade.exitPrice ?? "no-exit",
    trade.pnl,
  ].join(":");
}

function isJournalReady(trade: ImportedTrade): boolean {
  return Boolean(trade.entryDate && trade.entryPrice != null && trade.exitDate && trade.exitPrice != null && trade.quantity != null);
}

function entryReason(trade: ImportedTrade, broker: string, marker: string): string {
  const outcome = trade.pnl >= 0 ? "profit" : "loss";
  const pct = trade.pnlPct == null ? "" : `, ${trade.pnlPct.toFixed(2)}%`;
  return `UNPLANNED trade — Broker report import - ${broker}; source row ${trade.sourceRow}; ${outcome} ${trade.pnl}${pct}. [${marker}]`;
}

function createEntryPayload(trade: ImportedTrade, broker: string, marker: string): CreateJournalEntry {
  return {
    symbol: trade.symbol,
    trade_type: trade.tradeType,
    entry_date: trade.entryDate ?? "",
    entry_price: trade.entryPrice ?? 0,
    quantity: trade.quantity ?? 0,
    setup_type: "unplanned",
    entry_reason: entryReason(trade, broker, marker),
    source_page: "manual",
    source_context: `${broker} upload`,
    thesis: `Imported from ${broker} trade report for review.`,
    invalidation_rule: "Review the original setup and broker execution notes before reusing this pattern.",
  };
}

export function countJournalReadyTrades(result: TradeReportParseResult): number {
  return result.trades.filter(isJournalReady).length;
}

export async function importTradeReportToJournal(result: TradeReportParseResult): Promise<TradeReportJournalImportResult> {
  const readyTrades = result.trades.filter(isJournalReady);
  const ineligible = result.trades.length - readyTrades.length;
  let existing: Awaited<ReturnType<typeof getJournalEntries>>;
  try {
    existing = await getJournalEntries({ limit: 500 });
  } catch {
    return failedImportResult(result, 0, 0, ineligible);
  }
  const existingReasons = new Set(existing.entries.map((entry) => entry.entry_reason ?? ""));
  let imported = 0;
  let skipped = 0;

  for (const trade of readyTrades) {
    const marker = markerForTrade(trade);
    if ([...existingReasons].some((reason) => reason.includes(marker))) {
      skipped += 1;
      continue;
    }

    try {
      const created = await createJournalEntry(createEntryPayload(trade, result.summary.broker, marker));
      await updateJournalEntry(created.id, {
        exit_date: trade.exitDate ?? undefined,
        exit_price: trade.exitPrice ?? undefined,
        exit_reason: `Closed trade imported from ${result.summary.broker} report. Verify setup quality, execution, and exit discipline in review.`,
      });
    } catch {
      return failedImportResult(result, imported, skipped, ineligible);
    }
    existingReasons.add(marker);
    imported += 1;
  }

  const message = imported > 0
    ? `Imported ${imported} trade${imported === 1 ? "" : "s"} into journal review.`
    : skipped > 0
      ? "All journal-ready rows were already imported."
      : "No journal-ready rows found. Include entry date, exit date, quantity, entry price, and exit price.";

  return {
    imported,
    skipped,
    ineligible,
    total: result.trades.length,
    message,
  };
}
