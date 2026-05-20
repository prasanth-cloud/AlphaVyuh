import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("symbol search API", () => {
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

  it("surfaces symbol search service errors instead of returning no matches", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ detail: "Symbol search is temporarily unavailable." }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    )));

    const { searchSymbols } = await import("@/lib/api");

    await expect(searchSymbols("REL")).rejects.toThrow("Symbol search is temporarily unavailable.");
  });

  it("rejects legacy unavailable symbol search payloads", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ results: [], mode: "unavailable", message: "Symbol search is temporarily unavailable." }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )));

    const { searchSymbols } = await import("@/lib/api");

    await expect(searchSymbols("REL")).rejects.toThrow("Symbol search is temporarily unavailable.");
  });

  it("keeps a reachable empty search as a valid no-match state", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ results: [] }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )));

    const { searchSymbols } = await import("@/lib/api");

    await expect(searchSymbols("ZZZ")).resolves.toEqual([]);
  });
});
