import { expect, test } from "@playwright/test";

test.describe("Sign-in and signup recovery", () => {
  test("the landing page offers account creation and login directly", async ({ page }) => {
    await page.route("**/api/public/market-tape", (route) => route.fulfill({
      status: 503, contentType: "application/json", body: '{"error":"Unavailable in this test"}',
    }));
    await page.goto("/");
    const hero = page.locator("#lp-hero");
    await expect(hero.getByRole("status")).toContainText("Market quotes are temporarily unavailable.");
    await expect(hero.getByText("Unavailable", { exact: true })).toBeVisible();
    await expect(hero.getByRole("table")).toHaveCount(0);
    await expect(hero.getByRole("link", { name: "Create account", exact: true })).toHaveAttribute("href", "/signup");
    await expect(page.locator(".lp-nav-right").getByRole("link", { name: "Sign in", exact: true })).toHaveAttribute("href", "/login");
    await expect(page.getByRole("link", { name: /Request access/i })).toHaveCount(0);
    await hero.getByRole("link", { name: "Create account", exact: true }).click();
    await expect(page).toHaveURL(/\/signup$/);
    await expect(page.getByRole("button", { name: "Create account", exact: true })).toBeVisible();
    await expect(page.getByText("Start on Free with scanning, watchlists, chart planning, and journaling.")).toBeVisible();
  });

  test("the mobile landing menu offers account creation directly", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route("**/api/public/market-tape", (route) => route.fulfill({
      status: 503, contentType: "application/json", body: '{"error":"Unavailable in this test"}',
    }));
    await page.goto("/");
    await expect(page.getByRole("region", { name: "Market snapshot", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Open menu", exact: true }).click();
    await page.locator(".lp-nav-mobile").getByRole("link", { name: "Create account →", exact: true }).click();
    await expect(page).toHaveURL(/\/signup$/);
    await expect(page.getByRole("button", { name: "Create account", exact: true })).toBeVisible();
  });

  test("login and the access guide offer signup without an approval request", async ({ page }) => {
    await page.goto("/login?next=%2Fjournal");
    const signup = page.getByRole("link", { name: "Create account", exact: true });
    await expect(signup).toHaveAttribute("href", "/signup?next=%2Fjournal");
    await signup.click();
    await expect(page).toHaveURL(/\/signup\?next=%2Fjournal$/);
    await expect(page.getByRole("link", { name: "Log in", exact: true })).toHaveAttribute("href", "/login?next=%2Fjournal");
    await page.goto("/access");
    await expect(page.getByText("Create a Free account and verify your email to sign in")).toBeVisible();
    await expect(page.getByText("Journal analytics are included on Free; AI journal review requires Pro or Elite.")).toBeVisible();
    await page.getByRole("link", { name: "Create account", exact: true }).click();
    await expect(page).toHaveURL(/\/signup$/);
  });

  test("Free pricing includes journal analytics while Pro labels AI journal review", async ({ page }) => {
    await page.route("**/api/public/market-tape", (route) => route.fulfill({
      status: 503, contentType: "application/json", body: '{"error":"Unavailable in this test"}',
    }));
    await page.goto("/");
    await page.locator("#pricing").scrollIntoViewIfNeeded();
    const free = page.locator(".lp-pcard").filter({ has: page.getByText("Free", { exact: true }) });
    const pro = page.locator(".lp-pcard").filter({ has: page.getByText("Pro", { exact: true }) });
    await expect(free.locator(".lp-pfi-on").filter({ hasText: "Journal analytics" })).toBeVisible();
    await expect(pro.locator(".lp-pfi-on").filter({ hasText: "AI journal review" })).toBeVisible();
    await expect(free.getByText("Journal review", { exact: true })).toHaveCount(0);
  });

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
    let signupBody: unknown;
    await page.route("**/api/auth/signup", (route) => {
      signupBody = route.request().postDataJSON();
      return route.fulfill({ status: 200, contentType: "application/json", body: '{"pending_confirmation":true}' });
    });
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
    await page.getByRole("button", { name: "Create account", exact: true }).click();
    await expect(page.getByText("Check your email", { exact: true })).toBeVisible();
    expect(signupBody).toEqual({ email: "test@example.invalid", password: "test-password", full_name: "Test Trader", next: "/scanner" });
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
