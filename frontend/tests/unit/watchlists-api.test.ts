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
      { status: 200, headers: { "Content-Type": "application/json" } },
    )));

    const { getWatchlists } = await import("@/lib/api");

    await expect(getWatchlists({ force: true })).rejects.toThrow("Watchlist shell is temporarily unavailable.");
  });

  it("surfaces watchlist service errors from the backend", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ detail: "Watchlist shell is temporarily unavailable." }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    )));

    const { getWatchlists } = await import("@/lib/api");

    await expect(getWatchlists({ force: true })).rejects.toThrow("Watchlist shell is temporarily unavailable.");
  });

  it("surfaces watchlist delete failures instead of treating the queue as deleted", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ detail: "Watchlist delete is temporarily unavailable." }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    )));

    const { deleteWatchlist } = await import("@/lib/api");

    await expect(deleteWatchlist("watchlist-1")).rejects.toThrow("Watchlist delete is temporarily unavailable.");
  });

  it("surfaces item removal failures instead of treating the symbol as removed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ detail: "Watchlist item removal is temporarily unavailable." }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    )));

    const { removeFromWatchlist } = await import("@/lib/api");

    await expect(removeFromWatchlist("watchlist-1", "RELIANCE")).rejects.toThrow("Watchlist item removal is temporarily unavailable.");
  });

  it("surfaces reorder failures instead of treating the saved order as updated", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ detail: "Watchlist reorder is temporarily unavailable." }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    )));

    const { reorderWatchlist } = await import("@/lib/api");

    await expect(reorderWatchlist("watchlist-1", [
      { symbol: "RELIANCE", sort_order: 0 },
      { symbol: "ITC", sort_order: 1 },
    ])).rejects.toThrow("Watchlist reorder is temporarily unavailable.");
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
