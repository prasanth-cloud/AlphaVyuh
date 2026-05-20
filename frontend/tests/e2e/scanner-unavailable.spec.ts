import { expect, test } from "@playwright/test";

test.describe("Scanner unavailable payloads", () => {
  test("does not render a service outage as a zero-result scan", async ({ page }) => {
    await page.route("**/api/v1/scanner/screens", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ screens: [] }),
      })
    );
    await page.route("**/api/v1/watchlists**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ watchlists: [] }),
      })
    );
    await page.route("**/api/v1/scanner/run", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          trade_date: null,
          total_matches: 0,
          results: [],
          mode: "unavailable",
          message: "Scanner data is temporarily unavailable.",
        }),
      })
    );

    await page.goto("/scanner");
    if (page.url().includes("/login")) return;

    await expect(page.getByText("Scanner data is temporarily unavailable.")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("No stocks matched")).not.toBeVisible();
  });

  test("surfaces watchlist selector outages instead of hiding scanner add actions", async ({ page }) => {
    let watchlistRequests = 0;
    await page.route("**/api/v1/scanner/screens", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ screens: [] }),
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
    await page.route("**/api/v1/scanner/run", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          trade_date: "2026-05-20",
          total_matches: 1,
          total_pages: 1,
          page: 1,
          is_limited: false,
          mode: "eod",
          source: "Exchange market data",
          coverage_pct: 100,
          universe_size: 1,
          source_metadata: {
            source_name: "Exchange market data",
            mode: "eod",
            as_of: "2026-05-20",
            coverage_pct: 100,
            universe_active: 1,
          },
          results: [{
            symbol: "AUBANK",
            company_name: "AU Small Finance Bank",
            sector: "Financial Services",
            close: 678.25,
            pct_change: 1.4,
            volume: 1800000,
            avg_volume_20d: 900000,
            volume_ratio: 2,
            rsi_14: 62,
            ema_20: 650,
            ema_50: 625,
            ema_200: 570,
            macd_hist: 1.2,
            atr_14: 14,
            adx_14: 24,
            week_52_high: 720,
            week_52_low: 520,
            week_52_high_pct: 5.8,
            is_new_52w_high: false,
            rs_score: 78,
            bb_width: 7.4,
            market_cap_cr: 50500,
            pe_ratio: 28,
            pb_ratio: 3.4,
            eps: 24,
            dividend_yield: 0.2,
            roe: 14,
            roce: 12,
            setup_score: 81,
            setup_grade: "A",
            match_reasons: ["Volume expansion"],
          }],
        }),
      })
    );

    await page.goto("/scanner");
    if (page.url().includes("/login")) return;

    await expect(page.getByText("Watchlists unavailable")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Watchlist data is temporarily unavailable.")).toBeVisible();

    await page.getByRole("button", { name: /^Run scan$/i }).click();
    await expect(page.locator(".scanner-row-actions").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(".scanner-row-actions").first().getByRole("button", { name: "Shortlist" })).toBeVisible();
    await expect(page.locator(".scanner-row-actions").first().getByRole("button", { name: "Chart" })).toBeVisible();
    await expect(page.locator(".scanner-row-actions").first().getByRole("combobox", { name: /More actions/i })).toBeVisible();
    await expect(page.locator(".scanner-row-actions").first().getByText(/Add to/i)).toHaveCount(0);

    await page.getByTestId("scanner-watchlists-outage").getByRole("button", { name: /^Retry$/ }).click();
    await expect.poll(() => watchlistRequests).toBeGreaterThan(1);
  });
});
