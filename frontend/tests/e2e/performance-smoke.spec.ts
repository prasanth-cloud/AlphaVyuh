import { expect, test, type Locator, type Page } from "@playwright/test";

type PageBudget = {
  path: string;
  name: string;
  marker: (page: Page) => Locator;
  maxMs: number;
};

const budgets: PageBudget[] = [
  {
    path: "/dashboard",
    name: "today",
    marker: (page) => page.getByTestId("today-cockpit"),
    maxMs: 8_000,
  },
  {
    path: "/scanner",
    name: "scanner",
    marker: (page) => page.getByRole("button", { name: /^Run scan$/i }),
    maxMs: 8_000,
  },
  {
    path: "/watchlist",
    name: "watchlist decision desk",
    marker: (page) => page.getByText("Decision desk"),
    maxMs: 8_000,
  },
  {
    path: "/charts/AUBANK?full=1",
    name: "full chart",
    marker: (page) => page.getByTestId("chart-drawing-overlay"),
    maxMs: 8_000,
  },
  {
    path: "/journal",
    name: "journal",
    marker: (page) => page.getByText(/Review/i).first(),
    maxMs: 8_000,
  },
];

test.describe("Mock workflow performance", () => {
  test("mock login reaches a usable Today view and records startup timing marks", async ({ page }) => {
    test.setTimeout(60_000);
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));

    const started = Date.now();
    await page.goto("/login");
    await page.getByLabel("Email").fill("mock.trader@alphavyuh.test");
    await page.getByLabel("Password").fill("MockPass123!");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
    await expect(page.getByTestId("today-cockpit")).toBeVisible({ timeout: 8_000 });

    const elapsed = Date.now() - started;
    expect(elapsed, `mock login to Today usable in ${elapsed}ms`).toBeLessThanOrEqual(8_000);

    const timings = await page.evaluate(() => {
      const win = window as Window & { __alphavyuhTimings?: { name: string; at: number }[] };
      return win.__alphavyuhTimings ?? [];
    });
    const names = timings.map((item) => item.name);
    expect(names).toEqual(expect.arrayContaining([
      "login-submit",
      "auth-session-set",
      "first-app-shell-paint",
      "dashboard-shell-paint",
      "market-overview-loaded",
    ]));
    expect(errors).toEqual([]);
  });

  test("core signed-in workflow pages stay within local smoke budgets", async ({ page }) => {
    test.setTimeout(60_000);
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));

    const timings: Record<string, number> = {};

    for (const budget of budgets) {
      const started = Date.now();
      await page.goto(budget.path, { waitUntil: "domcontentloaded" });
      await expect(budget.marker(page)).toBeVisible({ timeout: budget.maxMs });
      await page.waitForLoadState("networkidle", { timeout: 2_000 }).catch(() => {});
      const elapsed = Date.now() - started;
      timings[budget.name] = elapsed;
      expect(elapsed, `${budget.name} loaded in ${elapsed}ms`).toBeLessThanOrEqual(budget.maxMs);
    }

    expect(
      Object.values(timings).reduce((sum, value) => sum + value, 0),
      `aggregate workflow timing ${JSON.stringify(timings)}`,
    ).toBeLessThanOrEqual(25_000);
    expect(errors).toEqual([]);
  });
});
