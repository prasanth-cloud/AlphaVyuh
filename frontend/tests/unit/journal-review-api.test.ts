import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const supabaseMock = vi.hoisted(() => ({
  createClient: vi.fn(() => ({
    auth: {
      getSession: vi.fn(async () => ({ data: { session: { access_token: "review-test-token" } } })),
    },
  })),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: supabaseMock.createClient,
}));

const review = {
  id: "review-1",
  user_id: "user-1",
  journal_entry_id: "journal-1",
  setup_id: "setup-1",
  status: "completed",
  plan_adherence: "partial",
  mistakes: "Entered early.",
  lesson: "Wait for confirmation.",
  follow_up: "Add a volume check.",
  source: "manual",
  reviewed_at: "2026-08-20T12:00:00Z",
  created_at: "2026-08-20T12:00:00Z",
  updated_at: "2026-08-20T12:00:00Z",
};

describe("journal review API", () => {
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

  it("loads durable reviews through the authenticated API", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ reviews: [review] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })));

    const { getJournalReviews } = await import("@/lib/api");
    await expect(getJournalReviews()).resolves.toEqual([review]);
  });

  it("rejects a malformed review list instead of marking trades reviewed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ reviews: [{ ...review, status: "unknown" }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })));

    const { getJournalReviews } = await import("@/lib/api");
    await expect(getJournalReviews()).rejects.toThrow("Trade review returned an invalid response.");
  });

  it("saves a review through the PUT boundary and validates the response", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe("PUT");
      expect(JSON.parse(String(init?.body))).toEqual({
        lesson: "Wait for confirmation.",
        plan_adherence: "partial",
        source: "manual",
      });
      return new Response(JSON.stringify(review), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { saveTradeReview } = await import("@/lib/api");
    await expect(saveTradeReview("journal-1", {
      lesson: "Wait for confirmation.",
      plan_adherence: "partial",
      source: "manual",
    })).resolves.toEqual(review);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/journal/journal-1/review"),
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer review-test-token" }) }),
    );
  });
});
