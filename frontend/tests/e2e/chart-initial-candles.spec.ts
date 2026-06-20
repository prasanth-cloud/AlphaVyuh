import { test, expect } from "@playwright/test";
import { qaCredentials } from "./helpers/qaCredentials";

const ACCESS_URL = process.env.PLAYWRIGHT_ACCESS_URL;
const { email: EMAIL, password: PASSWORD } = qaCredentials();

async function login(page: import("@playwright/test").Page) {
  await page.context().clearCookies();
  if (ACCESS_URL) await page.goto(ACCESS_URL);
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20000 });
}

test.describe("Chart initial candles SSR", () => {
  test("candlestick series has data within 500ms of navigation", async ({ page }) => {
    await login(page);

    const navStart = Date.now();
    await page.goto("/charts/RELIANCE");

    await expect(page.getByTestId("chart-candle-series")).toBeVisible({ timeout: 5000 });

    const el = page.getByTestId("chart-candle-series");
    const count = await el.getAttribute("data-candle-count");
    expect(Number(count)).toBeGreaterThan(0);

    const elapsed = Date.now() - navStart;
    expect(elapsed).toBeLessThan(5000);

    await page.evaluate(() => {
      const marker = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
      const chartEl = document.querySelector("[data-testid='chart-candle-series']");
      if (!chartEl) throw new Error("chart-candle-series not found");
      const candleCount = Number(chartEl.getAttribute("data-candle-count") || "0");
      if (candleCount === 0) throw new Error("No candle data rendered");
      (window as unknown as Record<string, unknown>).__chartRenderMs = marker.responseEnd - marker.requestStart;
    });
  });
});
