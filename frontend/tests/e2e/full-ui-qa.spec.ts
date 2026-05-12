import { test, expect, type Page } from "@playwright/test";

const EMAIL = process.env.PLAYWRIGHT_QA_EMAIL ?? "alphavyuh.qa.admin@proton.me";
const PASSWORD = process.env.PLAYWRIGHT_QA_PASSWORD ?? "QaPass123x";

async function login(page: Page) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20000 });
}

async function expectNoRuntimeErrors(page: Page, action: () => Promise<void>) {
  const errors: string[] = [];
  page.on("response", (response) => {
    if (response.status() >= 500) errors.push(`${response.status()} ${response.url()}`);
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await action();
  expect(errors.filter((entry) => !entry.includes("favicon"))).toEqual([]);
}

async function expectAnyCanvasHasPixels(page: Page) {
  await expect
    .poll(
      async () => {
        const hasPaintedCanvas = await page.locator("canvas").evaluateAll((canvases) =>
          canvases.some((canvas) => {
            const c = canvas as HTMLCanvasElement;
            if (c.width < 80 || c.height < 80) return false;
            const ctx = c.getContext("2d");
            if (!ctx) return false;
            const sample = ctx.getImageData(0, 0, c.width, c.height).data;
            for (let i = 3; i < sample.length; i += 4) {
              if (sample[i] !== 0) return true;
            }
            return false;
          })
        );
        if (hasPaintedCanvas) return true;

        const hasVisibleChartCanvas = await page.locator("canvas").evaluateAll((canvases) =>
          canvases.some((canvas) => {
            const rect = canvas.getBoundingClientRect();
            return rect.width >= 80 && rect.height >= 80;
          })
        );
        const body = await page.locator("body").innerText();
        return hasVisibleChartCanvas && /Last price:\s*₹/.test(body) && !/Last price:\s*Pending/.test(body);
      },
      { timeout: 20000, intervals: [500, 1000, 2000] }
    )
    .toBeTruthy();
}

test.describe.configure({ mode: "serial" });

test.setTimeout(60000);

test("public landing and auth buttons navigate without runtime errors", async ({ page }) => {
  await expectNoRuntimeErrors(page, async () => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: /Request access/i }).first()).toBeVisible();
    await page.getByRole("link", { name: /Sign in/i }).first().click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/");
    await page.getByRole("link", { name: /Request access/i }).first().click();
    await expect(page).toHaveURL(/\/signup/);
  });
});

test("signed-in app navigation and chart toolbar are functional", async ({ page }) => {
  await login(page);

  await expectNoRuntimeErrors(page, async () => {
    await page.goto("/charts/RELIANCE");
    await expect(page.locator("summary", { hasText: /1D|1W|1M|3M|6M|1Y|3Y|5Y|10Y/ })).toBeVisible({ timeout: 15000 });
    const indicatorsButton = page.locator("button").filter({ hasText: /Indicators|EMA 20|EMA 50|RSI/ }).first();
    await expect(indicatorsButton).toBeVisible();
    await expect(page.getByRole("button", { name: /Tools/ })).toBeVisible();
    await expectAnyCanvasHasPixels(page);

    const timeframeDropdown = page.locator(".chart-timeframe-dropdown").first();
    for (const label of ["1W", "1M", "1D"]) {
      await timeframeDropdown.evaluate((node) => { (node as HTMLDetailsElement).open = true; });
      await timeframeDropdown.getByRole("button", { name: label, exact: true }).click();
      await expectAnyCanvasHasPixels(page);
    }

    await indicatorsButton.click();
    for (const label of ["EMA 20", "EMA 50", "RSI"]) {
      await page.getByRole("button", { name: label, exact: true }).click();
      await page.getByRole("button", { name: label, exact: true }).click();
    }

    await page.getByRole("button", { name: /Tools/ }).click();
    await page.getByRole("button", { name: /Trendline/ }).click();
    await expect(page.getByRole("button", { name: /Tools · Trendline/ })).toBeVisible();

    for (const path of ["/dashboard", "/scanner", "/watchlist", "/journal", "/alerts", "/settings"]) {
      await page.goto(path);
      await expect(page.locator("body")).toBeVisible();
      await expect(page.getByRole("link", { name: /Demo data|Latest session|Provider data/ })).toBeVisible();
    }
  });
});
