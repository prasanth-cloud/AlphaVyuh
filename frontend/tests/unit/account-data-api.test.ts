import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const supabaseMock = vi.hoisted(() => ({
  createClient: vi.fn(() => ({
    auth: {
      getSession: vi.fn(async () => ({ data: { session: { access_token: "account-data-test-token" } } })),
    },
  })),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: supabaseMock.createClient,
}));

describe("account data API failures", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.example");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    vi.stubEnv("NEXT_PUBLIC_DATA_MODE", "live");
    vi.stubEnv("NEXT_PUBLIC_ALLOW_MOCK_FALLBACK", "true");
    vi.stubEnv("NEXT_PUBLIC_FORCE_LIVE_DATA", "true");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("surfaces journal entry failures instead of returning an empty journal", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ detail: "Journal service temporarily unavailable." }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    )));

    const { getJournalEntries } = await import("@/lib/api");

    await expect(getJournalEntries({ limit: 75 })).rejects.toThrow("Journal service temporarily unavailable.");
  });

  it("surfaces journal stats failures instead of returning zero stats", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ message: "Journal stats temporarily unavailable." }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    )));

    const { getJournalStats } = await import("@/lib/api");

    await expect(getJournalStats()).rejects.toThrow("Journal stats temporarily unavailable.");
  });

  it("surfaces journal analytics failures instead of returning empty analytics", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ detail: "Journal analytics are temporarily unavailable." }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    )));

    const { getJournalAnalytics } = await import("@/lib/api");

    await expect(getJournalAnalytics()).rejects.toThrow("Journal analytics are temporarily unavailable.");
  });

  it("surfaces AI pattern failures instead of returning insufficient-trade readiness", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ detail: "Trade pattern review is temporarily unavailable." }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    )));

    const { getAiPatterns } = await import("@/lib/api");

    await expect(getAiPatterns()).rejects.toThrow("Trade pattern review is temporarily unavailable.");
  });

  it("rejects legacy unavailable AI pattern payloads", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({
        ready: false,
        status: "unavailable",
        message: "Trade pattern review is temporarily unavailable.",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )));

    const { getAiPatterns } = await import("@/lib/api");

    await expect(getAiPatterns()).rejects.toThrow("Trade pattern review is temporarily unavailable.");
  });

  it("surfaces broker status failures instead of returning simulated disconnected state", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ detail: "Broker status temporarily unavailable." }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    )));

    const { getBrokerStatus } = await import("@/lib/api");

    await expect(getBrokerStatus()).rejects.toThrow("Broker status temporarily unavailable.");
  });

  it("rejects malformed broker position payloads instead of treating them as empty", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify([{ symbol: "SBIN", exchange: "NSE", quantity: 2 }]),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )));

    const { getBrokerPositions } = await import("@/lib/api");

    await expect(getBrokerPositions("upstox")).rejects.toThrow("Broker positions are temporarily unavailable.");
  });
});
