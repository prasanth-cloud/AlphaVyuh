import { describe, expect, it } from "vitest";

import { buildLaunchAgenda } from "@/lib/launch-agenda";
import type { SectorTaxonomyPresentation } from "@/lib/sector-taxonomy-copy";

const sectorTaxonomy: SectorTaxonomyPresentation = {
  value: "33 SECTORS",
  detail: "Source stock_universe.sector, contract 2026-05-30; industry taxonomy unaudited.",
  status: "warn",
  source: "stock_universe.sector",
  contract: "2026-05-30",
  reference: "NSE sectoral indices as of 2026-03-02",
  unmapped: "531",
  displayFilter: "All mapped sectors are shown.",
  referenceCoverage: "22 without NSE sectoral-index reference",
  auditStatus: "Unverified",
  aliasPolicy: "NSE alias policy.",
  industryScope: "NSE industry taxonomy is not audited.",
  dashboardBadge: "Taxonomy needs audit",
};

function agenda(overrides: Partial<Parameters<typeof buildLaunchAgenda>[0]> = {}) {
  return buildLaunchAgenda({
    apiReachable: "ok",
    marketStatus: "good",
    marketDetail: "Latest complete trade date 2026-05-29.",
    sectorTaxonomy,
    brokerGate: {
      value: "ORDERS DISABLED",
      detail: "Broker import can be read-only; buy/sell remains order intent and journal capture.",
      status: "warn",
    },
    closedTrades: 5,
    reviewedTrades: 4,
    accountIssueCount: 0,
    ...overrides,
  });
}

describe("buildLaunchAgenda", () => {
  it("locks the first-release scope to EOD cash equities and explicit owner gates", () => {
    const items = agenda();

    expect(items.map((item) => item.id)).toEqual([
      "launch-scope",
      "data-trust",
      "sector-source",
      "broker-boundary",
      "decision-memory",
      "owner-gates",
    ]);
    expect(items[0]).toMatchObject({
      value: "CASH EQUITY EOD",
      status: "good",
    });
    expect(items[0].detail).toContain("No F&O");
    expect(items.at(-1)?.detail).toContain("TradingView licensing");
  });

  it("fails data trust closed when the production API is down", () => {
    const dataTrust = agenda({ apiReachable: "down", marketStatus: "good" }).find((item) => item.id === "data-trust");

    expect(dataTrust).toMatchObject({
      value: "BLOCKED",
      status: "bad",
    });
    expect(dataTrust?.detail).toContain("Market data API is unreachable");
  });

  it("warns until sector taxonomy and journal review coverage are launch ready", () => {
    const items = agenda({ closedTrades: 5, reviewedTrades: 2 });

    expect(items.find((item) => item.id === "sector-source")).toMatchObject({
      value: "UNVERIFIED",
      status: "warn",
    });
    expect(items.find((item) => item.id === "decision-memory")).toMatchObject({
      value: "40% REVIEWED",
      status: "warn",
    });
  });

  it("marks decision memory ready when closed trades have enough saved lessons", () => {
    expect(agenda().find((item) => item.id === "decision-memory")).toMatchObject({
      value: "80% REVIEWED",
      status: "good",
    });
  });
});
