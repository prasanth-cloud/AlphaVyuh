import { test, expect } from "@playwright/test";

test.describe("Feedback page — deep analysis", () => {
  test("renders analysis sections after clicking run", async ({ page }) => {
    await page.goto("/feedback");
    await expect(page.getByText("Trade Feedback")).toBeVisible({ timeout: 15_000 });

    const runBtn = page.getByTestId("feedback-run-analysis");
    await expect(runBtn).toBeVisible({ timeout: 5_000 });
    await runBtn.click();

    const results = page.getByTestId("feedback-results");
    await expect(results).toBeVisible({ timeout: 30_000 });

    await expect(page.getByTestId("feedback-section-winning_setups")).toBeVisible();
    await expect(page.getByTestId("feedback-section-mistake_patterns")).toBeVisible();
    await expect(page.getByTestId("feedback-section-sizing_behaviour")).toBeVisible();

    await expect(page.getByTestId("feedback-rerun")).toBeVisible();
  });
});
