import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("mock market data trust", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_DATA_MODE", "mock");
    vi.stubEnv("NEXT_PUBLIC_ALLOW_MOCK_FALLBACK", "true");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("keeps chart identity aligned for route symbols used in e2e smoke", async () => {
    const { getCandles, getQuote } = await import("@/lib/api");

    const quote = await getQuote("AUBANK");
    const candles = await getCandles("AUBANK", { timeframe: "D", limit: 20 });

    expect(quote).toMatchObject({
      symbol: "AUBANK",
      company_name: "AU Small Finance Bank",
    });
    expect(candles).toMatchObject({
      symbol: "AUBANK",
      company_name: "AU Small Finance Bank",
    });
  });

  it("returns enough deterministic EOD depth for long full-chart ranges", async () => {
    const { getCandles } = await import("@/lib/api");

    const oneYear = await getCandles("AUBANK", { timeframe: "D", limit: 270 });
    const fiveYear = await getCandles("AUBANK", { timeframe: "W", limit: 270 });
    const tenYear = await getCandles("AUBANK", { timeframe: "M", limit: 130 });

    expect(new Date(oneYear.candles[0].time).getTime()).toBeLessThan(new Date("2025-06-01").getTime());
    expect(new Date(fiveYear.candles[0].time).getTime()).toBeLessThan(new Date("2021-06-01").getTime());
    expect(new Date(tenYear.candles[0].time).getTime()).toBeLessThan(new Date("2016-07-01").getTime());
  });
});
