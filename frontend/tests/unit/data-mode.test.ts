import { describe, expect, it } from "vitest";

import { dataModePresentation } from "@/lib/data-mode";

describe("data mode presentation", () => {
  it("shows an explicit outage state when the API is down", () => {
    const presentation = dataModePresentation({
      forceLive: false,
      demo: false,
      apiReachable: "down",
    });

    expect(presentation.label).toBe("Data API down");
    expect(presentation.tone).toBe("loss");
    expect(presentation.title).toContain("Market data API is not reachable");
  });

  it("keeps normal EOD mode copy when the API has not failed", () => {
    expect(dataModePresentation({ forceLive: false, demo: false, apiReachable: "unknown" }).label).toBe("Latest session");
    expect(dataModePresentation({ forceLive: false, demo: true, apiReachable: "ok" }).label).toBe("Demo data");
  });

  it("shows EOD session copy when ingest is healthy even if the root probe failed", () => {
    const presentation = dataModePresentation({
      forceLive: false,
      demo: false,
      apiReachable: "down",
      eodStatus: "healthy",
      eodAsOf: "2026-06-09",
      liveQuotesUnavailable: true,
    });

    expect(presentation.label).toBe("EOD 2026-06-09");
    expect(presentation.tone).toBe("muted");
    expect(presentation.title).toContain("Live intraday quotes are unavailable");
  });
});
