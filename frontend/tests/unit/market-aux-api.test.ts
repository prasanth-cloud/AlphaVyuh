import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("market auxiliary API", () => {
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

  it("rejects unavailable market movers payloads instead of returning empty movers", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({
        trade_date: null,
        gainers: [],
        losers: [],
        volume_surge: [],
        mode: "unavailable",
        message: "Market movers are temporarily unavailable.",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )));

    const { getMarketMovers } = await import("@/lib/api");

    await expect(getMarketMovers()).rejects.toThrow("Market movers are temporarily unavailable.");
  });

  it("rejects legacy empty market movers payloads without an unavailable mode", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({
        trade_date: null,
        gainers: [],
        losers: [],
        volume_surge: [],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )));

    const { getMarketMovers } = await import("@/lib/api");

    await expect(getMarketMovers()).rejects.toThrow("Market movers are temporarily unavailable.");
  });

  it("rejects unavailable sector breadth payloads instead of returning empty sectors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({
        trade_date: null,
        sectors: [],
        status: "unavailable",
        message: "Sector breadth is temporarily unavailable.",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )));

    const { getSectorBreadth } = await import("@/lib/api");

    await expect(getSectorBreadth()).rejects.toThrow("Sector breadth is temporarily unavailable.");
  });

  it("rejects legacy empty sector breadth payloads without an unavailable status", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({
        sectors: [],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )));

    const { getSectorBreadth } = await import("@/lib/api");

    await expect(getSectorBreadth()).rejects.toThrow("Sector breadth is temporarily unavailable.");
  });

  it("surfaces service errors from dashboard market auxiliary endpoints", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ detail: "Market movers are temporarily unavailable." }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      ))
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ detail: "Sector breadth is temporarily unavailable." }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      ));
    vi.stubGlobal("fetch", fetchMock);

    const { getMarketMovers, getSectorBreadth } = await import("@/lib/api");

    await expect(getMarketMovers()).rejects.toThrow("Market movers are temporarily unavailable.");
    await expect(getSectorBreadth()).rejects.toThrow("Sector breadth is temporarily unavailable.");
  });
});
