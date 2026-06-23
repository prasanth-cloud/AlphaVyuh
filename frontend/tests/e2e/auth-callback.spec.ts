import { test, expect } from "@playwright/test";

test.describe("Auth callback route", () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test("missing ?code param redirects to /auth/error", async ({ page }) => {
    await page.goto("/auth/callback", { waitUntil: "commit" });
    await expect(page).toHaveURL(/\/auth\/error\?reason=missing_code/);
    await expect(page.getByText("No authorization code was provided")).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to Login" })).toBeVisible();
  });

  test("invalid code redirects to /auth/error with exchange_failed", async ({ page }) => {
    await page.goto("/auth/callback?code=invalid_code_xyz", { waitUntil: "commit" });
    await expect(page).toHaveURL(/\/auth\/error\?reason=exchange_failed/);
    await expect(page.getByText("Failed to verify")).toBeVisible();
  });
});
