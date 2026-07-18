import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clearRecoveryMarketDataCache,
  getLatestCoverage,
  getUniverseCount,
  latestRows,
  normalizeRecoveryScannerRequest,
  selectLatestCompleteTradeDate,
} from "@/lib/server/recovery-market-data";

afterEach(() => {
  clearRecoveryMarketDataCache();
});

describe("recovery market data guards", () => {
  it("skips a newer partial ingest and selects the latest complete NSE session", () => {
    const rows = [
      ...Array.from({ length: 400 }, (_, index) => ({ trade_date: "2026-07-18", symbol: `PARTIAL${index}` })),
      ...Array.from({ length: 1495 }, (_, index) => ({ trade_date: "2026-07-17", symbol: `COMPLETE${index}` })),
      ...Array.from({ length: 1495 }, (_, index) => ({ trade_date: "2026-07-16", symbol: `OLDER${index}` })),
    ];

    expect(selectLatestCompleteTradeDate(rows, 1500)).toBe("2026-07-17");
    expect(selectLatestCompleteTradeDate(rows.slice(0, 400), 1500)).toBeNull();
  });

  it("normalizes scanner requests to known bounded filters and sorts", () => {
    const normalized = normalizeRecoveryScannerRequest({
      filters: {
        price_min: "100",
        above_ema200: true,
        above_ema20: "true",
        unknown: "ignored",
        sectors: [
          "Financial Services",
          "Technology",
          "Healthcare",
          "Energy",
          "Consumer Defensive",
          "Industrials",
          "Utilities",
          "Communication",
          "Materials",
          "Real Estate",
          "Overflow",
          "",
        ],
      },
      sort_by: "__proto__",
      sort_order: "sideways",
      page: 999,
      page_size: 999,
    });

    expect(normalized.sort_by).toBe("volume_ratio");
    expect(normalized.sort_order).toBe("desc");
    expect(normalized.page).toBe(20);
    expect(normalized.page_size).toBe(25);
    expect(normalized.filters).toMatchObject({
      price_min: 100,
      above_ema200: true,
    });
    expect(normalized.filters).not.toHaveProperty("above_ema20");
    expect(normalized.filters).not.toHaveProperty("unknown");
    expect(normalized.filters.sectors).toHaveLength(10);
  });

  it("reuses latest rows within the warm recovery cache window", async () => {
    const ranges: Array<[number, number]> = [];
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      in: vi.fn(() => query),
      range: vi.fn(async (start: number, end: number) => {
        ranges.push([start, end]);
        return {
          data: [{ symbol: "RELIANCE", trade_date: "2026-05-20", close: 100 }],
          error: null,
        };
      }),
    };
    const client = {
      from: vi.fn(() => query),
    };

    const first = await latestRows(client as never, "2026-05-20");
    const second = await latestRows(client as never, "2026-05-20");

    expect(first).toHaveLength(1);
    expect(second).toBe(first);
    expect(ranges).toEqual([[0, 999]]);
    expect(query.eq).toHaveBeenCalledWith("stock_universe.market", "NSE");
    expect(query.in).toHaveBeenCalledWith("stock_universe.series", ["EQ"]);
    expect(query.eq).toHaveBeenCalledWith("stock_universe.is_active", true);
  });

  it("uses the same NSE active-equity scope for numerator and denominator counts", async () => {
    const operations: Array<[string, string, unknown]> = [];
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn((field: string, value: unknown) => {
        operations.push(["eq", field, value]);
        return query;
      }),
      in: vi.fn((field: string, value: unknown) => {
        operations.push(["in", field, value]);
        return query;
      }),
      order: vi.fn(() => query),
      limit: vi.fn(async () => ({ data: [{ trade_date: "2026-05-20" }], error: null })),
      then: (resolve: (value: { count: number; error: null }) => unknown) => resolve({ count: 1495, error: null }),
    };
    const client = { from: vi.fn(() => query) };

    await expect(getUniverseCount(client as never)).resolves.toBe(1495);
    await expect(getLatestCoverage(client as never, "2026-05-20")).resolves.toMatchObject({
      symbols_count: 1495,
      universe_active: 1495,
    });
    expect(operations).toEqual(expect.arrayContaining([
      ["eq", "market", "NSE"],
      ["in", "series", ["EQ"]],
      ["eq", "is_active", true],
      ["eq", "stock_universe.market", "NSE"],
      ["in", "stock_universe.series", ["EQ"]],
      ["eq", "stock_universe.is_active", true],
    ]));
  });

  it("rejects oversized scanner recovery request bodies before reading Supabase", async () => {
    const { RecoveryScannerBodyTooLargeError, readBoundedRecoveryScannerBody } = await import("@/lib/server/recovery-scanner-body");

    const request = new Request("https://alphavyuh.test/api/v1/scanner/run", {
      method: "POST",
      headers: {
        "content-length": String(32_769),
        "content-type": "application/json",
      },
      body: JSON.stringify({ filters: { note: "x".repeat(32_769) } }),
    });

    await expect(readBoundedRecoveryScannerBody(request)).rejects.toBeInstanceOf(RecoveryScannerBodyTooLargeError);
  });

  it("rejects oversized scanner recovery request bodies without trusting content-length", async () => {
    const { RecoveryScannerBodyTooLargeError, readBoundedRecoveryScannerBody } = await import("@/lib/server/recovery-scanner-body");

    const request = new Request("https://alphavyuh.test/api/v1/scanner/run", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ filters: { note: "x".repeat(32_769) } }),
    });

    await expect(readBoundedRecoveryScannerBody(request)).rejects.toBeInstanceOf(RecoveryScannerBodyTooLargeError);
  });
});
