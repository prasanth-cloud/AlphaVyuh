import { expect, test } from "@playwright/test";
import { selectPresetAndRunScan } from "./scanner-helpers";

test.describe("Scanner TV table", () => {
  test("sticky sortable headers and scroll container", async ({ page }) => {
    await page.goto("/scanner", { waitUntil: "domcontentloaded" });
    await selectPresetAndRunScan(page);
    await expect(page.locator(".scanner-row-actions").first()).toBeVisible({ timeout: 25_000 });

    await expect(page.locator(".scanner-results-scroll")).toBeVisible();
    await expect(page.locator(".scanner-results-table-tv thead th").first()).toBeVisible();

    const stickyTop = await page.locator(".scanner-results-table-tv th").first().evaluate((el) => getComputedStyle(el).position);
    expect(stickyTop).toBe("sticky");

    await expect(page.getByTestId("scanner-filter-tab-technicals")).toBeVisible();
    await page.getByTestId("scanner-filter-tab-fundamentals").click();

    await page.locator(".scanner-results-table-tv .scanner-col-sort").filter({ hasText: "Price" }).click();
    await expect(page.locator(".scanner-results-table-tv .scanner-col-sort").filter({ hasText: "Price" })).toContainText(/↑|↓/);
  });

  test("charts view renders mini chart tiles", async ({ page }) => {
    await page.goto("/scanner", { waitUntil: "domcontentloaded" });
    await selectPresetAndRunScan(page);
    await expect(page.getByTestId("scanner-data-trust")).toBeVisible({ timeout: 25_000 });

    await page.getByTestId("scanner-view-charts").click();
    await expect(page.getByTestId("scanner-charts-panel")).toBeVisible();
    await expect(page.getByTestId("scanner-charts-grid-2-up")).toBeVisible();
    await expect(page.getByTestId(/^scanner-mini-chart-/).first()).toBeVisible({ timeout: 25_000 });

    await page.getByTestId("scanner-charts-layout-4-up").click();
    await expect(page.getByTestId("scanner-charts-grid-4-up")).toBeVisible();
  });

  test("symbol filter narrows visible results", async ({ page }) => {
    await page.goto("/scanner", { waitUntil: "domcontentloaded" });
    await selectPresetAndRunScan(page);
    await expect(page.locator(".scanner-row-actions").first()).toBeVisible({ timeout: 25_000 });

    const filter = page.getByTestId("scanner-result-symbol-filter");
    await filter.fill("ZZZZNOTFOUND");
    await expect(page.locator(".scanner-results-table-tv tbody tr")).toHaveCount(0);
  });
});
