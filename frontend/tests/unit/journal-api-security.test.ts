import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const supabaseMock = vi.hoisted(() => ({
  createClient: vi.fn(() => ({
    auth: {
      getSession: vi.fn(async () => ({ data: { session: { access_token: "journal-security-test-token" } } })),
    },
  })),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: supabaseMock.createClient,
}));

describe("journal mutation response security", () => {
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

  it("rejects a malformed successful process-review response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      id: "2fb8c28e-9f06-46f0-90a8-a17e290ec456",
      user_id: "6e067774-f55a-4520-bbb1-5fe318e42260",
      symbol: "TCS",
      company_name: null,
      trade_type: "long",
      setup_type: "breakout",
      entry_date: "2026-07-01",
      entry_price: 100,
      quantity: "1",
      exit_date: "2026-07-10",
      exit_price: 110,
      pnl: 10,
      pnl_pct: 10,
      holding_days: 9,
      stop_loss: 95,
      target_price: 110,
      risk_reward: 2,
      entry_reason: null,
      exit_reason: null,
      mistakes: null,
      lessons: null,
      status: "closed",
      review_schema_version: 1,
      planned_setup: "Breakout",
      setup_adherence: "followed",
      rule_breaks: [],
      review_lesson: "Wait for confirmation.",
      reviewed_at: "2026-07-11T10:00:00Z",
      created_at: "2026-07-01T10:00:00Z",
      updated_at: "2026-07-11T10:00:00Z",
    }), { status: 200, headers: { "Content-Type": "application/json" } })));

    const { saveJournalProcessReview } = await import("@/lib/api");
    await expect(saveJournalProcessReview("2fb8c28e-9f06-46f0-90a8-a17e290ec456", {
      schema_version: 1,
      planned_setup: "Breakout",
      adherence: "followed",
      rule_breaks: [],
      lesson: "Wait for confirmation.",
      expected_updated_at: "2026-07-10T10:00:00Z",
    })).rejects.toThrow("invalid response");
  });

  it("surfaces delete failures instead of reporting a successful deletion", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ detail: "Journal delete is temporarily unavailable." }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    )));

    const { deleteJournalEntry } = await import("@/lib/api");
    await expect(deleteJournalEntry("2fb8c28e-9f06-46f0-90a8-a17e290ec456"))
      .rejects.toThrow("Journal delete is temporarily unavailable.");
  });
});
