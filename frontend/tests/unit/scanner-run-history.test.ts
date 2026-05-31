import { describe, expect, it } from "vitest";
import {
  SCANNER_RUN_HISTORY_KEY,
  SCANNER_RUN_HISTORY_LIMIT,
  appendScannerRunHistory,
  clearScannerRunHistory,
  createScannerRunHistoryEntry,
  readScannerRunHistory,
} from "@/lib/scanner-run-history";

function memoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
    dump: () => store,
  };
}

const baseInput = {
  label: "Trend Template",
  presetId: "trend_template",
  totalMatches: 42,
  totalPages: 2,
  currentPage: 1,
  pageSize: 25,
  sortBy: "volume_ratio",
  sortDesc: true,
  tradeDate: "2026-05-29",
  isLimited: false,
  dataSource: "NSE bhavcopy EOD",
  dataMode: "eod",
  dataAsOf: "2026-05-29",
  coveragePct: 98.4,
  universeSize: 1830,
  filters: { rs_score_min: "70", series: ["EQ"] },
  results: [
    { symbol: "reliance", company_name: "Reliance Industries", sector: "Energy", match_reasons: ["RS near highs"] },
    { symbol: "INFY", company_name: "Infosys", sector: "IT" },
  ],
};

describe("scanner run history", () => {
  it("creates a restorable entry with source, filter, and top-symbol metadata", () => {
    const entry = createScannerRunHistoryEntry(baseInput, 1780000000000);

    expect(entry).toMatchObject({
      id: "scanner-run-1780000000000-RELIANCE",
      label: "Trend Template",
      presetId: "trend_template",
      resultCount: 2,
      totalMatches: 42,
      dataSource: "NSE bhavcopy EOD",
      dataMode: "eod",
      dataAsOf: "2026-05-29",
      coveragePct: 98.4,
      universeSize: 1830,
      filters: { rs_score_min: "70", series: ["EQ"] },
      topSymbols: ["RELIANCE", "INFY"],
      savedAt: 1780000000000,
    });
    expect(entry.results[0]?.symbol).toBe("RELIANCE");
  });

  it("keeps newest runs first, dedupes repeat runs, and caps history", () => {
    const storage = memoryStorage();

    for (let idx = 0; idx < SCANNER_RUN_HISTORY_LIMIT + 3; idx += 1) {
      appendScannerRunHistory({
        ...baseInput,
        label: `Run ${idx}`,
        results: [{ symbol: `SYM${idx}` }],
      }, storage, 1780000000000 + idx);
    }

    const capped = readScannerRunHistory(storage);
    expect(capped).toHaveLength(SCANNER_RUN_HISTORY_LIMIT);
    expect(capped[0]?.label).toBe(`Run ${SCANNER_RUN_HISTORY_LIMIT + 2}`);
    expect(capped.at(-1)?.label).toBe("Run 3");

    appendScannerRunHistory({ ...baseInput, label: "Run 10", results: [{ symbol: "SYM10" }] }, storage, 1780000005000);
    const deduped = readScannerRunHistory(storage);
    expect(deduped.filter((entry) => entry.label === "Run 10")).toHaveLength(1);
    expect(deduped[0]?.savedAt).toBe(1780000005000);
  });

  it("ignores malformed storage and clears local history", () => {
    const storage = memoryStorage();
    storage.setItem(SCANNER_RUN_HISTORY_KEY, JSON.stringify([{ label: "Bad" }, null, { results: [] }]));
    expect(readScannerRunHistory(storage)).toEqual([]);

    appendScannerRunHistory(baseInput, storage, 1780000000000);
    expect(readScannerRunHistory(storage)).toHaveLength(1);
    clearScannerRunHistory(storage);
    expect(readScannerRunHistory(storage)).toEqual([]);
  });
});
