import { test, expect } from "@playwright/test";

test.describe("Scanner preset save and filter count badge", () => {
  test("shows filter count badge after setting filters and running scan", async ({ page }) => {
    await page.goto("/scanner");
    await expect(page.getByText("Screeners", { exact: true })).toBeVisible({ timeout: 15_000 });
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});

    const presetButton = page.getByLabel("Select saved screen Trend Template");
    if (await presetButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await page
        .locator(".workspace-section")
        .filter({ has: page.getByText("Screeners", { exact: true }) })
        .getByRole("button", { name: "Trend Template", exact: true })
        .click();
    }

    const runBtn = page.getByRole("button", { name: /^Run scan$/i });
    await expect(runBtn).toBeEnabled({ timeout: 10_000 });
    await runBtn.click();
    await expect(page.getByTestId("scanner-data-trust")).toBeVisible({ timeout: 20_000 });

    const badge = page.getByTestId("scanner-filter-count-badge");
    await expect(badge).toBeVisible({ timeout: 5_000 });
    await expect(badge).toContainText(/\d+ filters? active/);
  });

  test("save preset button opens inline name input", async ({ page }) => {
    await page.goto("/scanner");
    await expect(page.getByText("Screeners", { exact: true })).toBeVisible({ timeout: 15_000 });
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});

    const presetButton = page.getByLabel("Select saved screen Trend Template");
    if (await presetButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await page
        .locator(".workspace-section")
        .filter({ has: page.getByText("Screeners", { exact: true }) })
        .getByRole("button", { name: "Trend Template", exact: true })
        .click();
    }

    const runBtn = page.getByRole("button", { name: /^Run scan$/i });
    await expect(runBtn).toBeEnabled({ timeout: 10_000 });
    await runBtn.click();
    await expect(page.getByTestId("scanner-data-trust")).toBeVisible({ timeout: 20_000 });

    await page.getByTestId("scanner-save-preset-trigger").click();
    await expect(page.getByTestId("scanner-save-preset-inline")).toBeVisible();
    await expect(page.getByTestId("scanner-save-preset-name-input")).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("scanner-save-preset-inline")).toHaveCount(0);
  });
});
