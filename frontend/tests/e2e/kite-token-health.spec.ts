import { test, expect } from "@playwright/test";

test.describe("Kite token health on settings page", () => {
  test("shows token health panel when Zerodha is selected", async ({ page }) => {
    await page.goto("/settings?tab=broker");
    await expect(page.getByText("Broker connection")).toBeVisible({ timeout: 15_000 });

    const brokerSelect = page.locator("select").first();
    await brokerSelect.selectOption("zerodha");

    const healthPanel = page.getByTestId("kite-token-health");
    await expect(healthPanel).toBeVisible({ timeout: 10_000 });
    await expect(healthPanel.getByText("Kite token status")).toBeVisible();
  });
});
