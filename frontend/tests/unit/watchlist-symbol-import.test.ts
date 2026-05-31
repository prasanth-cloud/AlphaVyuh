import { describe, expect, it } from "vitest";
import { parseWatchlistSymbolImport } from "@/lib/watchlist-symbol-import";

describe("watchlist symbol import", () => {
  it("cleans TradingView NSE watchlist payloads", () => {
    expect(parseWatchlistSymbolImport("NSE:RELIANCE\nNSE:INFY, tcs RELIANCE").symbols).toEqual([
      "RELIANCE",
      "INFY",
      "TCS",
    ]);
  });

  it("imports the symbol column from CSV exports", () => {
    expect(parseWatchlistSymbolImport(`symbol,company,exchange
RELIANCE,Reliance Industries,NSE
INFY,Infosys,NSE`).symbols).toEqual(["RELIANCE", "INFY"]);
  });

  it("supports Zerodha-style tradingsymbol headers", () => {
    expect(parseWatchlistSymbolImport(`tradingsymbol,isin,quantity
HDFCBANK,INE040A01034,10
TCS,INE467B01029,4`).symbols).toEqual(["HDFCBANK", "TCS"]);
  });

  it("reports duplicate and capped rows without returning hidden symbols", () => {
    expect(parseWatchlistSymbolImport("RELIANCE INFY RELIANCE TCS HDFCBANK", 3)).toEqual({
      symbols: ["RELIANCE", "INFY", "TCS"],
      duplicateCount: 1,
      ignoredCount: 0,
      truncatedCount: 1,
    });
  });
});
