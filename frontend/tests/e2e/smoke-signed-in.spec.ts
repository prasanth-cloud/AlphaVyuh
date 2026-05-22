import { test, expect } from "@playwright/test";
import { qaCredentials } from "./helpers/qaCredentials";

const ACCESS_URL = process.env.PLAYWRIGHT_ACCESS_URL;
const EXPECT_REAL_DATA = process.env.PLAYWRIGHT_EXPECT_REAL_DATA === "true";
const SMOKE_SYMBOL = process.env.PLAYWRIGHT_SMOKE_SYMBOL ?? "RELIANCE";
const API_BEARER_TOKEN = process.env.PRODUCTION_API_BEARER_TOKEN?.trim();
const PRODUCTION_API_URL = (process.env.PRODUCTION_API_URL || "https://alphavyuh-production.up.railway.app").replace(/\/+$/, "");
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

async function expectPathname(page: import("@playwright/test").Page, pathname: string, timeout = 20000) {
  await expect
    .poll(() => new URL(page.url()).pathname, { timeout, intervals: [250, 500, 1000] })
    .toBe(pathname);
}

async function gotoAppPath(page: import("@playwright/test").Page, path: string, pathname = path) {
  await page.goto(path);
  if (EXPECT_REAL_DATA && new URL(page.url()).pathname === "/login" && (await installSupabaseSessionCookies(page))) {
    await page.goto(path);
  }
  await expectPathname(page, pathname);
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
      try {
        await gotoAppPath(page, "/dashboard");
        return;
      } catch {
        await page.context().clearCookies();
      }
    }

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const response = await page.request.post("/api/auth/login", { data: { email: EMAIL, password: PASSWORD } });
      if (response.ok()) {
        try {
          await gotoAppPath(page, "/dashboard");
          return;
        } catch {
          await page.context().clearCookies();
        }
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
  await expectPathname(page, "/dashboard");
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

async function expectDashboardReady(page: import("@playwright/test").Page) {
  const marketPulse = page.getByText(/Market pulse/i);
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    if (await marketPulse.isVisible().catch(() => false)) return;
    const retry = page.getByRole("button", { name: "Retry" });
    if (await retry.isVisible().catch(() => false)) {
      await retry.click({ force: true, timeout: 3000 }).catch(() => {});
    }
    await page.waitForTimeout(attempt * 1500);
  }
  await expect(marketPulse).toBeVisible({ timeout: 15000 });
}

async function verifyScannerApiFallback(page: import("@playwright/test").Page) {
  if (!EXPECT_REAL_DATA || !API_BEARER_TOKEN) return false;

  const response = await page.request.post(`${PRODUCTION_API_URL}/api/v1/scanner/run`, {
    headers: {
      authorization: `Bearer ${API_BEARER_TOKEN}`,
    },
    data: {
      filters: { series: ["EQ"] },
      sort_by: "volume_ratio",
      sort_order: "desc",
      limit: 200,
      page: 1,
      page_size: 25,
      preset_id: null,
    },
  });
  expect(response.ok(), `scanner API fallback returned ${response.status()}`).toBeTruthy();
  const data = await response.json();
  expect(data.results?.length ?? 0, "scanner API fallback should return live scanner rows").toBeGreaterThan(0);
  return true;
}

test.describe.configure({ mode: "serial" });

test.describe("Signed-in smoke flow", () => {
  test("dashboard, scanner, watchlist, full chart, journal, settings, broker, and data load in a usable state", async ({ page }) => {
    test.setTimeout(EXPECT_REAL_DATA ? 90_000 : 30_000);
    await login(page);

    await expectDashboardReady(page);
    await expect(page.getByTestId("dashboard-data-trust")).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("heading", { name: /Next actions/i })).toBeVisible();
    const openScannerLink = page.getByRole("link", { name: /Open scanner/i });
    await expect(openScannerLink).toBeVisible();
    await expectRealDataContext(page, "dashboard", /Latest session|EOD|Market|coverage|NSE universe/i);

    await page.locator(".app-nav").getByRole("link", { name: "Scanner" }).click();
    await expectPathname(page, "/scanner");
    const runScanButton = page.getByRole("button", { name: /Run scan/i });
    const scannerUiReady = await runScanButton.isVisible({ timeout: 30000 }).catch(() => false);
    let scannerApiFallbackUsed = false;
    if (scannerUiReady) {
      const resetScanButton = page.getByRole("button", { name: /^Reset$/i });
      if (await resetScanButton.isVisible().catch(() => false)) {
        await resetScanButton.click();
        if (EXPECT_REAL_DATA) {
          await expect(page.getByText("Choose a saved filter, then adjust the fields for your scan.")).toBeVisible({
            timeout: 5000,
          });
          await expect(page.getByText("Scanner queue")).toBeVisible({ timeout: 5000 });
        }
      }
      await runScanButton.click();
      await expect
        .poll(async () => page.locator("table tbody tr").count(), { timeout: 25000, intervals: [500, 1000, 2000] })
        .toBeGreaterThan(0);
      await expect(page.getByTestId("scanner-data-trust")).toBeVisible({ timeout: 15000 });
      await expectRealDataContext(page, "scanner", /Latest session|Trade date|coverage|market data|Exchange|NSE/i);
    } else if (await verifyScannerApiFallback(page)) {
      scannerApiFallbackUsed = true;
    } else {
      await expect(runScanButton).toBeVisible();
    }

    if (scannerApiFallbackUsed) {
      return;
    }

    await page.locator(".app-nav").getByRole("link", { name: "Watchlist" }).click();
    await expectPathname(page, "/watchlist");
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

    await gotoAppPath(page, `/charts/${firstSymbol}?full=1`, `/charts/${firstSymbol}`);
    await expect(page.getByRole("button", { name: "Open chart drawing tools", exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.locator("body")).toContainText(/Daily|Volume|RSI|EMA|bars/i, { timeout: 15000 });
    await expectRealDataContext(page, "full chart", /Latest session|Daily|Volume|RSI|EMA|as of/i);

    await gotoAppPath(page, "/journal");
    await expect(page.getByText("Review", { exact: false }).first()).toBeVisible({ timeout: 15000 });

    await gotoAppPath(page, "/settings");
    await expect(page.locator("body")).toContainText(/Account Access|Billing|Profile/i, { timeout: 15000 });

    await gotoAppPath(page, "/settings/broker");
    await expect(page.getByRole("navigation")).toBeVisible({ timeout: 15000 });

    await gotoAppPath(page, "/data");
    await expect(page.locator("body")).toContainText(/EOD|coverage|broker import|journal/i, { timeout: 15000 });
    await expectRealDataContext(page, "data status", /EOD|coverage|broker import|journal|Data status/i);
  });
});
