import { expect, test } from "@playwright/test";
import { selectPresetAndRunScan } from "./scanner-helpers";

test.describe("Scanner keyboard navigation", () => {
  test("j/k focus rows, space toggles select, slash focuses symbol filter", async ({ page }) => {
    await page.goto("/scanner", { waitUntil: "domcontentloaded" });
    await selectPresetAndRunScan(page);
    await expect(page.getByTestId("scanner-result-row").first()).toBeVisible({ timeout: 25_000 });

    await page.keyboard.press("j");
    await expect(page.locator(".scanner-row-focused").first()).toBeVisible();

    await page.keyboard.press(" ");
    await expect(page.getByTestId("scanner-selection-panel")).toBeVisible();

    await page.keyboard.press("/");
    await expect(page.getByTestId("scanner-result-symbol-filter")).toBeFocused();
  });

  test("column presets switch visible headers", async ({ page }) => {
    await page.goto("/scanner", { waitUntil: "domcontentloaded" });
    await selectPresetAndRunScan(page);
    await expect(page.getByTestId("scanner-column-preset-vcp")).toBeVisible({ timeout: 25_000 });

    await page.getByTestId("scanner-column-preset-vcp").click();
    await expect(page.locator(".scanner-results-table-tv .scanner-col-sort").filter({ hasText: "Vol ×" })).toBeVisible();
  });

  test("saved screen tabs load screen filters", async ({ page }) => {
    await page.goto("/scanner", { waitUntil: "domcontentloaded" });
    await selectPresetAndRunScan(page);
    await expect(page.getByTestId("scanner-screen-tabs")).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("scanner-screen-tab-mock-vcp-breakout").click();
    await expect(page.getByTestId("scanner-screen-tab-mock-vcp-breakout")).toHaveClass(/active/);
  });
});
