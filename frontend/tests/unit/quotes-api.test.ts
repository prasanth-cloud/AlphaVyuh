import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const supabaseMock = vi.hoisted(() => ({
  createClient: vi.fn(() => ({
    auth: {
      getSession: vi.fn(async () => ({ data: { session: { access_token: "quote-test-token" } } })),
    },
  })),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: supabaseMock.createClient,
}));

const healthyQuote = {
  symbol: "RELIANCE",
  company_name: "Reliance Industries Ltd",
  series: "EQ",
  sector: "Energy",
  close: 1420,
  prev_close: 1400,
  open: 1405,
  high: 1430,
  low: 1398,
  pct_change: 1.43,
  gap_pct: null,
  volume: 2_000_000,
  avg_volume_20d: 1_800_000,
  volume_ratio: 1.11,
  turnover: null,
  rsi_14: 58,
  ema_20: 1380,
  ema_50: 1350,
  ema_200: 1300,
  ema_20_dist: null,
  ema_50_dist: null,
  week_52_high: 1500,
  week_52_low: 1100,
  week_52_high_pct: 5.6,
  week_52_low_pct: 29.1,
  atr_14: 24,
  atr_pct: null,
};

describe("quote API", () => {
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

  it("rejects successful unavailable quote payloads instead of caching a zero-price quote", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(
        JSON.stringify({
          symbol: "RELIANCE",
          close: 0,
          prev_close: 0,
          volume: 0,
          mode: "unavailable",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ))
      .mockResolvedValueOnce(new Response(JSON.stringify(healthyQuote), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const { getQuote } = await import("@/lib/api");

    await expect(getQuote("RELIANCE")).rejects.toThrow("Quote data is temporarily unavailable.");
    await expect(getQuote("RELIANCE")).resolves.toMatchObject({ symbol: "RELIANCE", close: 1420 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects successful unavailable live quote payloads", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({
        symbol: "RELIANCE",
        close: null,
        status: "unavailable",
        message: "Live quote provider is temporarily unavailable.",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )));

    const { getQuoteLive } = await import("@/lib/api");

    await expect(getQuoteLive("RELIANCE")).rejects.toThrow("Live quote provider is temporarily unavailable.");
  });
});
