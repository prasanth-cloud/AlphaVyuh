import { describe, expect, it } from "vitest";
import {
  TAPE_SYMBOLS,
  dedupeQuotes,
  formatTapeChange,
  formatTapePrice,
  mockMarketTapePayload,
  parseYahooChartMeta,
  topMovers,
  type TapeQuote,
} from "@/lib/public-market-tape";

const quote = (label: string, changePct: number, isIndex = false): TapeQuote => ({
  symbol: `${label}.NS`,
  label,
  price: 100,
  changePct,
  isIndex,
});

describe("public market tape", () => {
  it("has no duplicate symbols in the configured tape universe", () => {
    const labels = TAPE_SYMBOLS.map((s) => s.label);
    expect(new Set(labels).size).toBe(labels.length);
    const yahooSymbols = TAPE_SYMBOLS.map((s) => s.yahoo);
    expect(new Set(yahooSymbols).size).toBe(yahooSymbols.length);
  });

  it("parses a valid Yahoo chart payload into a quote", () => {
    const parsed = parseYahooChartMeta(
      { chart: { result: [{ meta: { regularMarketPrice: 110, chartPreviousClose: 100 } }] } },
      { yahoo: "RELIANCE.NS", label: "RELIANCE", isIndex: false },
    );
    expect(parsed).not.toBeNull();
    expect(parsed?.label).toBe("RELIANCE");
    expect(parsed?.price).toBe(110);
    expect(parsed?.changePct).toBeCloseTo(10);
  });

  it("rejects malformed or non-positive Yahoo payloads", () => {
    const symbol = { yahoo: "X.NS", label: "X", isIndex: false };
    expect(parseYahooChartMeta(null, symbol)).toBeNull();
    expect(parseYahooChartMeta({}, symbol)).toBeNull();
    expect(parseYahooChartMeta({ chart: { result: [] } }, symbol)).toBeNull();
    expect(
      parseYahooChartMeta({ chart: { result: [{ meta: { regularMarketPrice: 0, chartPreviousClose: 100 } }] } }, symbol),
    ).toBeNull();
    expect(
      parseYahooChartMeta({ chart: { result: [{ meta: { regularMarketPrice: 100 } }] } }, symbol),
    ).toBeNull();
  });

  it("dedupes quotes by label keeping first occurrence", () => {
    const deduped = dedupeQuotes([quote("TCS", 1), quote("INFY", 2), quote("TCS", 3)]);
    expect(deduped.map((q) => q.label)).toEqual(["TCS", "INFY"]);
    expect(deduped[0].changePct).toBe(1);
  });

  it("returns unique stock-only top movers sorted by absolute change", () => {
    const movers = topMovers([
      quote("NIFTY 50", 9, true),
      quote("TCS", 1),
      quote("INFY", -4),
      quote("SBIN", 2),
      quote("TCS", 5),
    ]);
    expect(movers.map((q) => q.label)).toEqual(["INFY", "SBIN", "TCS"]);
    expect(movers.every((q) => !q.isIndex)).toBe(true);
  });

  it("formats prices and change percentages for the tape", () => {
    expect(formatTapePrice(22147.4)).toBe("22,147");
    expect(formatTapePrice(786.45)).toBe("786.45");
    expect(formatTapeChange(1.234)).toBe("+1.23%");
    expect(formatTapeChange(-0.5)).toBe("-0.50%");
  });

  it("provides a deterministic mock payload for hermetic browser QA", () => {
    const payload = mockMarketTapePayload(new Date("2026-06-13T10:00:00.000Z"));
    expect(payload.source).toBe("mock");
    expect(payload.asOf).toBe("2026-06-13T10:00:00.000Z");
    expect(payload.quotes.length).toBeGreaterThanOrEqual(5);
    expect(topMovers(payload.quotes, 2)).toHaveLength(2);
  });
});
