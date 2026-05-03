import { test, expect } from "@playwright/test";

const EMAIL = process.env.PLAYWRIGHT_QA_EMAIL ?? "alphavyuh.qa.admin@proton.me";
const PASSWORD = process.env.PLAYWRIGHT_QA_PASSWORD ?? "QaPass123x";
const ACCESS_URL = process.env.PLAYWRIGHT_ACCESS_URL;

async function login(page: import("@playwright/test").Page) {
  await page.context().clearCookies();
  if (ACCESS_URL) await page.goto(ACCESS_URL);
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20000 });
}

test.describe("Full chart drawings", () => {
  test("draws a trendline on AUBANK and keeps it after reload", async ({ page }) => {
    await login(page);
    await page.goto("/charts/AUBANK?full=1&draw=trendline");

    const overlay = page.getByTestId("chart-drawing-overlay");
    await expect(overlay).toBeVisible({ timeout: 20000 });
    const box = await overlay.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.65);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.72, box.y + box.height * 0.35);
    await page.mouse.up();

    await expect(page.getByText(/1 visible .* 1 total/)).toBeVisible({ timeout: 10000 });
    await page.reload();
    await expect(page.getByText(/1 visible .* 1 total/)).toBeVisible({ timeout: 15000 });
  });
});
