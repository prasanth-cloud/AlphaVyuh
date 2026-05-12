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

    await expect(page.getByText("Drawings · 1")).toBeVisible({ timeout: 10000 });
    await page.reload();
    await expect(page.getByText("Drawings · 1")).toBeVisible({ timeout: 15000 });
  });

  test("full chart uses compact tools, timeframe, and indicators controls", async ({ page }) => {
    await login(page);
    await page.goto("/charts/SMARTWORKS?full=1");
    await expect(page.getByTestId("chart-drawing-overlay")).toBeVisible({ timeout: 20000 });

    await expect(page.locator("body")).not.toContainText("Objects");
    await expect(page.locator("body")).not.toContainText("Plan entry");
    await expect(page.locator("body")).not.toContainText("Range %");
    await expect(page.locator("body")).not.toContainText("Vol ratio");
    await expect(page.getByRole("button", { name: /^Draw$/ })).toHaveCount(0);

    await page.getByRole("button", { name: "Tools ▾", exact: true }).click();
    for (const tool of [
      "Trendline T",
      "Horizontal line H",
      "H-Ray J",
      "Ray R",
      "Rectangle / zone Z",
      "Fibonacci retracement F",
      "Text note N",
      "Long position L",
      "Short position S",
      "Price alert",
      "Magnet / snap On",
    ]) {
      await expect(page.getByRole("button", { name: tool, exact: true })).toBeVisible();
    }
    await page.getByRole("button", { name: "Magnet / snap On", exact: true }).click();
    await expect(page.getByRole("button", { name: "Magnet / snap Off", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Magnet / snap Off", exact: true }).click();
    await page.getByRole("button", { name: /Trendline/ }).click();
    await expect(page.getByText(/Trendline armed/)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByText(/Trendline armed/)).toHaveCount(0);

    await page.getByRole("button", { name: "Tools ▾", exact: true }).click();
    await page.getByRole("button", { name: "Trendline T", exact: true }).click();
    const overlay = page.getByTestId("chart-drawing-overlay");
    const box = await overlay.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.62);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.36);
      await page.mouse.up();
      await expect(page.getByText("Drawings · 1")).toBeVisible({ timeout: 10000 });
      await page.keyboard.press("Delete");
      await expect(page.getByText("Drawings · 1")).toHaveCount(0);
    }

    await page.locator(".chart-timeframe-dropdown summary").click();
    for (const tf of ["5m", "15m", "30m", "1h", "1D", "1W", "1M", "3M", "6M", "1Y", "3Y", "5Y", "10Y"]) {
      await expect(page.getByRole("button", { name: tf, exact: true })).toBeVisible();
    }
    await expect(page.getByText("Intraday data is not available in this beta.")).toBeVisible();
    await page.getByRole("button", { name: "5m", exact: true }).click({ force: true });
    await expect(page.getByText(/Intraday data is not available/).first()).toBeVisible();

    await page.locator(".chart-timeframe-dropdown summary").click();
    await page.getByRole("button", { name: /EMA 20/ }).click();
    await expect(page.getByRole("button", { name: "EMA 200" })).toBeVisible();
    await expect(page.getByRole("button", { name: "SMA 50" })).toBeVisible();
    await page.getByRole("button", { name: "EMA 200" }).click();
    await expect(page.getByRole("button", { name: "Indicators · 3 ▾", exact: true })).toBeVisible();
  });

  test("full chart preserves selected chart type across symbols", async ({ page }) => {
    await login(page);
    await page.goto("/charts/SMARTWORKS?full=1&type=bars");
    await expect(page.getByTestId("chart-drawing-overlay")).toBeVisible({ timeout: 20000 });
    const chartTypeSelect = page.locator("select").filter({ has: page.locator("option[value='bars']") }).first();
    await expect(chartTypeSelect).toHaveValue("bars");

    await page.goto("/charts/AUBANK?full=1");
    await expect(page.getByTestId("chart-drawing-overlay")).toBeVisible({ timeout: 20000 });
    await expect(chartTypeSelect).toHaveValue("bars");
  });
});
