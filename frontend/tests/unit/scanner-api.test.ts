import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const supabaseMock = vi.hoisted(() => ({
  createClient: vi.fn(() => ({
    auth: {
      getSession: vi.fn(async () => ({ data: { session: { access_token: "scanner-test-token" } } })),
    },
  })),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: supabaseMock.createClient,
}));

describe("scanner API", () => {
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

  it("surfaces unavailable scanner payloads instead of returning zero matches", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({
        mode: "unavailable",
        message: "Scanner query could not complete; try a narrower preset.",
        total_matches: 0,
        results: [],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )));

    const { runScanner } = await import("@/lib/api");

    await expect(runScanner({ series: ["EQ"] })).rejects.toThrow("Scanner query could not complete");
  });

  it("surfaces scanner service errors from the backend", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ detail: "Scanner data is temporarily unavailable." }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    )));

    const { runScanner } = await import("@/lib/api");

    await expect(runScanner({ series: ["EQ"] })).rejects.toThrow("Scanner data is temporarily unavailable.");
  });

  it("keeps an empty saved scanner screen list as a valid response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ screens: [] }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )));

    const { getScreens } = await import("@/lib/api");

    await expect(getScreens()).resolves.toEqual([]);
  });

  it("surfaces saved scanner screen service errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ detail: "Saved scanner screens are temporarily unavailable." }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    )));

    const { getScreens } = await import("@/lib/api");

    await expect(getScreens()).rejects.toThrow("Saved scanner screens are temporarily unavailable.");
  });

  it("surfaces saved scanner screen save failures", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ detail: "Saved scanner screen could not be saved." }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    )));

    const { saveScreen } = await import("@/lib/api");

    await expect(saveScreen("Breakout", { filters: { price_min: 100 } })).rejects.toThrow("Saved scanner screen could not be saved.");
  });

  it("surfaces saved scanner screen delete failures", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ detail: "Saved scanner screen could not be deleted." }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    )));

    const { deleteScreen } = await import("@/lib/api");

    await expect(deleteScreen("screen-1")).rejects.toThrow("Saved scanner screen could not be deleted.");
  });

  it("rejects malformed saved scanner screen payloads", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ screens: null }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )));

    const { getScreens } = await import("@/lib/api");

    await expect(getScreens()).rejects.toThrow("Saved scanner screens are temporarily unavailable.");
  });
});
