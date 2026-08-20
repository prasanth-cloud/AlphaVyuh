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

  it("sends scanner candidate lineage when creating a setup", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toMatchObject({
        source_scanner_candidate_id: "candidate-1",
        scanner_context: { candidate_id: "candidate-1", scan_run_id: "run-1" },
      });
      return new Response(JSON.stringify({
        id: "setup-2",
        user_id: "user-1",
        symbol: "TCS",
        status: "planned",
        direction: "long",
        source_scanner_candidate_id: "candidate-1",
        scanner_context: { candidate_id: "candidate-1", scan_run_id: "run-1" },
      }), { status: 201, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { createSetup } = await import("@/lib/api");
    const setup = await createSetup({
      symbol: "TCS",
      direction: "long",
      source: "scanner",
      source_scanner_candidate_id: "candidate-1",
      scanner_context: { candidate_id: "candidate-1", scan_run_id: "run-1" },
    });

    expect(setup.source_scanner_candidate_id).toBe("candidate-1");
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

  it("rejects a malformed setup review response instead of unlocking order flow", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      setup_id: "setup-1",
      overall_status: "passed",
      can_proceed: true,
      summary: "All enabled setup rules pass.",
      results: [],
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })));

    const { getSetupReview } = await import("@/lib/api");

    await expect(getSetupReview("setup-1")).rejects.toThrow("Setup review returned an invalid response.");
  });

  it("rejects malformed rulebook rules at the API boundary", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      rulebooks: [{ id: "rulebook-1", name: "Starter", rules: [{ code: "minimum_rr" }] }],
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })));

    const { getRulebooks } = await import("@/lib/api");

    await expect(getRulebooks()).rejects.toThrow("Rulebook returned invalid rules.");
  });
});
