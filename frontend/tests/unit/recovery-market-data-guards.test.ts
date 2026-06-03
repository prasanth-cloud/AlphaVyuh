import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clearRecoveryMarketDataCache,
  latestRows,
  normalizeRecoveryScannerRequest,
} from "@/lib/server/recovery-market-data";

afterEach(() => {
  clearRecoveryMarketDataCache();
});

describe("recovery market data guards", () => {
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
  });

  it("rejects oversized scanner recovery request bodies before reading Supabase", async () => {
    const { POST } = await import("@/app/api/v1/scanner/run/route");
    const response = await POST(new Request("https://alphavyuh.test/api/v1/scanner/run", {
      method: "POST",
      headers: {
        "content-length": String(32_769),
        "content-type": "application/json",
      },
      body: JSON.stringify({ filters: {} }),
    }) as never);

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      status: "unavailable",
      mode: "unavailable",
      detail: "Scanner recovery request is too large.",
    });
  });
});
