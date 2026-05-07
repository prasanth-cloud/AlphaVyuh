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
});
