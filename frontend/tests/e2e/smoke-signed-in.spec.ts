import { test, expect } from "@playwright/test";

const EMAIL = process.env.PLAYWRIGHT_QA_EMAIL ?? "alphavyuh.qa.admin@proton.me";
const PASSWORD = process.env.PLAYWRIGHT_QA_PASSWORD ?? "QaPass123x";

async function login(page: import("@playwright/test").Page) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20000 });
}

test.describe.configure({ mode: "serial" });

test.describe("Signed-in smoke flow", () => {
  test("scanner, watchlist, charts, and journal load in a usable state", async ({ page }) => {
    await login(page);

    const dashboardCta = page
      .locator("div")
      .filter({ hasText: /Next best action:/ })
      .getByRole("button")
      .last();
    await expect(dashboardCta).toBeVisible();
    const ctaStyle = await dashboardCta.evaluate((node) => {
      const style = window.getComputedStyle(node);
      return { color: style.color, backgroundImage: style.backgroundImage };
    });
    expect(ctaStyle.color).toBe("rgb(4, 18, 13)");
    expect(ctaStyle.backgroundImage).toContain("linear-gradient");

    await page.goto("/scanner");
    await expect(page).toHaveURL(/\/scanner/);
    await expect(page.getByText("Scanner").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Filters/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Run scan/i })).toBeVisible();
    await expect
      .poll(async () => page.locator("table tbody tr").count(), { timeout: 25000, intervals: [500, 1000, 2000] })
      .toBeGreaterThan(0);

    await page.goto("/watchlist");
    await expect(page).toHaveURL(/\/watchlist/);
    await expect
      .poll(
        async () => {
          const noLists = await page.getByText("No watchlists yet.").isVisible().catch(() => false);
          const rows = await page.locator(".wl-item").count();
          return noLists || rows > 0;
        },
        { timeout: 15000 }
      )
      .toBeTruthy();

    if (await page.getByText("No watchlists yet.").isVisible().catch(() => false)) {
      await page.locator("aside button").first().click();
      await page.getByPlaceholder("List name…").fill("QA Primary");
      await page.getByRole("button", { name: "Add" }).click();
    }

    const symbolInput = page.getByPlaceholder("Add symbol…");
    if (!(await symbolInput.isVisible().catch(() => false))) {
      const firstWatchlist = page.locator(".wl-item").first();
      await expect(firstWatchlist).toBeVisible({ timeout: 15000 });
      await firstWatchlist.click();
    }
    await expect(symbolInput).toBeVisible({ timeout: 15000 });

    const rows = page.locator("tbody tr");
    await expect(rows.first()).toBeVisible({ timeout: 15000 });
    const firstRowText = await rows.first().textContent();
    const firstSymbol = firstRowText?.trim().match(/^[A-Z0-9&-]+/)?.[0] ?? "RELIANCE";

    await rows.first().click();
    await expect(page.getByRole("button", { name: /Open chart/i })).toBeVisible();
    await expect(page.locator(`text=${firstSymbol}`).first()).toBeVisible();

    if (await rows.count() > 1) {
      const secondRowText = await rows.nth(1).textContent();
      const secondSymbol = secondRowText?.trim().match(/^[A-Z0-9&-]+/)?.[0];
      await rows.nth(1).click();
      if (secondSymbol) await expect(page.locator(`text=${secondSymbol}`).first()).toBeVisible({ timeout: 10000 });
    }

    await page.goto(`/charts/${firstSymbol}`);
    await expect(page).toHaveURL(new RegExp(`/charts/${firstSymbol}`));
    await expect(page.getByText("Trendline")).toBeVisible({ timeout: 15000 });

    await page.goto("/journal");
    await expect(page).toHaveURL(/\/journal/);
    await expect(page.getByText("Review", { exact: false }).first()).toBeVisible({ timeout: 15000 });
  });
});
