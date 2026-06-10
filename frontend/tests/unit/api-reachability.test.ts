import { afterEach, describe, expect, it, vi } from "vitest";

import { checkApiReachability, isRailwayFallbackResponse } from "@/lib/api-reachability";

describe("api reachability", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("recognizes Railway fallback health responses as an API outage", () => {
    expect(isRailwayFallbackResponse(404, '{"message":"Application not found"}')).toBe(true);
    expect(isRailwayFallbackResponse(503, '{"message":"temporarily unavailable"}')).toBe(false);
  });

  it("treats authenticated data-health responses as reachable when /health fails", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/health")) {
        return new Response("not found", { status: 404, statusText: "Not Found" });
      }
      if (url.endsWith("/api/v1/data/health")) {
        return new Response(JSON.stringify({ detail: "Not authenticated" }), { status: 401 });
      }
      throw new Error(`unexpected url ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(checkApiReachability()).resolves.toBe("ok");
  });
});
