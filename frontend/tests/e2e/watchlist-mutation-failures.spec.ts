import { expect, test } from "@playwright/test";

const watchlistPayload = {
  watchlists: [
    {
      id: "watchlist-rotation",
      name: "Rotation queue",
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
        {
          symbol: "ITC",
          company_name: "ITC",
          sector: "FMCG",
          sort_order: 1,
          added_at: "2026-05-20T09:00:00Z",
          close: 438.1,
          pct_change: -0.3,
          volume_ratio: 0.9,
          rsi_14: 48,
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

test.describe("Watchlist mutation failures", () => {
  test.skip(process.env.NEXT_PUBLIC_FORCE_LIVE_DATA !== "true", "Requires forced-live API mode to exercise failed watchlist writes.");

  test("keeps a symbol visible when backend removal fails", async ({ page }) => {
    let removeRequests = 0;

    await page.route("**/api/v1/watchlists**", (route) => {
      const request = route.request();
      if (request.method() === "DELETE" && request.url().includes("/items/RELIANCE")) {
        removeRequests += 1;
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ detail: "Watchlist item removal is temporarily unavailable." }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(watchlistPayload),
      });
    });
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

    await page.goto("/watchlist");
    if (page.url().includes("/login")) return;

    await expect(page.locator("tr[data-symbol='RELIANCE']")).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("watchlist-remove-RELIANCE").click({ force: true });

    await expect(page.getByLabel("Notifications alt+T")).toContainText("RELIANCE could not be removed. Check Watchlist or Data Status, then try again.");
    await expect(page.locator("tr[data-symbol='RELIANCE']")).toBeVisible();
    expect(removeRequests).toBe(1);
  });

  test("does not show starter symbols as added when backend add fails", async ({ page }) => {
    const emptyPayload = {
      watchlists: [
        {
          id: "watchlist-empty",
          name: "Fresh queue",
          sort_order: 0,
          created_at: "2026-05-20T09:00:00Z",
          items: [],
        },
      ],
    };
    let addRequests = 0;

    await page.route("**/api/v1/watchlists**", (route) => {
      const request = route.request();
      if (request.method() === "POST" && request.url().includes("/items")) {
        addRequests += 1;
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ detail: "Watchlist add is temporarily unavailable." }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(emptyPayload),
      });
    });
    await page.route("**/api/v1/journal**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ entries: [], total: 0, plan: "pro", history_months: null }) })
    );
    await page.route("**/api/v1/workflow/states**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ states: [] }) })
    );

    await page.goto("/watchlist");
    if (page.url().includes("/login")) return;

    await expect(page.getByText("No stocks yet")).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Add starter queue" }).click();

    await expect(page.getByLabel("Notifications alt+T")).toContainText("Starter queue could not be completed. Check Watchlist or Data Status, then try again.", { timeout: 15_000 });
    await expect(page.locator("tr[data-symbol='RELIANCE']")).toHaveCount(0);
    expect(addRequests).toBeGreaterThan(0);
  });

  test("surfaces scanner handoff auto-add failures without adding the symbol", async ({ page }) => {
    let addRequests = 0;

    await page.route("**/api/v1/watchlists**", (route) => {
      const request = route.request();
      if (request.method() === "POST" && request.url().includes("/items")) {
        addRequests += 1;
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ detail: "Watchlist add is temporarily unavailable." }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(watchlistPayload),
      });
    });
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
        body: JSON.stringify(candlePayload(match?.[1] ?? "AUBANK")),
      });
    });
    await page.route("**/api/v1/charts/**/workspace**", (route) => {
      const match = route.request().url().match(/\/charts\/([^/]+)\/workspace/);
      const symbol = match?.[1] ?? "AUBANK";
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ symbol, timeframe: "D", indicators: [], drawings: [] }),
      });
    });

    await page.goto("/watchlist?symbol=AUBANK");
    if (page.url().includes("/login")) return;

    await expect(page.locator(".watchlist-chart-header")).toContainText("AUBANK", { timeout: 20_000 });
    await expect(page.getByLabel("Notifications alt+T")).toContainText("AUBANK could not be added to the active watchlist.", { timeout: 15_000 });
    await expect(page.getByLabel("Notifications alt+T")).toContainText("Check Watchlist or Data Status, then try again.");
    await expect(page.locator("tr[data-symbol='AUBANK']")).toHaveCount(0);
    expect(addRequests).toBe(1);
  });

  test("surfaces unavailable journal review context without blocking the watchlist", async ({ page }) => {
    await page.route("**/api/v1/watchlists**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(watchlistPayload),
      })
    );
    await page.route("**/api/v1/journal**", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Journal entries are temporarily unavailable." }),
      })
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

    await page.goto("/watchlist");
    if (page.url().includes("/login")) return;

    await expect(page.getByTestId("watchlist-workflow-strip")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("tr[data-symbol='RELIANCE']")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("watchlist-journal-status")).toContainText("Journal review context is unavailable", { timeout: 15_000 });
    await expect(page.getByTestId("watchlist-journal-status")).toContainText("Watchlist queue, chart review, and planning remain usable.");

    await page.getByRole("button", { name: "Details" }).click();
    await expect(page.getByText("Review context unavailable")).toBeVisible();
    await expect(page.getByText("Review badges are paused until Journal recovers.")).toBeVisible();
  });
});
