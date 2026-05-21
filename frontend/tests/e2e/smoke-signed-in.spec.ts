import { test, expect } from "@playwright/test";
import { qaCredentials } from "./helpers/qaCredentials";

const ACCESS_URL = process.env.PLAYWRIGHT_ACCESS_URL;
const EXPECT_REAL_DATA = process.env.PLAYWRIGHT_EXPECT_REAL_DATA === "true";
const SMOKE_SYMBOL = process.env.PLAYWRIGHT_SMOKE_SYMBOL ?? "RELIANCE";
const API_BEARER_TOKEN = process.env.PRODUCTION_API_BEARER_TOKEN?.trim();
const SUPABASE_AUTH_COOKIES = process.env.PLAYWRIGHT_SUPABASE_AUTH_COOKIES?.trim();
const { email: EMAIL, password: PASSWORD } = qaCredentials({ requireExplicit: EXPECT_REAL_DATA });
const READ_ONLY_REAL_DATA_SMOKE = EXPECT_REAL_DATA;
const REAL_DATA_FORBIDDEN_COPY = /Demo data|mock fixtures|sample data|AlphaVyuh mock fixtures/i;
const REAL_DATA_CONTEXT_COPY = /Latest session|EOD|Market|Trade date|coverage|as of|Data status/i;

async function installSupabaseSessionCookies(page: import("@playwright/test").Page) {
  if (!SUPABASE_AUTH_COOKIES) return false;

  let cookies: Array<{ name: string; value: string }>;
  try {
    cookies = JSON.parse(SUPABASE_AUTH_COOKIES);
  } catch {
    throw new Error("PLAYWRIGHT_SUPABASE_AUTH_COOKIES must be a JSON array of Supabase auth cookies.");
  }

  if (!Array.isArray(cookies) || cookies.length === 0 || cookies.some((cookie) => !cookie?.name || !cookie?.value)) {
    throw new Error("PLAYWRIGHT_SUPABASE_AUTH_COOKIES did not contain usable Supabase auth cookies.");
  }

  const baseUrl = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";
  const url = new URL(baseUrl);
  await page.context().addCookies(
    cookies.map((cookie) => ({
      name: cookie.name,
      value: cookie.value,
      domain: url.hostname,
      path: "/",
      httpOnly: false,
      secure: url.protocol === "https:",
      sameSite: "Lax" as const,
    }))
  );
  return true;
}

async function login(page: import("@playwright/test").Page) {
  await page.context().clearCookies();
  if (ACCESS_URL) {
    await page.goto(ACCESS_URL);
  }

  if (EXPECT_REAL_DATA) {
    if (API_BEARER_TOKEN) {
      await page.route("**/api/v1/**", async (route) => {
        await route.continue({
          headers: {
            ...route.request().headers(),
            authorization: `Bearer ${API_BEARER_TOKEN}`,
          },
        });
      });
    }

    if (await installSupabaseSessionCookies(page)) {
      await page.goto("/dashboard");
      if (await page.waitForURL(/\/dashboard/, { timeout: 20000 }).then(() => true).catch(() => false)) {
        return;
      }
      await page.context().clearCookies();
    }

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const response = await page.request.post("/api/auth/login", { data: { email: EMAIL, password: PASSWORD } });
      if (response.ok()) {
        await page.goto("/dashboard");
        await expect(page).toHaveURL(/\/dashboard/, { timeout: 20000 });
        return;
      }
      const body = await response.text();
      if (response.status() === 403 && /Just a moment|challenge/i.test(body)) break;
      await page.waitForTimeout(attempt * 1000);
    }
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
    test.setTimeout(EXPECT_REAL_DATA ? 90_000 : 30_000);
    await login(page);

    if (await page.getByText("Market data is not connected").isVisible().catch(() => false)) {
      await page.getByRole("button", { name: "Retry" }).click();
    }
    await expect(page.getByText(/Market pulse/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("dashboard-data-trust")).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("heading", { name: /Next actions/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Open scanner/i })).toBeVisible();
    await expectRealDataContext(page, "dashboard", /Latest session|EOD|Market|coverage|NSE universe/i);

    await page.goto("/scanner");
    await expect(page).toHaveURL(/\/scanner/);
    await expect(page.getByText(/Scanner queue|Run your first scan/i).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("button", { name: /Filters/i })).toBeVisible({ timeout: 15000 });
    const resetScanButton = page.getByRole("button", { name: /^Reset$/i });
    if (await resetScanButton.isVisible().catch(() => false)) {
      await resetScanButton.click();
    }
    const runScanButton = page.getByRole("button", { name: /Run scan/i });
    await expect(runScanButton).toBeVisible();
    await runScanButton.click();
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
          const noSelected = await page.getByText("No watchlist selected").isVisible().catch(() => false);
          const rows = await page.locator(".wl-item").count();
          const collapsedLists = await page.locator("button[title]").count();
          return noLists || noSelected || rows > 0 || collapsedLists > 0;
        },
        { timeout: 15000 }
      )
      .toBeTruthy();

    if (await page.getByText("No watchlists yet.").isVisible().catch(() => false)) {
      if (READ_ONLY_REAL_DATA_SMOKE) {
        throw new Error("Production signed-in smoke is read-only and requires a seeded QA watchlist.");
      }
      await page.locator("aside button").first().click();
      await page.getByPlaceholder("List name…").fill("QA Primary");
      await page.getByRole("button", { name: "Add" }).click();
    }

    if (await page.getByText("No watchlist selected").isVisible().catch(() => false)) {
      const collapsedWatchlist = page.locator("button[title]").first();
      if (await collapsedWatchlist.isVisible().catch(() => false)) {
        await collapsedWatchlist.click();
      }
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
      if (READ_ONLY_REAL_DATA_SMOKE) {
        throw new Error("Production signed-in smoke is read-only and requires at least one seeded watchlist symbol.");
      }
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
    await expect(page.getByRole("navigation")).toBeVisible({ timeout: 15000 });

    await page.goto("/data");
    await expect(page).toHaveURL(/\/data/);
    await expect(page.locator("body")).toContainText(/EOD|coverage|broker import|journal/i, { timeout: 15000 });
    await expectRealDataContext(page, "data status", /EOD|coverage|broker import|journal|Data status/i);
  });
});
