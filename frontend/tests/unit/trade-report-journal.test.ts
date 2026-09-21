import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JournalEntry } from "@/lib/api";
import { importTradeReportToJournal } from "@/lib/trade-report-journal";
import { parseTradeReportCsv, sampleTradeReportCsv } from "@/lib/trade-report-import";

const apiMocks = vi.hoisted(() => ({
  getJournalEntries: vi.fn(),
  createJournalEntry: vi.fn(),
  updateJournalEntry: vi.fn(),
}));

vi.mock("@/lib/api", () => apiMocks);

function journalEntry(id: string, entryReason: string): JournalEntry {
  return {
    id,
    user_id: "mock-user",
    symbol: "RELIANCE",
    company_name: null,
    trade_type: "long",
    setup_type: "unplanned",
    entry_date: "2026-05-01",
    entry_price: 2840,
    quantity: 12,
    exit_date: "2026-05-06",
    exit_price: 2915,
    pnl: 900,
    pnl_pct: 2.6408,
    holding_days: 5,
    stop_loss: null,
    target_price: null,
    risk_reward: null,
    entry_reason: entryReason,
    exit_reason: null,
    mistakes: null,
    lessons: null,
    status: "closed",
    source_page: "manual",
    source_context: "Generic broker CSV upload",
    scanner_context: null,
    thesis: null,
    invalidation_rule: null,
    created_at: "2026-05-01T00:00:00Z",
    updated_at: "2026-05-06T00:00:00Z",
  };
}

describe("trade report journal import", () => {
  beforeEach(() => {
    apiMocks.getJournalEntries.mockReset();
    apiMocks.createJournalEntry.mockReset();
    apiMocks.updateJournalEntry.mockReset();
    apiMocks.getJournalEntries.mockResolvedValue({ entries: [], total: 0 });
    apiMocks.createJournalEntry.mockImplementation(async (entry) => journalEntry(`created-${entry.symbol}`, entry.entry_reason));
    apiMocks.updateJournalEntry.mockImplementation(async (id, patch) => ({ id, ...patch }));
  });

  it("creates and closes journal entries for journal-ready report rows", async () => {
    const result = parseTradeReportCsv(sampleTradeReportCsv());
    const imported = await importTradeReportToJournal(result);

    expect(imported).toMatchObject({ imported: 4, skipped: 0, ineligible: 0, total: 4 });
    expect(apiMocks.createJournalEntry).toHaveBeenCalledTimes(4);
    expect(apiMocks.updateJournalEntry).toHaveBeenCalledTimes(4);
    expect(apiMocks.createJournalEntry.mock.calls[0][0]).toMatchObject({
      symbol: "RELIANCE",
      trade_type: "long",
      entry_date: "2026-05-01",
      entry_price: 2840,
      quantity: 12,
      setup_type: "unplanned",
      source_page: "manual",
      source_context: "Generic broker CSV upload",
    });
    expect(apiMocks.createJournalEntry.mock.calls[0][0].entry_reason).toContain("alphavyuh-report-import:RELIANCE");
    expect(apiMocks.createJournalEntry.mock.calls[0][0].entry_reason).toContain("UNPLANNED");
    expect(apiMocks.updateJournalEntry.mock.calls[0][1]).toMatchObject({ exit_date: "2026-05-06", exit_price: 2915 });
  });

  it("skips duplicate rows and rows that cannot be represented as closed journal trades", async () => {
    const result = parseTradeReportCsv(`symbol,entry_date,exit_date,trade_type,quantity,entry_price,exit_price,pnl
RELIANCE,2026-05-01,2026-05-06,long,12,2840,2915,900
TCS,2026-05-02,2026-05-07,long,5,,,280`);
    apiMocks.getJournalEntries.mockResolvedValue({
      entries: [journalEntry("existing", "Broker report import [alphavyuh-report-import:RELIANCE:long:2026-05-01:2026-05-06:12:2840:2915:900]")],
      total: 1,
    });

    const imported = await importTradeReportToJournal(result);

    expect(imported).toMatchObject({ imported: 0, skipped: 1, ineligible: 1, total: 2 });
    expect(apiMocks.createJournalEntry).not.toHaveBeenCalled();
    expect(imported.message).toBe("All journal-ready rows were already imported.");
  });

  it("imports paired broker tradebook executions as closed journal entries", async () => {
    const result = parseTradeReportCsv(`Trading Symbol,Trade Date,Transaction Type,Quantity,Price
RELIANCE,2026-05-01,BUY,10,100
RELIANCE,2026-05-03,SELL,10,112`);

    const imported = await importTradeReportToJournal(result);

    expect(imported).toMatchObject({ imported: 1, skipped: 0, ineligible: 0, total: 1 });
    expect(apiMocks.createJournalEntry).toHaveBeenCalledTimes(1);
    expect(apiMocks.updateJournalEntry).toHaveBeenCalledTimes(1);
    expect(apiMocks.createJournalEntry.mock.calls[0][0]).toMatchObject({
      symbol: "RELIANCE",
      trade_type: "long",
      entry_date: "2026-05-01",
      entry_price: 100,
      quantity: 10,
      source_context: "Zerodha / Kite style CSV upload",
    });
    expect(apiMocks.updateJournalEntry.mock.calls[0][1]).toMatchObject({
      exit_date: "2026-05-03",
      exit_price: 112,
    });
  });

  it("returns stable copy when the existing journal lookup fails", async () => {
    const result = parseTradeReportCsv(sampleTradeReportCsv());
    apiMocks.getJournalEntries.mockRejectedValue(new Error("JWT expired for user@example.com"));

    const imported = await importTradeReportToJournal(result);

    expect(imported).toMatchObject({ imported: 0, skipped: 0, ineligible: 0, total: 4 });
    expect(imported.message).toBe("Journal import could not start. No trades were saved. Check Data Status, then try the import again.");
    expect(imported.message).not.toContain("JWT");
    expect(imported.message).not.toContain("user@example.com");
    expect(apiMocks.createJournalEntry).not.toHaveBeenCalled();
  });

  it("stops with stable copy when saving a journal row fails", async () => {
    const result = parseTradeReportCsv(sampleTradeReportCsv());
    apiMocks.createJournalEntry
      .mockImplementationOnce(async (entry) => journalEntry(`created-${entry.symbol}`, entry.entry_reason))
      .mockRejectedValueOnce(new Error("insert failed: access_token leaked"));

    const imported = await importTradeReportToJournal(result);

    expect(imported).toMatchObject({ imported: 1, skipped: 0, ineligible: 0, total: 4 });
    expect(imported.message).toBe("Journal import stopped after 1 trade was saved. Check Data Status, then try the import again.");
    expect(imported.message).not.toContain("insert failed");
    expect(imported.message).not.toContain("access_token");
    expect(apiMocks.createJournalEntry).toHaveBeenCalledTimes(2);
    expect(apiMocks.updateJournalEntry).toHaveBeenCalledTimes(1);
  });
});
