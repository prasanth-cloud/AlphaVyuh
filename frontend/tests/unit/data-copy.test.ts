import { describe, expect, it } from "vitest";
import { formatMarketDataMode, formatMarketDataSource } from "@/lib/data-copy";

describe("market data display copy", () => {
  it("hides ingestion/provider jargon in trader-facing source labels", () => {
    expect(formatMarketDataSource("NSE bhavcopy")).toBe("Market data");
    expect(formatMarketDataSource("AlphaVyuh mock fixtures")).toBe("Demo data");
    expect(formatMarketDataSource("Yahoo Finance")).toBe("Provider market data");
    expect(formatMarketDataSource(null, "Market data")).toBe("Market data");
  });

  it("formats data modes without backend jargon", () => {
    expect(formatMarketDataMode("eod")).toBe("market");
    expect(formatMarketDataMode("fallback")).toBe("check data");
    expect(formatMarketDataMode("live")).toBe("updating");
    expect(formatMarketDataMode("demo")).toBe("demo");
  });
});
