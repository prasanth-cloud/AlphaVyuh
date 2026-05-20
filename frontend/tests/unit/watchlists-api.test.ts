import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const supabaseMock = vi.hoisted(() => ({
  createClient: vi.fn(() => ({
    auth: {
      getSession: vi.fn(async () => ({ data: { session: { access_token: "watchlist-test-token" } } })),
    },
  })),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: supabaseMock.createClient,
}));

describe("watchlist API", () => {
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

  it("surfaces unavailable watchlist responses instead of returning an empty list", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ mode: "unavailable", message: "Watchlist shell is temporarily unavailable." }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    )));

    const { getWatchlists } = await import("@/lib/api");

    await expect(getWatchlists({ force: true })).rejects.toThrow("Watchlist shell is temporarily unavailable.");
  });

  it("does not leak mock watchlists from production when stale mock flags are present", async () => {
    vi.stubEnv("NEXT_PUBLIC_ALLOW_MOCK_FALLBACK", "true");
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("network down");
    }));

    const { getWatchlists } = await import("@/lib/api");

    await expect(getWatchlists({ force: true })).rejects.toThrow("network down");
  });
});
