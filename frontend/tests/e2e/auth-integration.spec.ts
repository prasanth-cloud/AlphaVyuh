import { expect, test } from "@playwright/test";

test.describe("Sign-in and signup recovery", () => {
  test("an unconfirmed email offers a resend without suggesting password reset", async ({ page }) => {
    await page.route("**/api/auth/login", (route) => route.fulfill({
      status: 401, contentType: "application/json", body: JSON.stringify({
        code: "email_not_confirmed",
        error: "Confirm your email before signing in. You can request a fresh confirmation link.",
      }),
    }));
    let resendBody: unknown;
    await page.route("**/api/auth/resend-confirmation", (route) => {
      resendBody = route.request().postDataJSON();
      return route.fulfill({ status: 200, contentType: "application/json", body: '{"success":true}' });
    });
    await page.goto("/login?next=%2Fscanner");
    await page.getByLabel("Email", { exact: true }).fill("Trader@Example.invalid");
    await page.getByLabel("Password", { exact: true }).fill("test-password");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    const alert = page.getByRole("alert").filter({ hasText: "Confirm your email" });
    await expect(alert).toBeVisible();
    await expect(alert.getByRole("link", { name: "Reset password" })).toHaveCount(0);
    await page.getByRole("button", { name: "Resend confirmation email" }).click();
    await expect(page.getByText("If this account is waiting for verification, a fresh link has been sent.")).toBeVisible();
    expect(resendBody).toEqual({ email: "trader@example.invalid", next: "/scanner" });
    await expect(page).toHaveURL(/\/login\?next=%2Fscanner$/);
  });

  test("pending signup preserves destination and handles resend failure honestly", async ({ page }) => {
    await page.route("**/api/auth/signup", (route) => route.fulfill({
      status: 200, contentType: "application/json", body: '{"pending_confirmation":true}',
    }));
    await page.route("**/api/auth/resend-confirmation", (route) => route.fulfill({
      status: 503, contentType: "application/json", body: JSON.stringify({
        error: "Account access is temporarily unavailable. Please try again shortly. No password change is needed.",
      }),
    }));
    await page.goto("/signup?next=%2Fscanner");
    await page.getByLabel("Full name", { exact: true }).fill("Test Trader");
    await page.getByLabel("Email", { exact: true }).fill("test@example.invalid");
    await page.getByLabel("Password", { exact: true }).fill("test-password");
    await page.getByLabel("Confirm password", { exact: true }).fill("test-password");
    await page.getByRole("button", { name: "Request access", exact: true }).click();
    await expect(page.getByText("Check your email", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in", exact: true })).toHaveAttribute("href", "/login?next=%2Fscanner");
    await page.getByRole("button", { name: "Resend confirmation email" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "temporarily unavailable" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Resend confirmation email" })).toBeEnabled();
    await expect(page.getByText("A fresh confirmation link has been sent.")).toHaveCount(0);
  });

  test("a service failure callback permits retry without offering another email", async ({ page }) => {
    await page.goto("/login?error=auth_service_unavailable&next=%2Fscanner");
    await expect(page.getByRole("alert").filter({ hasText: "temporarily unavailable" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Resend confirmation email" })).toHaveCount(0);
  });
});
