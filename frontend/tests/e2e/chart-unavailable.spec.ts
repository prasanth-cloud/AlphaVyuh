import { expect, test } from "@playwright/test";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

test.describe("Chart unavailable payloads", () => {
  test("does not render a successful unavailable candle payload as an empty chart", async ({ page }) => {
    await page.route(`${API}/api/v1/charts/RELIANCE/candles**`, (route) =>
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
});
