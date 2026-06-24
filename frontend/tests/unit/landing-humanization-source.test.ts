import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const landingSource = readFileSync("app/page.tsx", "utf8");

describe("landing page humanization", () => {
  it("keeps the public hero calm and product-scoped", () => {
    expect(landingSource).toContain("A trader cockpit for scanning, planning, and reviewing Indian equities.");
    expect(landingSource).toContain("Start with market breadth, jump into high-quality EOD scanners");
    expect(landingSource).toContain("Terminal workflow · EOD market data");
    expect(landingSource).toContain("NSE/BSE cash equity");
    expect(landingSource).toContain("No trade calls");
    expect(landingSource).toContain("Order ticket drafts journal only");

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

  it("uses account-access CTAs without claiming open self-serve signup", () => {
    expect(landingSource).toContain("Request access");
    expect(landingSource).toContain("Get started");
    expect(landingSource).not.toContain("Request Pro access");
  });

  it("presents terminal workflow and execution boundaries honestly", () => {
    expect(landingSource).toContain("lp-terminal-strip");
    expect(landingSource).toContain("lp-cockpit-panel");
    expect(landingSource).toContain("lp-command-strip");
    expect(landingSource).toContain("lp-workstation-grid");
    expect(landingSource).toContain("lp-mini-chart");
    expect(landingSource).toContain("Desk queue");
    expect(landingSource).toContain("cache-first");
    expect(landingSource).toContain("journal draft");
    expect(landingSource).toContain("Scanner latency target");
    expect(landingSource).toContain("Order ticket creates a journal capture draft; live execution remains disabled");
    expect(landingSource).not.toContain("live execution enabled");
    expect(landingSource).not.toContain("place live orders");
  });

  it("renders the market tape from live quotes with an honest unavailable state", () => {
    expect(landingSource).toContain("/api/public/market-tape");
    expect(landingSource).toContain("const [tapeQuotes, setTapeQuotes]");
    expect(landingSource).toContain("const heroRows = tapeState === \"live\" ? topMovers(tapeQuotes, 5) : [];");
    expect(landingSource).toContain("scrollingTapeQuotes.map");
    expect(landingSource).toContain("temporarily unavailable");
    expect(landingSource).not.toContain("lp-tape-meta");
    expect(landingSource).not.toContain("Yahoo Finance (delayed)");
    expect(landingSource).not.toContain("innerHTML");
    expect(landingSource).not.toContain("appendChild");
    expect(landingSource).toContain(":root[data-theme=\"light\"] #lp-ticker");
    expect(landingSource).toContain("backdrop-filter");
    // No hardcoded tape/hero quote arrays — they must come from the API.
    expect(landingSource).not.toContain('sym: "NIFTY50"');
    expect(landingSource).not.toContain("const tickers");
    expect(landingSource).not.toContain("const scanData");
  });

  it("keeps first-viewport landing work lightweight before below-fold polish runs", () => {
    expect(landingSource).toContain("scheduleLandingEnhancements");
    expect(landingSource).toContain("requestIdleCallback");
    expect(landingSource).toContain("timeout: 900");
    expect(landingSource).toContain("window.addEventListener(\"scroll\", onScroll, { passive: true })");
    expect(landingSource).toContain("return scheduleLandingEnhancements(() => {");
    expect(landingSource).toContain("document.querySelectorAll(\".lp-fade,.lp-step,.lp-tcard,.lp-pcard,.lp-af-item,[data-target]\")");
    expect(landingSource).toContain("lp-terminal-surface");
    expect(landingSource).not.toContain("mousemove");
    expect(landingSource).not.toContain("lp-tilt");
    expect(landingSource).not.toContain("Activity feed pulse");
  });

  it("uses Geist typography and Tradezella-style nav shell on the landing page", () => {
    expect(landingSource).toContain("lp-nav-shell");
    expect(landingSource).toContain("var(--font-geist-sans)");
    expect(landingSource).toContain("var(--font-geist-mono)");
    expect(landingSource).toContain("--lp-type-display");
    expect(landingSource).not.toContain("lp-notif1");
    expect(landingSource).toContain("lp-logo-mark");
    expect(landingSource).not.toContain("lp-logo-img");
    expect(landingSource).not.toContain("/favicon.svg");
    expect(landingSource).not.toMatch(/font-weight:\s*(650|700|550|800|900)/);
    expect(landingSource).toContain("lp-cta-arrow");
  });

  it("positions Scanner before Journal in the landing workflow and uses Dashboard naming", () => {
    expect(landingSource).toContain("TRADER_WORKFLOW_STEPS");
    expect(landingSource).toContain("[\"scanner\",\"watchlist\",\"charts\",\"journal\"]");
    expect(landingSource).toContain("Dashboard, scanner, watchlist, journal");
    expect(landingSource).toContain("Daily workflow");
    expect(landingSource).not.toContain("Today, journal, watchlist, scanner");
  });
});
