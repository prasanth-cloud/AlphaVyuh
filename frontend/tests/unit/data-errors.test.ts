import { describe, expect, it } from "vitest";

import { describeMarketDataError } from "@/lib/data-errors";

describe("market data error copy", () => {
  it("turns transport/backend outage errors into trader-facing copy", () => {
    expect(describeMarketDataError(new Error("404 Application not found"))).toContain("Market data service is unavailable");
    expect(describeMarketDataError(new Error("Failed to fetch"))).toContain("Market data service is unavailable");
  });

  it("preserves specific validation messages", () => {
    expect(describeMarketDataError(new Error("RSI max must be greater than RSI min"))).toBe("RSI max must be greater than RSI min");
  });
});
