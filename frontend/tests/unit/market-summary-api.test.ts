import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("market summary API", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.alphavyuh.test");
    vi.stubEnv("NEXT_PUBLIC_DATA_MODE", "live");
    vi.stubEnv("NEXT_PUBLIC_ALLOW_MOCK_FALLBACK", "false");
    vi.stubEnv("NEXT_PUBLIC_FORCE_LIVE_DATA", "true");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("rejects legacy successful unavailable market summary payloads", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({
        trade_date: null,
        advances: 0,
        declines: 0,
        unchanged: 0,
        total_stocks: 0,
        mode: "unavailable",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )));

    const { getMarketSummary } = await import("@/lib/api");

    await expect(getMarketSummary()).rejects.toThrow("Market summary is temporarily unavailable.");
  });
});
