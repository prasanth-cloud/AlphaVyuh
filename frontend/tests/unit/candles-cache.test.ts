import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const candlePayload = {
  symbol: "RELIANCE",
  timeframe: "D",
  candles: [
    { time: "2026-05-04", open: 100, high: 110, low: 99, close: 108, volume: 1000000 },
  ],
  latest: { time: "2026-05-04", close: 108 },
};

describe("candles client cache", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.alphavyuh.test");
    vi.stubEnv("NEXT_PUBLIC_FORCE_LIVE_DATA", "true");
    vi.stubEnv("NEXT_PUBLIC_DATA_MODE", "live");
    vi.stubEnv("NEXT_PUBLIC_ALLOW_MOCK_FALLBACK", "false");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("coalesces identical candle requests within the client cache window", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(candlePayload), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { getCandles } = await import("@/lib/api");
    const [first, second] = await Promise.all([
      getCandles("reliance", { timeframe: "D", limit: 120 }),
      getCandles("RELIANCE", { timeframe: "D", limit: 120 }),
    ]);

    expect(first).toEqual(candlePayload);
    expect(second).toEqual(candlePayload);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.alphavyuh.test/api/v1/charts/RELIANCE/candles?limit=120&timeframe=D",
      expect.any(Object),
    );
  });

  it("keeps different candle windows as separate cache entries", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(candlePayload), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { getCandles } = await import("@/lib/api");
    await getCandles("RELIANCE", { timeframe: "D", limit: 120 });
    await getCandles("RELIANCE", { timeframe: "W", limit: 120 });
    await getCandles("RELIANCE", { timeframe: "D", limit: 120, from_date: "2025-05-07", to_date: "2026-05-07" });
    await getCandles("RELIANCE", { timeframe: "D", limit: 120, from_date: "2021-05-07", to_date: "2026-05-07" });

    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("surfaces Railway fallback messages instead of generic no-data copy", async () => {
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ status: "error", code: 404, message: "Application not found" }),
      { status: 404 },
    ));
    vi.stubGlobal("fetch", fetchMock);

    const { getCandles } = await import("@/lib/api");

    await expect(getCandles("RELIANCE", { timeframe: "D", limit: 120 })).rejects.toThrow("Application not found");
  });

  it("rejects successful candle responses that carry unavailable mode", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(
        JSON.stringify({
          symbol: "RELIANCE",
          timeframe: "D",
          candles: [],
          latest: null,
          mode: "unavailable",
          source_metadata: {
            source_name: "Unavailable",
            mode: "fallback",
            as_of: null,
          },
        }),
        { status: 200 },
      ))
      .mockResolvedValueOnce(new Response(JSON.stringify(candlePayload), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { getCandles } = await import("@/lib/api");

    await expect(getCandles("RELIANCE", { timeframe: "D", limit: 120 })).rejects.toThrow("Chart candle data is temporarily unavailable.");
    await expect(getCandles("RELIANCE", { timeframe: "D", limit: 120 })).resolves.toEqual(candlePayload);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects successful live candle responses that carry unavailable status", async () => {
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({
        symbol: "RELIANCE",
        timeframe: "D",
        candles: [],
        latest: null,
        status: "unavailable",
        message: "Live chart provider is temporarily unavailable.",
      }),
      { status: 200 },
    ));
    vi.stubGlobal("fetch", fetchMock);

    const { getCandlesLive } = await import("@/lib/api");

    await expect(getCandlesLive("RELIANCE", { timeframe: "D", limit: 120 })).rejects.toThrow("Live chart provider is temporarily unavailable.");
  });

  it("rejects successful indicator responses that carry unavailable status", async () => {
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({
        symbol: "RELIANCE",
        indicators: {},
        status: "unavailable",
        message: "Chart indicators are temporarily unavailable.",
      }),
      { status: 200 },
    ));
    vi.stubGlobal("fetch", fetchMock);

    const { getIndicators } = await import("@/lib/api");

    await expect(getIndicators("RELIANCE", ["ema20"], "D")).rejects.toThrow("Chart indicators are temporarily unavailable.");
  });

  it("surfaces indicator outage details from failed responses", async () => {
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ detail: "Indicator service is temporarily unavailable." }),
      { status: 503 },
    ));
    vi.stubGlobal("fetch", fetchMock);

    const { getIndicators } = await import("@/lib/api");

    await expect(getIndicators("RELIANCE", ["ema20"], "D")).rejects.toThrow("Indicator service is temporarily unavailable.");
  });

  it("coalesces AI pattern requests and rejects outages", async () => {
    const fetchMock = vi.fn(async () => new Response("temporary outage", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    const { getAiPatterns } = await import("@/lib/api");
    const [first, second] = await Promise.allSettled([getAiPatterns(), getAiPatterns()]);

    expect(first.status).toBe("rejected");
    expect(second.status).toBe("rejected");
    if (first.status === "rejected") expect(first.reason.message).toContain("Trade pattern review is temporarily unavailable");
    if (second.status === "rejected") expect(second.reason.message).toContain("Trade pattern review is temporarily unavailable");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
