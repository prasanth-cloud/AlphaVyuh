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

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("coalesces AI pattern requests and fails soft", async () => {
    const fetchMock = vi.fn(async () => new Response("temporary outage", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    const { getAiPatterns } = await import("@/lib/api");
    const [first, second] = await Promise.all([getAiPatterns(), getAiPatterns()]);

    expect(first).toEqual({ ready: false });
    expect(second).toEqual({ ready: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
