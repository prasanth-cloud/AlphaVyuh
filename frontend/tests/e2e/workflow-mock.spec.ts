import { expect, test } from "@playwright/test";

test.describe("Mock workflow smoke", () => {
  test("watchlist plan gates ready state and order draft", async ({ page }) => {
    test.setTimeout(60_000);
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto("/watchlist");
    await expect(page.getByText("Decision desk")).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: /^Order$/ }).click();
    const lockedOrder = page.getByRole("button", { name: /Create a plan before drafting an order|Complete entry/i });
    await expect(lockedOrder).toBeVisible();
    await expect(lockedOrder).toBeDisabled();
    await expect(page.getByRole("button", { name: /^Ready$/ })).toBeDisabled();

    await page.getByPlaceholder("Entry").fill("1500");
    await page.getByPlaceholder("Stop").fill("1440");
    await page.getByPlaceholder("Target").fill("1650");
    await page.getByPlaceholder("Qty").fill("10");
    await page.getByPlaceholder("Thesis").fill("Breakout holding above prior resistance with clean volume.");
    await page.getByPlaceholder("Invalidation rule").fill("Exit if price closes below the breakout base.");

    await expect(page.getByText("Ready for order draft.")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: /^Ready$/ })).toBeEnabled();
    await expect(page.getByRole("button", { name: /^Place buy order$/i })).toBeEnabled();

    let orderPayload: Record<string, unknown> | null = null;
    await page.route("**/api/v1/orders", async (route) => {
      orderPayload = route.request().postDataJSON();
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          status: "filled",
          message: "Mock order placed",
          journal_id: "journal-1",
          symbol: orderPayload?.symbol,
          side: orderPayload?.side,
          quantity: orderPayload?.quantity,
          price: orderPayload?.price,
          broker: "simulated",
          broker_order_id: null,
          journal_status: "open",
        }),
      });
    });
    await page.getByRole("button", { name: /^Place buy order$/i }).click();
    await expect(page.getByText(/journal capture is ready/i)).toBeVisible({ timeout: 10_000 });
    expect(orderPayload).toMatchObject({
      source_page: "watchlist",
      stop_loss: 1440,
      target_price: 1650,
      setup_type: "breakout",
      thesis: "Breakout holding above prior resistance with clean volume.",
      invalidation_rule: "Exit if price closes below the breakout base.",
      quantity: 10,
      price: 1500,
    });

    expect(errors).toEqual([]);
  });

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
    await expect(page.getByText(/Trendline armed/i)).toBeVisible({ timeout: 10_000 });
    await page.keyboard.press("Escape");
    await expect(page.getByText(/Trendline armed/i)).toBeHidden();
    await page.keyboard.press("T");
    await expect(page.getByText(/Trendline armed/i)).toBeVisible({ timeout: 10_000 });
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

    await page.getByText(/1\. Trendline/).click();
    await expect(page.getByText(/Selected: Trendline/i)).toBeVisible({ timeout: 10_000 });
    await page.keyboard.press("Delete");
    await expect(page.getByText(/0 visible .* 0 total/)).toBeVisible({ timeout: 10_000 });
    await page.reload();
    await expect(page.getByText(/0 visible .* 0 total/)).toBeVisible({ timeout: 15_000 });

    expect(errors).toEqual([]);
  });
});
