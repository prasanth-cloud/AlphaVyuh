import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("fundamentals API", () => {
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

  it("treats unavailable fundamentals payloads as unavailable instead of valuation data", async () => {
    const healthyPayload = {
      symbol: "RELIANCE",
      market: "NSE",
      currency: "INR",
      trailing_pe: 24.2,
      forward_pe: null,
      price_to_book: null,
      dividend_yield: null,
      trailing_eps: null,
      forward_eps: null,
      earnings_growth: null,
      revenue_growth: null,
      return_on_equity: null,
      debt_to_equity: null,
      market_cap: null,
      market_cap_str: "₹18L Cr",
      shares_outstanding: null,
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(
        JSON.stringify({
          symbol: "RELIANCE",
          trailing_pe: null,
          forward_pe: null,
          price_to_book: null,
          dividend_yield: null,
          trailing_eps: null,
          forward_eps: null,
          earnings_growth: null,
          revenue_growth: null,
          return_on_equity: null,
          debt_to_equity: null,
          market_cap: null,
          market_cap_str: null,
          shares_outstanding: null,
          data_status: "unavailable",
          message: "Fundamentals are temporarily unavailable; trading workflow can continue with chart and plan data.",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ))
      .mockResolvedValueOnce(new Response(JSON.stringify(healthyPayload), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const { getFundamentals } = await import("@/lib/api");

    await expect(getFundamentals("RELIANCE")).resolves.toBeNull();
    await expect(getFundamentals("RELIANCE")).resolves.toMatchObject({ symbol: "RELIANCE", trailing_pe: 24.2 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps stale fundamentals payloads available with status", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({
        symbol: "TCS",
        market: "NSE",
        currency: "INR",
        trailing_pe: 28.4,
        forward_pe: null,
        price_to_book: null,
        dividend_yield: null,
        trailing_eps: null,
        forward_eps: null,
        earnings_growth: null,
        revenue_growth: null,
        return_on_equity: null,
        debt_to_equity: null,
        market_cap: null,
        market_cap_str: "₹12L Cr",
        shares_outstanding: null,
        data_status: "stale",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )));

    const { getFundamentals } = await import("@/lib/api");

    await expect(getFundamentals("TCS")).resolves.toMatchObject({ symbol: "TCS", trailing_pe: 28.4, data_status: "stale" });
  });
});
