import { expect, test } from "@playwright/test";

const watchlistPayload = {
  watchlists: [
    {
      id: "watchlist-broker-status",
      name: "Broker status queue",
      sort_order: 0,
      created_at: "2026-05-20T09:00:00Z",
      items: [
        {
          symbol: "RELIANCE",
          company_name: "Reliance Industries",
          sector: "Energy",
          sort_order: 0,
          added_at: "2026-05-20T09:00:00Z",
          close: 1420.5,
          pct_change: 1.2,
          volume_ratio: 1.8,
          rsi_14: 62,
          pinned: false,
          tags: [],
          note: "",
        },
      ],
    },
  ],
};

function candlePayload(symbol: string) {
  return {
    symbol,
    company_name: symbol,
    sector: "Mock sector",
    timeframe: "D",
    candles: [
      { time: "2026-05-18", open: 100, high: 106, low: 98, close: 104, volume: 1000000, ema_20: 101, ema_50: 99 },
      { time: "2026-05-19", open: 104, high: 109, low: 103, close: 108, volume: 1200000, ema_20: 103, ema_50: 100 },
      { time: "2026-05-20", open: 108, high: 112, low: 106, close: 110, volume: 1400000, ema_20: 105, ema_50: 101 },
    ],
    latest: { close: 110, prev_close: 108, pct_change: 1.85, volume: 1400000 },
    mode: "eod",
    source_metadata: { source_name: "Exchange market data", mode: "eod", as_of: "2026-05-20" },
    coverage: { available_from: "2026-05-18", available_to: "2026-05-20", returned_candles: 3, partial: false },
  };
}

test.describe("Watchlist broker status failures", () => {
  test.skip(process.env.NEXT_PUBLIC_FORCE_LIVE_DATA !== "true", "Requires forced-live API mode to exercise failed broker status.");

  test("keeps quick order as a journal draft when broker status is unavailable", async ({ page }) => {
    let brokerStatusRequests = 0;

    await page.route("**/api/v1/watchlists**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(watchlistPayload) })
    );
    await page.route("**/api/v1/journal**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ entries: [], total: 0, plan: "pro", history_months: null }) })
    );
    await page.route("**/api/v1/workflow/states**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ states: [] }) })
    );
    await page.route("**/api/v1/charts/**/candles**", (route) => {
      const match = route.request().url().match(/\/charts\/([^/]+)\/candles/);
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(candlePayload(match?.[1] ?? "RELIANCE")),
      });
    });
    await page.route("**/api/v1/charts/**/workspace**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ symbol: "RELIANCE", timeframe: "D", indicators: [], drawings: [] }) })
    );
    await page.route("**/api/v1/broker/status**", (route) => {
      brokerStatusRequests += 1;
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Broker status is temporarily unavailable." }),
      });
    });

    await page.goto("/watchlist");
    if (page.url().includes("/login")) return;

    const chartHeader = page.locator(".watchlist-chart-header");
    await expect(page.getByText("Decision desk")).toBeVisible({ timeout: 20_000 });
    await expect(chartHeader).toContainText("RELIANCE", { timeout: 20_000 });

    await chartHeader.getByRole("button", { name: "Order" }).click();

    await expect(page.getByTestId("watchlist-order-broker-status")).toContainText("Broker status unavailable", { timeout: 15_000 });
    await expect(page.getByTestId("order-safety-nudges")).toContainText("Broker status unavailable");
    await expect(page.getByText("Order capture stays as a journal draft.")).toBeVisible();
    await expect(page.getByRole("button", { name: /via broker/i })).toHaveCount(0);
    expect(brokerStatusRequests).toBeGreaterThan(0);
  });
});
