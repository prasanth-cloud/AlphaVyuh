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
      async () =>
        page.locator("canvas").evaluateAll((canvases) =>
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
        ),
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
    for (const path of ["/dashboard", "/scanner", "/watchlist", "/charts/RELIANCE", "/journal", "/alerts", "/settings"]) {
      await page.goto(path);
      await expect(page.locator("body")).toBeVisible();
      await expect(page.getByRole("link", { name: /Demo data|EOD data|Provider data/ })).toBeVisible();
    }

    await page.goto("/charts/RELIANCE");
    await expect(page.getByText("Trendline")).toBeVisible({ timeout: 15000 });
    await expectAnyCanvasHasPixels(page);

    for (const label of ["W", "M", "D"]) {
      await page.getByRole("button", { name: label, exact: true }).click();
      await expectAnyCanvasHasPixels(page);
    }

    for (const label of ["EMA 20", "EMA 50", "RSI"]) {
      await page.getByRole("button", { name: label, exact: true }).click();
      await page.getByRole("button", { name: label, exact: true }).click();
    }

    await page.getByRole("button", { name: /Trendline/ }).last().click();
    await expect(page.getByRole("button", { name: /Trendline/ }).last()).toBeVisible();
  });
});
