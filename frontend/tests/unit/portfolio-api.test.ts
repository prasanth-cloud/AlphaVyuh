import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("portfolio API", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("uses mock portfolio data in mock mode without hitting the backend", async () => {
    vi.stubEnv("NEXT_PUBLIC_DATA_MODE", "mock");
    vi.stubEnv("NEXT_PUBLIC_ALLOW_MOCK_FALLBACK", "true");
    vi.stubGlobal("fetch", vi.fn(() => {
      throw new Error("mock mode should not call backend");
    }));

    const { getPortfolio } = await import("@/lib/api");

    const portfolio = await getPortfolio();
    expect(portfolio.positions.length).toBeGreaterThan(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps an empty live portfolio as a valid empty state", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.alphavyuh.test");
    vi.stubEnv("NEXT_PUBLIC_FORCE_LIVE_DATA", "true");
    vi.stubEnv("NEXT_PUBLIC_DATA_MODE", "live");
    vi.stubEnv("NEXT_PUBLIC_ALLOW_MOCK_FALLBACK", "false");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({
        positions: [],
        summary: { total_invested: 0, total_current: 0, total_pnl: 0, total_pnl_pct: 0 },
        sectors: [],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )));

    const { getPortfolio } = await import("@/lib/api");

    await expect(getPortfolio()).resolves.toMatchObject({ positions: [], sectors: [] });
  });

  it("surfaces portfolio outages instead of returning a false-empty account view", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.alphavyuh.test");
    vi.stubEnv("NEXT_PUBLIC_FORCE_LIVE_DATA", "true");
    vi.stubEnv("NEXT_PUBLIC_DATA_MODE", "live");
    vi.stubEnv("NEXT_PUBLIC_ALLOW_MOCK_FALLBACK", "false");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ detail: "Portfolio is temporarily unavailable." }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    )));

    const { getPortfolio } = await import("@/lib/api");

    await expect(getPortfolio()).rejects.toThrow("Portfolio is temporarily unavailable.");
  });

  it("rejects unavailable portfolio payloads", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.alphavyuh.test");
    vi.stubEnv("NEXT_PUBLIC_FORCE_LIVE_DATA", "true");
    vi.stubEnv("NEXT_PUBLIC_DATA_MODE", "live");
    vi.stubEnv("NEXT_PUBLIC_ALLOW_MOCK_FALLBACK", "false");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ status: "unavailable", positions: [], message: "Portfolio is temporarily unavailable." }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )));

    const { getPortfolio } = await import("@/lib/api");

    await expect(getPortfolio()).rejects.toThrow("Portfolio is temporarily unavailable.");
  });
});
