import { test, expect } from "@playwright/test";

test.describe("Empty states render when data is absent", () => {
  test("scanner shows empty state before first scan", async ({ page }) => {
    await page.goto("/scanner");
    await expect(page.getByTestId("scanner-empty-no-run")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("No scan results yet")).toBeVisible();
    await expect(page.getByRole("button", { name: "Select Trend Template" })).toBeVisible();
  });

  test("watchlist shows empty state with no watchlist selected", async ({ page }) => {
    await page.goto("/watchlist");
    const noSelected = page.getByTestId("watchlist-empty-none-selected");
    const noItems = page.getByTestId("watchlist-empty-no-items");
    await expect(noSelected.or(noItems)).toBeVisible({ timeout: 15_000 });
  });

  test("journal shows empty state with no trades", async ({ page }) => {
    await page.goto("/journal");
    await expect(page.getByTestId("journal-trades-empty")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("No trades in this view")).toBeVisible();
  });
});
