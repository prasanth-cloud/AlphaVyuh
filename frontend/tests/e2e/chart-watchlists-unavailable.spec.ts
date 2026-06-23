import { expect, test } from "@playwright/test";
import { qaCredentials } from "./helpers/qaCredentials";

const { email: EMAIL, password: PASSWORD } = qaCredentials();

async function login(page: import("@playwright/test").Page) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });
}

test.describe("Chart watchlist unavailable state", () => {
  test.skip(process.env.NEXT_PUBLIC_FORCE_LIVE_DATA !== "true", "Requires forced-live API mode to exercise watchlist outage handling.");

  test("keeps the chart usable and exposes retry when watchlists are unavailable", async ({ page }) => {
    let watchlistRequests = 0;

    await login(page);

    await page.route("**/api/v1/charts/AUBANK/candles**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          symbol: "AUBANK",
          company_name: "AU Small Finance Bank",
          sector: "Financial Services",
          timeframe: "D",
          candles: [
            { time: "2026-05-18", open: 670, high: 682, low: 665, close: 678, volume: 1200000 },
            { time: "2026-05-19", open: 678, high: 690, low: 676, close: 686, volume: 1400000 },
            { time: "2026-05-20", open: 686, high: 696, low: 680, close: 692, volume: 1600000 },
          ],
          latest: { close: 692, prev_close: 686, pct_change: 0.87, volume: 1600000 },
          mode: "eod",
          source_metadata: {
            source_name: "Exchange market data",
            mode: "eod",
            as_of: "2026-05-20",
          },
          coverage: {
            available_from: "2026-05-18",
            available_to: "2026-05-20",
            returned_candles: 3,
            partial: false,
          },
        }),
      })
    );
    await page.route("**/api/v1/charts/AUBANK/indicators**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ symbol: "AUBANK", indicators: {} }),
      })
    );
    await page.route("**/api/v1/watchlists**", (route) => {
      watchlistRequests += 1;
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Watchlist data is temporarily unavailable." }),
      });
    });

    await page.goto("/charts/AUBANK?from=watchlist&watchlistId=rotation&watchlist=Rotation%20queue");
    if (page.url().includes("/login")) return;

    await expect(page.getByTestId("chart-drawing-overlay")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("chart-source-watchlists-outage")).toContainText("Watchlist queue unavailable", { timeout: 15_000 });
    await expect(page.getByTestId("chart-source-watchlists-outage")).toContainText("Chart review, drawing, alerts, and order planning remain usable.");
    await expect(page.getByRole("button", { name: "Open chart drawing tools", exact: true })).toBeVisible();

    await page.getByRole("button", { name: /^Add to watchlist$/i }).click();
    await expect(page.getByTestId("chart-watchlists-outage")).toContainText("Watchlists unavailable", { timeout: 15_000 });
    await expect(page.getByTestId("chart-watchlists-outage")).toContainText("Open Watchlist or Data Status, then try again.");

    await page.getByTestId("chart-watchlists-outage").getByRole("button", { name: /^Retry$/ }).click();
    await expect.poll(() => watchlistRequests).toBeGreaterThan(2);
    await expect(page.getByTestId("chart-drawing-overlay")).toBeVisible();
  });
});
