import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const supabaseMock = vi.hoisted(() => ({
  createClient: vi.fn(() => ({
    auth: {
      getSession: vi.fn(async () => ({ data: { session: { access_token: "market-overview-test-token" } } })),
    },
  })),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: supabaseMock.createClient,
}));

const healthyOverview = {
  trade_date: "2026-05-19",
  advances: 1100,
  declines: 900,
  unchanged: 100,
  total: 2100,
  advance_decline_ratio: 1.22,
  new_52w_highs: 48,
  new_52w_lows: 12,
  above_ema20_pct: 58,
  above_ema50_pct: 54,
  above_ema200_pct: 62,
  market_phase: "Bullish",
  market_phase_desc: "Broad participation across the latest session.",
  sector_breadth: [],
  top_gainers: [],
  top_losers: [],
  most_active: [],
  source_metadata: {
    source_name: "NSE bhavcopy",
    mode: "eod",
    as_of: "2026-05-19",
  },
};

describe("market overview API", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.example");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    vi.stubEnv("NEXT_PUBLIC_DATA_MODE", "live");
    vi.stubEnv("NEXT_PUBLIC_ALLOW_MOCK_FALLBACK", "false");
    vi.stubEnv("NEXT_PUBLIC_FORCE_LIVE_DATA", "true");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("rejects unavailable overview payloads instead of caching a zero-market snapshot", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(
        JSON.stringify({
          ...healthyOverview,
          trade_date: null,
          advances: 0,
          declines: 0,
          total: 0,
          market_phase: "Pending",
          mode: "unavailable",
          message: "Market summary is temporarily unavailable; dashboard will use the latest known shell data.",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ))
      .mockResolvedValueOnce(new Response(
        JSON.stringify(healthyOverview),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ));
    vi.stubGlobal("fetch", fetchMock);

    const { getMarketOverview } = await import("@/lib/api");

    await expect(getMarketOverview()).rejects.toThrow("Market summary is temporarily unavailable");
    await expect(getMarketOverview()).resolves.toMatchObject({ trade_date: "2026-05-19", total: 2100 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects unavailable legacy market summary payloads during overview fallback", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/v1/market/overview")) {
        return new Response(JSON.stringify({ detail: "overview not deployed" }), { status: 503 });
      }
      if (url.endsWith("/api/v1/market/summary")) {
        return new Response(
          JSON.stringify({
            trade_date: null,
            advances: 0,
            declines: 0,
            unchanged: 0,
            total_stocks: 0,
            mode: "unavailable",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.endsWith("/api/v1/market/sector-breadth")) {
        return new Response(JSON.stringify({ trade_date: null, sectors: [] }), { status: 200 });
      }
      if (url.endsWith("/api/v1/market/movers")) {
        return new Response(JSON.stringify({ trade_date: null, gainers: [], losers: [], volume_surge: [] }), { status: 200 });
      }
      return new Response("unexpected URL", { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { getMarketOverview } = await import("@/lib/api");

    await expect(getMarketOverview()).rejects.toThrow("Market summary is temporarily unavailable.");
  });
});
