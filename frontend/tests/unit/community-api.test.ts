import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("community API", () => {
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

  it("reads enveloped shared screens from the backend", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({
        screens: [{
          id: "shared-1",
          user_id: "user-1",
          screen_id: "screen-1",
          title: "VCP leaders",
          description: null,
          tags: ["VCP"],
          upvotes: 7,
          is_featured: false,
          created_at: "2026-05-20T09:15:00.000Z",
        }],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )));

    const { getSharedScreens } = await import("@/lib/api");

    await expect(getSharedScreens()).resolves.toMatchObject([{ id: "shared-1", title: "VCP leaders" }]);
  });

  it("accepts the legacy shared screen array payload", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify([{
        id: "shared-legacy",
        user_id: "user-1",
        screen_id: "screen-1",
        title: "Legacy payload",
        description: null,
        tags: [],
        upvotes: 2,
        is_featured: false,
        created_at: "2026-05-20T09:15:00.000Z",
      }]),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )));

    const { getSharedScreens } = await import("@/lib/api");

    await expect(getSharedScreens()).resolves.toMatchObject([{ id: "shared-legacy", title: "Legacy payload" }]);
  });

  it("keeps an empty shared screen list as a valid response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ screens: [] }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )));

    const { getSharedScreens } = await import("@/lib/api");

    await expect(getSharedScreens()).resolves.toEqual([]);
  });

  it("surfaces community screen service errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ detail: "Community screens are temporarily unavailable." }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    )));

    const { getSharedScreens } = await import("@/lib/api");

    await expect(getSharedScreens()).rejects.toThrow("Community screens are temporarily unavailable.");
  });

  it("rejects malformed shared screen payloads", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ screens: null }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )));

    const { getSharedScreens } = await import("@/lib/api");

    await expect(getSharedScreens()).rejects.toThrow("Community screens are temporarily unavailable.");
  });
});
