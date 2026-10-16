import { test, expect } from "@playwright/test";

test.describe("Auth callback route", () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test("missing confirmation parameters return to login with the safe destination", async ({ page }) => {
    await page.goto("/auth/callback?next=%2Fscanner", { waitUntil: "commit" });
    await expect(page).toHaveURL(/\/login\?error=auth_callback_failed&next=%2Fscanner/);
    await expect(page.getByRole("alert").filter({ hasText: "Confirmation link expired" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Resend confirmation email" })).toBeVisible();
  });

  test("unsupported OTP types return to login without exposing the token", async ({ page }) => {
    await page.goto("/auth/callback?token_hash=not-a-real-token&type=unsupported", { waitUntil: "commit" });
    await expect(page).toHaveURL(/\/login\?error=auth_callback_failed&next=%2Fdashboard/);
    expect(page.url()).not.toContain("not-a-real-token");
  });
});
