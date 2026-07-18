import { describe, expect, it } from "vitest";
import { buildMarketUniverseEvidence, MARKET_UNIVERSE_CONTRACT } from "@/lib/market-universe-contract";

describe("market universe contract", () => {
  it("names the NSE active-equity denominator used by coverage surfaces", () => {
    expect(MARKET_UNIVERSE_CONTRACT).toMatchObject({
      schema_version: 1,
      id: "nse_active_eq",
      market: "NSE",
      series: ["EQ"],
      active_only: true,
      session_basis: "latest_complete_eod_session",
    });
  });

  it("keeps observed and eligible counts alongside the derived percentage", () => {
    expect(buildMarketUniverseEvidence(1495, 1500)).toMatchObject({
      id: "nse_active_eq",
      symbols_count: 1495,
      universe_active: 1500,
      coverage_pct: 99.7,
    });
    expect(buildMarketUniverseEvidence(1495, null).coverage_pct).toBeNull();
  });
});
