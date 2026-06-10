import { describe, expect, it } from "vitest";

import { isRailwayFallbackResponse } from "@/lib/api-reachability";
import { marketDataHealthPresentation } from "@/lib/data-health-copy";

describe("market data health presentation", () => {
  it("shows an explicit production API outage state", () => {
    const presentation = marketDataHealthPresentation(null, "down");

    expect(presentation.value).toBe("DATA API DOWN");
    expect(presentation.status).toBe("bad");
    expect(presentation.detail).toContain("Market data API is unreachable");
  });

  it("keeps healthy EOD health copy when the API is reachable", () => {
    const presentation = marketDataHealthPresentation(
      { status: "healthy", latest_trade_date: "2026-05-18" },
      "ok",
    );

    expect(presentation.value).toBe("HEALTHY");
    expect(presentation.status).toBe("good");
    expect(presentation.detail).toContain("2026-05-18");
  });

  it("prefers healthy EOD ingest over a failed root health probe", () => {
    const presentation = marketDataHealthPresentation(
      { status: "healthy", latest_trade_date: "2026-06-09" },
      "down",
    );

    expect(presentation.value).toBe("HEALTHY");
    expect(presentation.status).toBe("good");
    expect(presentation.detail).toContain("2026-06-09");
    expect(presentation.detail).toContain("Live quote probe failed");
  });

  it("recognizes Railway fallback health responses as an API outage", () => {
    expect(isRailwayFallbackResponse(404, '{"message":"Application not found"}')).toBe(true);
    expect(isRailwayFallbackResponse(503, '{"message":"temporarily unavailable"}')).toBe(false);
  });
});
