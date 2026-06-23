import { expect, test } from "@playwright/test";
import { selectPresetAndRunScan } from "./scanner-helpers";

/**
 * Records a full mock-auth walkthrough video for QA sign-off.
 * Videos land in frontend/test-results/qa-videos/ after run.
 *
 * Local: npm run e2e:qa-video
 * Post-deploy prod (needs QA session): PLAYWRIGHT_BASE_URL=https://www.alphavyuh.com npm run e2e:qa-video:prod
 */
test.describe("Product walkthrough video", () => {
  test("dashboard and scanner calm polish QA sweep", async ({ page }) => {
    test.setTimeout(180_000);
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => consoleErrors.push(err.message));

    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("dashboard-market-desk")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("dashboard-index-tape")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("dashboard-regime-strip")).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(800);

    await page.locator(".app-nav").getByRole("link", { name: "Scanner" }).click();
    await expect(page.getByText("Screeners", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: /Technicals/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Fundamentals/i })).toBeVisible();

    const moreToggle = page.getByTestId("scanner-more-presets-toggle");
    if (await moreToggle.isVisible()) {
      await moreToggle.click();
      await page.waitForTimeout(400);
    }

    await selectPresetAndRunScan(page);
    await expect(page.locator(".scanner-row-actions").first()).toBeVisible({ timeout: 25_000 });

    await page.getByTestId("scanner-view-charts").click();
    await page.waitForTimeout(600);
    await page.getByTestId("scanner-view-list").click();

    await page.getByTestId("scanner-columns-toggle").click();
    await page.waitForTimeout(400);
    await page.getByTestId("scanner-columns-toggle").click();

    if (await page.getByTestId("scanner-history-toggle").isVisible()) {
      await page.getByTestId("scanner-history-toggle").click();
      await expect(page.getByTestId("scanner-run-history")).toBeVisible();
      await page.waitForTimeout(500);
      await page.getByTestId("scanner-history-toggle").click();
    }

    const firstRow = page.locator("tbody tr").first();
    const symbol = ((await firstRow.locator(".mono").first().textContent()) ?? "").trim();
    await firstRow.getByRole("button", { name: "Shortlist" }).click();
    await page.waitForTimeout(400);
    await firstRow.getByLabel(new RegExp(`More actions for ${symbol}`)).selectOption({ label: "Open chart" });
    await expect(page).toHaveURL(new RegExp(`/charts/${symbol}`), { timeout: 15_000 });
    await page.waitForTimeout(1200);

    await page.goto("/watchlist", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("watchlist-workflow-strip")).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(800);

    const ignored = consoleErrors.filter(
      (line) => !line.includes("favicon") && !line.includes("404") && !line.includes("Failed to load resource"),
    );
    expect(ignored, "console errors during walkthrough").toEqual([]);
  });
});
