import { expect, test } from "@playwright/test";

test.describe("Mock workflow smoke", () => {
  test("scanner shortlist creates a selected watchlist and chart drawing survives reload", async ({ page }) => {
    test.setTimeout(60_000);
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto("/scanner");
    await page.getByRole("button", { name: /^Run scan$/i }).click();
    await expect(page.getByRole("button", { name: /Review later selected/i })).toBeVisible({ timeout: 20_000 });

    await page.locator("tbody input[type=checkbox]").first().check({ force: true });
    await expect(page.getByText("1 selected")).toBeVisible();
    await page.getByRole("button", { name: /Review later selected/i }).click();
    await expect(page.getByText("Review later").first()).toBeVisible();

    await page.getByRole("button", { name: /Create watchlist/i }).first().click();
    await page.getByPlaceholder(/Watchlist name/).fill("Workflow QA");
    await page.getByRole("button", { name: /^Create$/ }).click();

    await expect(page).toHaveURL(/\/watchlist/, { timeout: 15_000 });
    await expect(page.getByText("Workflow QA").first()).toBeVisible();
    await expect(page.getByText(/Focus:/)).toBeVisible();

    await page.goto("/charts/AUBANK?full=1&draw=trendline");
    const overlay = page.getByTestId("chart-drawing-overlay");
    await expect(overlay).toBeVisible({ timeout: 20_000 });
    const box = await overlay.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.65);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.72, box.y + box.height * 0.35);
    await page.mouse.up();

    await expect(page.getByText(/1 visible .* 1 total/)).toBeVisible({ timeout: 10_000 });
    await page.reload();
    await expect(page.getByText(/1 visible .* 1 total/)).toBeVisible({ timeout: 15_000 });

    expect(errors).toEqual([]);
  });
});
