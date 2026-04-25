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

    await page.goto("/scanner");
    await expect(page).toHaveURL(/\/scanner/);
    await expect(page.getByText("Scanner").first()).toBeVisible();
    await expect(page.locator("select").filter({ has: page.locator("option[value='25']") }).first()).toBeVisible();
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

    const ensureSymbol = async (symbol: string) => {
      if (await page.locator("tbody tr").filter({ hasText: symbol }).count()) return;
      await symbolInput.fill(symbol);
      await page.getByRole("button", { name: "Add" }).click();
      await expect(page.locator("tbody tr").filter({ hasText: symbol }).first()).toBeVisible({ timeout: 15000 });
    };

    await ensureSymbol("RELIANCE");
    await ensureSymbol("TCS");

    await page.locator("tbody tr").filter({ hasText: "RELIANCE" }).first().click();
    await expect(page.locator("text=Open full chart")).toBeVisible();
    await expect(page.locator("text=RELIANCE").first()).toBeVisible();

    await page.locator("tbody tr").filter({ hasText: "TCS" }).first().click();
    await expect(page.locator("text=TCS").first()).toBeVisible({ timeout: 10000 });

    await page.goto("/charts/RELIANCE");
    await expect(page).toHaveURL(/\/charts\/RELIANCE/);
    await expect(page.getByText("Trendline")).toBeVisible({ timeout: 15000 });

    await page.goto("/journal");
    await expect(page).toHaveURL(/\/journal/);
    await expect(page.getByText("Review", { exact: false }).first()).toBeVisible({ timeout: 15000 });
  });
});
