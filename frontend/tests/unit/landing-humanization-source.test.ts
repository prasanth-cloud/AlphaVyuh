import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const landingSource = readFileSync("app/page.tsx", "utf8");

describe("landing page humanization", () => {
  it("keeps the public hero calm and product-scoped", () => {
    expect(landingSource).toContain("<span className=\"lp-h1-s1\">AlphaVyuh</span>");
    expect(landingSource).toContain("A calmer trading workflow for Indian cash-equity traders");
    expect(landingSource).toContain("NSE/BSE cash equity");
    expect(landingSource).toContain("No trade calls");

    expect(landingSource).not.toContain("A focused workflow system for Indian equities");
    expect(landingSource).not.toContain("A simpler desk for Indian equities");
    expect(landingSource).not.toContain("lp-cursor");
    expect(landingSource).not.toContain("lp-ring");
    expect(landingSource).not.toContain("lp-orb");
    expect(landingSource).not.toContain("cursor:none");
  });

  it("does not ship fake social proof or out-of-scope markets", () => {
    expect(landingSource).toContain("Workflow examples");
    expect(landingSource).toContain("Larger NSE/BSE watchlists");

    expect(landingSource).not.toContain("★★★★★");
    expect(landingSource).not.toContain("Community");
    expect(landingSource).not.toContain("Reviews");
    expect(landingSource).not.toContain("US markets");
    expect(landingSource).not.toContain("NASDAQ");
    expect(landingSource).not.toContain("NYSE");
    expect(landingSource).not.toContain("expanded markets");
  });

  it("positions Journal before Scanner in the landing workflow", () => {
    expect(landingSource).toContain("[\"journal\",\"watchlist\",\"scanner\",\"charts\"]");
    expect(landingSource).toContain("Journal to review");
    expect(landingSource).toContain("Today, journal, watchlist, scanner");
  });
});
