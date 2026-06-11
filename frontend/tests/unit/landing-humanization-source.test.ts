import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const landingSource = readFileSync("app/page.tsx", "utf8");

describe("landing page humanization", () => {
  it("keeps the public hero calm and product-scoped", () => {
    expect(landingSource).toContain("A trading workflow journal for Indian swing traders.");
    expect(landingSource).toContain("Scan after market close, keep the reason, plan levels, and review what your closed trades taught you.");
    expect(landingSource).toContain("NSE/BSE cash equity");
    expect(landingSource).toContain("No trade calls");

    expect(landingSource).not.toContain("A focused workflow system for Indian equities");
    expect(landingSource).not.toContain("A simpler desk for Indian equities");
    expect(landingSource).not.toContain("lp-cursor");
    expect(landingSource).not.toContain("lp-ring");
    expect(landingSource).not.toContain("lp-orb");
    expect(landingSource).not.toContain("cursor:none");
    expect(landingSource).not.toContain("Scanner filters");
    expect(landingSource).not.toContain("Recommended</div>");
  });

  it("does not ship fake social proof or out-of-scope markets", () => {
    expect(landingSource).toContain("Workflow examples");
    expect(landingSource).toContain("10 watchlists · 200 stocks");
    expect(landingSource).toContain("599");

    expect(landingSource).not.toContain("★★★★★");
    expect(landingSource).not.toContain("Community");
    expect(landingSource).not.toContain("Reviews");
    expect(landingSource).not.toContain("US markets");
    expect(landingSource).not.toContain("NASDAQ");
    expect(landingSource).not.toContain("NYSE");
    expect(landingSource).not.toContain("expanded markets");
    expect(landingSource).not.toContain("Larger NSE/BSE watchlists");
  });

  it("uses Get started CTAs and keeps Request access off the landing page", () => {
    expect(landingSource).toContain("Get started");
    expect(landingSource).not.toContain("Request access");
    expect(landingSource).not.toContain("Request Pro access");
  });

  it("renders the market tape from live quotes with an honest unavailable state", () => {
    expect(landingSource).toContain("/api/public/market-tape");
    expect(landingSource).toContain("temporarily unavailable");
    expect(landingSource).toContain("Yahoo Finance (delayed)");
    expect(landingSource).toContain(":root[data-theme=\"light\"] #lp-ticker");
    expect(landingSource).toContain("backdrop-filter");
    // No hardcoded tape/hero quote arrays — they must come from the API.
    expect(landingSource).not.toContain('sym: "NIFTY50"');
    expect(landingSource).not.toContain("const tickers");
    expect(landingSource).not.toContain("const scanData");
  });

  it("positions Scanner before Journal in the landing workflow and uses Dashboard naming", () => {
    expect(landingSource).toContain("TRADER_WORKFLOW_STEPS");
    expect(landingSource).toContain("[\"scanner\",\"watchlist\",\"charts\",\"journal\"]");
    expect(landingSource).toContain("Dashboard, scanner, watchlist, journal");
    expect(landingSource).toContain("See workflow");
    expect(landingSource).not.toContain("Today, journal, watchlist, scanner");
  });
});
