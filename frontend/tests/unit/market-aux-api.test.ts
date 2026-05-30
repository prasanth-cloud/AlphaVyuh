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

  it("keeps an empty sector list as a valid response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ sectors: [] }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )));

    const { getSectors } = await import("@/lib/api");

    await expect(getSectors()).resolves.toEqual([]);
  });

  it("keeps sector metadata beside the backwards-compatible sector list", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({
        sectors: ["Energy", "Tiny Sector"],
        metadata: {
          source: "stock_universe.sector",
          contract_as_of: "2026-05-30",
          active_count: 3,
          active_count_scope: "active_universe",
          classified_count: 2,
          unmapped_count: 1,
          unmapped_symbols: ["UNMAPPED"],
          unmapped_symbols_truncated: false,
          sector_count: 2,
          sector_counts: [
            { sector: "Energy", active_count: 1, aliases: ["Oil and Gas"], hidden_by_filter: false },
            { sector: "Tiny Sector", active_count: 1, aliases: [], hidden_by_filter: false },
          ],
          alias_policy: {
            source: "NSE sectoral index aliases",
            description: "Sector-count aliases are derived only from NSE sectoral-index alias labels.",
          },
          display_filter: {
            minimum_active_symbols: 1,
            hidden_sector_count: 0,
            description: "All mapped sectors are shown.",
          },
          reference: {
            name: "NSE sectoral indices",
            url: "https://www.nseindia.com/static/products-services/indices-sectoral",
            as_of: "2026-03-02",
            relationship: "reference_only_not_equity_universe_source",
          },
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )));

    const { getSectors, getSectorsWithMetadata } = await import("@/lib/api");

    await expect(getSectors()).resolves.toEqual(["Energy", "Tiny Sector"]);
    await expect(getSectorsWithMetadata()).resolves.toMatchObject({
      sectors: ["Energy", "Tiny Sector"],
      metadata: {
        source: "stock_universe.sector",
        contract_as_of: "2026-05-30",
        unmapped_count: 1,
        alias_policy: {
          source: "NSE sectoral index aliases",
        },
      },
    });
  });

  it("rejects sector list service errors instead of returning empty sectors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ detail: "Sector list is temporarily unavailable." }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    )));

    const { getSectors } = await import("@/lib/api");

    await expect(getSectors()).rejects.toThrow("Sector list is temporarily unavailable.");
  });

  it("rejects malformed sector list payloads", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ sectors: null }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )));

    const { getSectors } = await import("@/lib/api");

    await expect(getSectors()).rejects.toThrow("Sector list is temporarily unavailable.");
  });
});
