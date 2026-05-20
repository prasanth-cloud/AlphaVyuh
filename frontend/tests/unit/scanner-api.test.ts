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
});
