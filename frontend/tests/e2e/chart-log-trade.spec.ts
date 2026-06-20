import { test, expect } from "@playwright/test";

test.describe("Chart → Log trade prefill", () => {
  test("Log trade button navigates to journal with prefilled params", async ({ page }) => {
    await page.goto("/charts/RELIANCE");
    await expect(page.getByTestId("chart-candle-series")).toBeVisible({ timeout: 15_000 });

    const logBtn = page.getByTestId("chart-log-trade-button");
    await expect(logBtn).toBeVisible({ timeout: 5_000 });

    const [response] = await Promise.all([
      page.waitForURL(/\/journal\?prefill=1&symbol=RELIANCE/, { timeout: 10_000 }),
      logBtn.click(),
    ]);

    const url = new URL(page.url(), "http://localhost");
    expect(url.searchParams.get("prefill")).toBe("1");
    expect(url.searchParams.get("symbol")).toBe("RELIANCE");
    expect(url.searchParams.has("entry_date")).toBe(true);
  });
});
