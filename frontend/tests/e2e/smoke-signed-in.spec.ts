import { test, expect } from "@playwright/test";
import { qaCredentials } from "./helpers/qaCredentials";

const ACCESS_URL = process.env.PLAYWRIGHT_ACCESS_URL;
const EXPECT_REAL_DATA = process.env.PLAYWRIGHT_EXPECT_REAL_DATA === "true";
const SMOKE_SYMBOL = process.env.PLAYWRIGHT_SMOKE_SYMBOL ?? "RELIANCE";
const { email: EMAIL, password: PASSWORD } = qaCredentials({ requireExplicit: EXPECT_REAL_DATA });
const REAL_DATA_FORBIDDEN_COPY = /Demo data|mock fixtures|sample data|AlphaVyuh mock fixtures/i;
const REAL_DATA_CONTEXT_COPY = /Latest session|EOD|Market|Trade date|coverage|as of|Data status/i;

async function login(page: import("@playwright/test").Page) {
  await page.context().clearCookies();
  if (ACCESS_URL) {
    await page.goto(ACCESS_URL);
  }
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20000 });
}

async function expectRealDataContext(
  page: import("@playwright/test").Page,
  surface: string,
  requiredCopy: RegExp = REAL_DATA_CONTEXT_COPY,
) {
  if (!EXPECT_REAL_DATA) return;

  const body = page.locator("body");
  await expect(body, `${surface} must not show demo/mock copy in real-data smoke`).not.toContainText(REAL_DATA_FORBIDDEN_COPY);
  await expect(body, `${surface} must expose source, freshness, or coverage context`).toContainText(requiredCopy, { timeout: 15000 });
}

test.describe.configure({ mode: "serial" });

test.describe("Signed-in smoke flow", () => {
  test("dashboard, scanner, watchlist, full chart, journal, settings, broker, and data load in a usable state", async ({ page }) => {
    await login(page);

    await expect(page.getByText("Market pulse")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("dashboard-data-trust")).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("heading", { name: /Next actions/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Open scanner/i })).toBeVisible();
    await expectRealDataContext(page, "dashboard", /Latest session|EOD|Market|coverage|NSE universe/i);

    await page.goto("/scanner");
    await expect(page).toHaveURL(/\/scanner/);
    await expect(page.getByText("Scanner").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Filters/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Run scan/i })).toBeVisible();
    await expect
      .poll(async () => page.locator("table tbody tr").count(), { timeout: 25000, intervals: [500, 1000, 2000] })
      .toBeGreaterThan(0);
    await expect(page.getByTestId("scanner-data-trust")).toBeVisible({ timeout: 15000 });
    await expectRealDataContext(page, "scanner", /Latest session|Trade date|coverage|market data|Exchange|NSE/i);

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
    if ((await rows.count()) === 0) {
      await symbolInput.fill(SMOKE_SYMBOL);
      await page.getByRole("button", { name: /^Add$/i }).click();
      await expect(page.getByText(/Added|Already/i)).toBeVisible({ timeout: 15000 });
    }
    await expect(rows.first()).toBeVisible({ timeout: 15000 });
    const firstRowText = await rows.first().textContent();
    const firstSymbol = firstRowText?.trim().match(/^[A-Z0-9&-]+/)?.[0] ?? SMOKE_SYMBOL;

    await rows.first().click();
    await expect(page.getByRole("button", { name: /Open chart/i })).toBeVisible();
    await expect(page.locator(`text=${firstSymbol}`).first()).toBeVisible();
    await expectRealDataContext(page, "watchlist", /Latest session|Daily|as of|Data status|Market data/i);

    if (await rows.count() > 1) {
      const secondRowText = await rows.nth(1).textContent();
      const secondSymbol = secondRowText?.trim().match(/^[A-Z0-9&-]+/)?.[0];
      await rows.nth(1).click();
      if (secondSymbol) await expect(page.locator(`text=${secondSymbol}`).first()).toBeVisible({ timeout: 10000 });
    }

    await page.goto(`/charts/${firstSymbol}?full=1`);
    await expect(page).toHaveURL(new RegExp(`/charts/${firstSymbol}`));
    await expect(page.getByRole("button", { name: /^Tools/i })).toBeVisible({ timeout: 15000 });
    await expect(page.locator("body")).toContainText(/Daily|Volume|RSI|EMA|bars/i, { timeout: 15000 });
    await expectRealDataContext(page, "full chart", /Latest session|Daily|Volume|RSI|EMA|as of/i);

    await page.goto("/journal");
    await expect(page).toHaveURL(/\/journal/);
    await expect(page.getByText("Review", { exact: false }).first()).toBeVisible({ timeout: 15000 });

    await page.goto("/settings");
    await expect(page).toHaveURL(/\/settings/);
    await expect(page.locator("body")).toContainText(/Account Access|Billing|Profile/i, { timeout: 15000 });

    await page.goto("/settings/broker");
    await expect(page).toHaveURL(/\/settings\/broker/);
    await expect(page.locator("body")).toContainText(/Broker import|read-only|Execution not enabled/i, { timeout: 15000 });

    await page.goto("/data");
    await expect(page).toHaveURL(/\/data/);
    await expect(page.locator("body")).toContainText(/EOD|coverage|broker import|journal/i, { timeout: 15000 });
    await expectRealDataContext(page, "data status", /EOD|coverage|broker import|journal|Data status/i);
  });
});
