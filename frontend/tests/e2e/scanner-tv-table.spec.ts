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

    await page.locator(".scanner-results-table-tv .scanner-col-sort").filter({ hasText: "Price" }).click();
    await expect(page.locator(".scanner-results-table-tv .scanner-col-sort").filter({ hasText: "Price" })).toContainText(/↑|↓/);
  });
});
