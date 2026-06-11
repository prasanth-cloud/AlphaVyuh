import { test, expect } from "@playwright/test";

// ── Auth gate (unauthenticated) ───────────────────────────────────────────────

test.describe("Auth gate — unauthenticated", () => {
  test.beforeEach(async ({ context }) => {
    if (!process.env.PLAYWRIGHT_ACCESS_URL) await context.clearCookies();
  });

  test("/dashboard redirects to /login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("/dashboard carries ?next=/dashboard through the redirect", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard/);
  });

  test("/scanner redirects to /login with correct ?next", async ({ page }) => {
    await page.goto("/scanner");
    await expect(page).toHaveURL(/\/login\?next=%2Fscanner/);
  });

  test("/journal redirects to /login", async ({ page }) => {
    await page.goto("/journal");
    await expect(page).toHaveURL(/\/login/);
  });

  test("/settings redirects to /login", async ({ page }) => {
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/login/);
  });

  test("/agents redirects to /login with correct ?next", async ({ page }) => {
    await page.goto("/agents");
    await expect(page).toHaveURL(/\/login\?next=%2Fagents/);
  });
});

// ── Public pages (no auth required) ──────────────────────────────────────────

test.describe("Public pages — no redirect", () => {
  test.beforeEach(async ({ context }) => {
    if (!process.env.PLAYWRIGHT_ACCESS_URL) await context.clearCookies();
  });

  test("/login is accessible", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator("text=Sign in to AlphaVyuh")).toBeVisible();
  });

  test("/signup is accessible", async ({ page }) => {
    await page.goto("/signup");
    await expect(page).toHaveURL(/\/signup/);
  });

  test("/reset-password is accessible", async ({ page }) => {
    await page.goto("/reset-password");
    await expect(page).toHaveURL(/\/reset-password/);
  });

  test("/privacy and /terms are accessible before login", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page).toHaveURL(/\/privacy/);
    await expect(page.getByRole("heading", { name: "Privacy Policy" })).toBeVisible();

    await page.goto("/terms");
    await expect(page).toHaveURL(/\/terms/);
    await expect(page.getByRole("heading", { name: "Terms of Service" })).toBeVisible();
  });
});

// ── Open-redirect protection ──────────────────────────────────────────────────

test.describe("Open-redirect protection", () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  const attackVectors = [
    { label: "protocol-relative //evil.com", next: "//evil.com" },
    { label: "backslash /\\\\evil.com", next: "/\\evil.com" },
    { label: "encoded protocol-relative /%2F%2Fevil.com", next: "/%2F%2Fevil.com" },
    { label: "encoded backslash /%5Cevil.com", next: "/%5Cevil.com" },
    { label: "encoded newline", next: "/dashboard%0ASet-Cookie:%20bad=1" },
    { label: "absolute https://evil.com", next: "https://evil.com" },
    { label: "javascript: scheme", next: "javascript:alert(1)" },
  ];

  for (const { label, next } of attackVectors) {
    test(`/login?next=${encodeURIComponent(next)} stays on /login (${label})`, async ({ page }) => {
      await page.goto(`/login?next=${encodeURIComponent(next)}`);
      // Page should still be /login (not navigated away)
      await expect(page).toHaveURL(/\/login/);
      // The login form should be visible — we haven't been hijacked
      await expect(page.locator("text=Sign in to AlphaVyuh")).toBeVisible();
    });
  }

  test("safe /login?next=/dashboard preserves the param (form renders)", async ({ page }) => {
    await page.goto("/login?next=/dashboard");
    // Browser may or may not encode the slash — check the parsed param value
    await expect(page).toHaveURL(/\/login/);
    const url = new URL(page.url());
    expect(url.searchParams.get("next")).toBe("/dashboard");
    await expect(page.locator("text=Sign in to AlphaVyuh")).toBeVisible();
  });

  const friendlyRedirects = [
    { next: "/scanner", label: "Scanner" },
    { next: "/watchlist", label: "Watchlist" },
    { next: "/journal", label: "Journal" },
  ];

  for (const { next, label } of friendlyRedirects) {
    test(`/login?next=${next} shows friendly redirect label (${label})`, async ({ page }) => {
      await page.goto(`/login?next=${encodeURIComponent(next)}`);
      await expect(page.getByText(new RegExp(`continue to ${label}`, "i"))).toBeVisible();
      await expect(page.getByText(next, { exact: true })).not.toBeVisible();
    });
  }
});

// ── /charts/* legacy redirect ─────────────────────────────────────────────────

test.describe("/charts redirect", () => {
  test("/charts/RELIANCE redirects to /watchlist?symbol=RELIANCE", async ({ page }) => {
    await page.context().clearCookies();
    // Middleware redirects /charts/* before auth gate, so unauthenticated is fine here
    await page.goto("/charts/RELIANCE", { waitUntil: "commit" });
    // Should have been redirected to watchlist (then bounced to login since not authed)
    expect(page.url()).toMatch(/\/watchlist|\/login/);
  });
});
