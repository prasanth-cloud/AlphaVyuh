import { expect, test } from "@playwright/test";

test.describe("Chart unavailable payloads", () => {
  test("does not render a successful unavailable candle payload as an empty chart", async ({ page }) => {
    await page.route("**/api/v1/charts/RELIANCE/candles**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          symbol: "RELIANCE",
          timeframe: "D",
          candles: [],
          latest: null,
          mode: "unavailable",
          source_metadata: {
            source_name: "Unavailable",
            mode: "fallback",
            as_of: null,
          },
          coverage: {
            returned_candles: 0,
            partial: true,
            partial_reason: "no_candles",
          },
        }),
      })
    );

    await page.goto("/charts/RELIANCE?full=1");
    if (page.url().includes("/login")) return;

    await expect(page.getByText("Chart candle data is temporarily unavailable.")).toBeVisible({ timeout: 15_000 });
  });

  test("keeps candles visible when indicator data is unavailable", async ({ page }) => {
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
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Chart indicators are temporarily unavailable." }),
      })
    );

    await page.goto("/charts/AUBANK?full=1");
    if (page.url().includes("/login")) return;

    await expect(page.getByTestId("chart-drawing-overlay")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("chart-indicators-unavailable")).toContainText("Chart indicators are temporarily unavailable", { timeout: 15_000 });
    await expect(page.getByTestId("chart-indicators-unavailable")).toContainText("Candles, drawings, alerts, and order planning remain usable.");
    await expect(page.getByRole("button", { name: "Open chart drawing tools", exact: true })).toBeVisible();
  });

  test("surfaces compare symbol outages without hiding the base chart", async ({ page }) => {
    let compareRequests = 0;

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
    await page.route("**/api/v1/charts/RELIANCE/candles**", (route) => {
      compareRequests += 1;
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Compare data is temporarily unavailable." }),
      });
    });

    await page.goto("/charts/AUBANK?full=1");
    if (page.url().includes("/login")) return;

    await expect(page.getByTestId("chart-drawing-overlay")).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Compare", exact: true }).click();
    const compareInput = page.getByRole("textbox", { name: "Symbol…", exact: true });
    await compareInput.fill("RELIANCE");
    await compareInput.press("Enter");

    await expect(page.getByTestId("chart-compare-unavailable")).toContainText("Compare unavailable for RELIANCE.", { timeout: 15_000 });
    await expect(page.getByTestId("chart-compare-unavailable")).toContainText("Compare data is temporarily unavailable.");
    await expect(page.getByTestId("chart-compare-unavailable")).toContainText("The base chart, drawings, alerts, and order planning remain usable.");
    await expect(page.getByText("Compare unavailable: RELIANCE")).toBeVisible();
    await expect(page.getByTestId("chart-drawing-overlay")).toBeVisible();

    await page.getByTestId("chart-compare-unavailable").getByRole("button", { name: "Retry", exact: true }).click();
    await expect.poll(() => compareRequests).toBeGreaterThan(1);
  });

  test("does not treat journal review outages as empty chart history", async ({ page }) => {
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
    await page.route("**/api/v1/journal**", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Journal review context is temporarily unavailable." }),
      })
    );

    await page.goto("/charts/AUBANK?full=1");
    if (page.url().includes("/login")) return;

    await expect(page.getByTestId("chart-drawing-overlay")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: /Review context\s+Unavailable/ })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: /Review context\s+Unavailable/ }).click();

    await expect(page.getByTestId("chart-review-context-unavailable")).toContainText("Review context unavailable for AUBANK.", { timeout: 15_000 });
    await expect(page.getByTestId("chart-review-context-unavailable")).toContainText("Journal review context is temporarily unavailable.");
    await expect(page.getByTestId("chart-review-context-unavailable")).toContainText("Closed trades are not being treated as empty while review context is unavailable.");
    await expect(page.getByText("No history")).not.toBeVisible();
    await expect(page.getByTestId("chart-drawing-overlay")).toBeVisible();
  });
});
