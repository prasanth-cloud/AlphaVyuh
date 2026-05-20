import { expect, test } from "@playwright/test";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

test.describe("Fundamentals unavailable state", () => {
  test("full chart shows unavailable copy instead of empty valuation rows", async ({ page }) => {
    await page.route(`${API}/api/v1/charts/RELIANCE/candles**`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          symbol: "RELIANCE",
          timeframe: "D",
          candles: [
            { time: "2026-05-18", open: 100, high: 104, low: 99, close: 103, volume: 1000000 },
            { time: "2026-05-19", open: 103, high: 106, low: 102, close: 105, volume: 1200000 },
          ],
          latest: { close: 105, pct_change: 1.94, volume: 1200000 },
          mode: "eod",
          source_metadata: {
            source_name: "NSE bhavcopy",
            mode: "eod",
            as_of: "2026-05-19",
          },
          coverage: {
            available_from: "2026-05-18",
            available_to: "2026-05-19",
            returned_candles: 2,
            partial: false,
          },
        }),
      })
    );
    await page.route(`${API}/api/v1/stocks/RELIANCE/fundamentals`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          symbol: "RELIANCE",
          trailing_pe: null,
          forward_pe: null,
          price_to_book: null,
          dividend_yield: null,
          trailing_eps: null,
          forward_eps: null,
          earnings_growth: null,
          revenue_growth: null,
          return_on_equity: null,
          debt_to_equity: null,
          market_cap: null,
          market_cap_str: null,
          shares_outstanding: null,
          data_status: "unavailable",
          message: "Fundamentals are temporarily unavailable; trading workflow can continue with chart and plan data.",
        }),
      })
    );

    await page.goto("/charts/RELIANCE?full=1");
    if (page.url().includes("/login")) return;

    await page.getByRole("button", { name: "Fundamentals" }).click();
    await expect(page.getByText("Fundamentals are temporarily unavailable. Chart and planning tools remain usable.")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Source: Yahoo Finance")).not.toBeVisible();
  });
});
