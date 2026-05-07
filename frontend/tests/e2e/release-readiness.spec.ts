import { expect, test } from "@playwright/test";

test.describe("Release readiness — public and auth boundary", () => {
  test.beforeEach(async ({ context }) => {
    if (!process.env.PLAYWRIGHT_ACCESS_URL) await context.clearCookies();
  });

  test("homepage serves the customer landing page", async ({ page }) => {
    const response = await page.goto("/");

    expect(response?.ok()).toBeTruthy();
    await expect(page).toHaveTitle(/AlphaVyuh/);
    await expect(page.locator(".lp-h1-s1").getByText("India's Trading OS.", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: /Request access/i }).first()).toBeVisible();
  });

  test("baseline browser security headers are present", async ({ request }) => {
    const response = await request.get("/");

    expect(response.headers()["x-frame-options"]).toBe("DENY");
    expect(response.headers()["x-content-type-options"]).toBe("nosniff");
    expect(response.headers()["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(response.headers()["permissions-policy"]).toContain("camera=()");
    expect(response.headers()["strict-transport-security"]).toContain("max-age=");
    expect(response.headers()["cross-origin-opener-policy"]).toBe("same-origin");
  });

  test("protected app routes redirect logged-out users to login with next path", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard/);

    await page.goto("/scanner");
    await expect(page).toHaveURL(/\/login\?next=%2Fscanner/);

    await page.goto("/charts/RELIANCE");
    await expect(page).toHaveURL(/\/login\?next=%2Fcharts%2FRELIANCE/);
  });

  test("login page renders and rejects obvious open redirect vectors", async ({ page }) => {
    await page.goto("/login?next=https%3A%2F%2Fevil.example");

    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText("Sign in to AlphaVyuh")).toBeVisible();
    expect(new URL(page.url()).hostname).not.toBe("evil.example");
  });
});
