import { expect, test } from "@playwright/test";

test.describe("Release readiness — public and auth boundary", () => {
  test.beforeEach(async ({ context }) => {
    if (!process.env.PLAYWRIGHT_ACCESS_URL) await context.clearCookies();
  });

  test("homepage serves the customer landing page", async ({ page }) => {
    const response = await page.goto("/");

    expect(response?.ok()).toBeTruthy();
    await expect(page).toHaveTitle(/AlphaVyuh/);
    await expect(page.getByRole("heading", { name: /Clarity before every trade\./ })).toBeVisible();
    await expect(page.locator("#lp-hero")).toContainText("Screen stocks, organize your watchlist, and review your performance.");
    await expect(page.getByRole("region", { name: "Market snapshot" })).toBeVisible();
    await expect(page.locator("#lp-hero")).not.toContainText(/cache-first|169 matches|24 tracked|6 reviews due/);
    await expect(page.locator("#lp-hero")).toContainText("Your trading workspace");
    await expect(page.locator('[aria-label="Product scope"]')).toHaveCount(0);
    for (const label of ["EOD market data", "NSE/BSE cash equity", "No trade calls", "Order ticket drafts journal only"]) {
      await expect(page.getByText(label, { exact: true })).toHaveCount(0);
    }
    await expect(page.getByRole("link", { name: /^Create account/ }).first()).toBeVisible();
  });

  test("landing footer links resolve to marketing pages", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "About" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Privacy Policy" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Terms of Service" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Disclaimer" })).toBeVisible();
    await page.getByRole("link", { name: "About" }).click();
    await expect(page).toHaveURL(/\/about/);
    await expect(page.getByRole("heading", { name: /workflow system for Indian swing traders/i })).toBeVisible();
  });

  test("access guide exposes feedback loop and limitations", async ({ page }) => {
    const response = await page.goto("/access");

    expect(response?.ok()).toBeTruthy();
    await expect(page.getByRole("heading", { name: /Operate your EOD trading workflow/i })).toBeVisible();
    await expect(page.locator("body")).toContainText(/support@alphavyuh\.com/i);
    await expect(page.locator("body")).toContainText(/Feedback and bug report paths/i);
    await expect(page.locator("body")).toContainText(/Trading workflow/i);
    await expect(page.locator("body")).toContainText(/Data and execution policy/i);
    await expect(page.locator("body")).toContainText(/No live\/sandbox broker order placement/i);
  });

  test("legacy beta route redirects to the access guide", async ({ page }) => {
    const response = await page.goto("/beta");

    expect(response?.ok()).toBeTruthy();
    await expect(page).toHaveURL(/\/access$/);
    await expect(page.getByRole("heading", { name: /Operate your EOD trading workflow/i })).toBeVisible();
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

  test("dev login is not exposed on production-like routes", async ({ page }) => {
    test.skip(process.env.PLAYWRIGHT_MOCK_AUTH === "true", "Dev login is intentionally available in mock auth mode.");

    await page.goto("/dev-login?email=tester%40example.com&token=fake");
    await expect(page).toHaveURL(/\/login/);
  });

  test("login page renders and rejects obvious open redirect vectors", async ({ page }) => {
    await page.goto("/login?next=https%3A%2F%2Fevil.example");

    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    expect(new URL(page.url()).hostname).not.toBe("evil.example");
  });
});
