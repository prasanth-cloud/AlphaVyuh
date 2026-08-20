import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const supabaseMock = vi.hoisted(() => ({
  createClient: vi.fn(() => ({
    auth: {
      getSession: vi.fn(async () => ({ data: { session: { access_token: "setup-test-token" } } })),
    },
  })),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: supabaseMock.createClient,
}));

describe("setups API", () => {
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

  it("creates a setup through the authenticated API and normalizes the symbol", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toMatchObject({ symbol: "INFY", direction: "long" });
      return new Response(JSON.stringify({
        id: "setup-1",
        user_id: "user-1",
        symbol: "INFY",
        status: "planned",
        direction: "long",
      }), { status: 201, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { createSetup } = await import("@/lib/api");
    const setup = await createSetup({ symbol: " infy ", direction: "long", source: "chart" });

    expect(setup.id).toBe("setup-1");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/setups"),
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer setup-test-token" }) }),
    );
  });

  it("rejects a malformed create response instead of treating it as durable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ status: "planned" }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    })));

    const { createSetup } = await import("@/lib/api");

    await expect(createSetup({ symbol: "TCS", direction: "short", source: "chart" }))
      .rejects.toThrow("Setup save returned an invalid response.");
  });
});
