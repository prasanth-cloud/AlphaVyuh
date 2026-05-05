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
    await page.getByRole("button", { name: /^Details$/ }).click();
    await expect(page.getByText("Fundamentals")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Mkt cap")).toBeVisible();
    await expect(page.getByText("P/E")).toBeVisible();

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

    await page.getByRole("button", { name: /^Place buy order$/i }).click();
    await expect(page.getByText(/journal capture is ready/i)).toBeVisible({ timeout: 10_000 });

    const localOrder = await page.evaluate(() => {
      const journal = JSON.parse(localStorage.getItem("alphavyuh-mock-journal-v1") || "[]");
      const workflow = JSON.parse(localStorage.getItem("alphavyuh-workflow-state-v1") || "{}");
      return { journal: journal[0], workflow: workflow[journal[0]?.symbol] };
    });
    expect(localOrder.journal).toMatchObject({
      entry_price: 1500,
      quantity: 10,
      stop_loss: 1440,
      target_price: 1650,
      setup_type: "breakout",
      status: "open",
    });
    expect(localOrder.journal.entry_reason).toContain("Thesis: Breakout holding");
    expect(typeof localOrder.journal.symbol).toBe("string");
    expect(localOrder.workflow).toMatchObject({
      lifecycle: "open",
      entry: 1500,
      stop: 1440,
      target: 1650,
      position_size: 10,
      thesis: "Breakout holding above prior resistance with clean volume.",
      invalidation_rule: "Exit if price closes below the breakout base.",
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

  test("risk reward drawing can fill the chart trade plan", async ({ page }) => {
    test.setTimeout(60_000);
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto("/charts/AUBANK?full=1");
    const overlay = page.getByTestId("chart-drawing-overlay");
    await expect(overlay).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: /Long Position/i }).first().click();
    await expect(page.getByText(/Long Position armed/i)).toBeVisible({ timeout: 10_000 });

    const box = await overlay.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    await page.mouse.move(box.x + box.width * 0.34, box.y + box.height * 0.48);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.58, box.y + box.height * 0.66);
    await page.mouse.up();

    await expect(page.getByText(/1 visible .* 1 total/)).toBeVisible({ timeout: 10_000 });
    await page.getByText(/1\. Long Position/).click();
    await expect(page.getByText(/Selected: Long Position/i)).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: /Use as plan/i }).click();
    await expect(page.getByText("Trade plan filled from risk/reward drawing.")).toBeVisible({ timeout: 10_000 });

    await expect(page.getByPlaceholder("Entry")).not.toHaveValue("");
    await expect(page.getByPlaceholder("Stop")).not.toHaveValue("");
    await expect(page.getByPlaceholder("Target")).not.toHaveValue("");

    expect(errors).toEqual([]);
  });

  test("rectangle drawing can create a persisted zone note", async ({ page }) => {
    test.setTimeout(60_000);
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto("/charts/AUBANK?full=1");
    const overlay = page.getByTestId("chart-drawing-overlay");
    await expect(overlay).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: /Zone/i }).first().click();
    await expect(page.getByText(/Zone armed/i)).toBeVisible({ timeout: 10_000 });

    const box = await overlay.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    await page.mouse.move(box.x + box.width * 0.30, box.y + box.height * 0.42);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.58, box.y + box.height * 0.57);
    await page.mouse.up();

    await expect(page.getByText(/1 visible .* 1 total/)).toBeVisible({ timeout: 10_000 });
    await page.getByText(/1\. Zone/).click();
    await expect(page.getByText(/Selected: Zone/i)).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: /Zone note/i }).click();
    await expect(page.getByText(/2 visible .* 2 total/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/2\. Text/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Zone \d+\.\d+-\d+\.\d+/).first()).toBeVisible({ timeout: 10_000 });

    await page.reload();
    await expect(page.getByText(/2 visible .* 2 total/)).toBeVisible({ timeout: 15_000 });

    expect(errors).toEqual([]);
  });

  test("remaining full-chart drawing tools persist after reload", async ({ page }) => {
    test.setTimeout(60_000);
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto("/charts/AUBANK?full=1");
    const overlay = page.getByTestId("chart-drawing-overlay");
    await expect(overlay).toBeVisible({ timeout: 20_000 });
    const box = await overlay.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    const drawSegment = async (
      buttonName: RegExp,
      armedText: RegExp,
      startX: number,
      startY: number,
      endX: number,
      endY: number,
      expectedCount: number,
    ) => {
      await page.getByRole("button", { name: buttonName }).first().click();
      await expect(page.getByText(armedText)).toBeVisible({ timeout: 10_000 });
      await page.mouse.move(box.x + box.width * startX, box.y + box.height * startY);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * endX, box.y + box.height * endY);
      await page.mouse.up();
      await expect(page.getByText(new RegExp(`${expectedCount} visible .* ${expectedCount} total`))).toBeVisible({ timeout: 10_000 });
    };

    await drawSegment(/^Ray\b/i, /Ray armed/i, 0.22, 0.68, 0.58, 0.45, 1);
    await drawSegment(/^Horizontal\b/i, /Horizontal armed/i, 0.18, 0.50, 0.66, 0.50, 2);
    await drawSegment(/^H-Ray\b/i, /H-Ray armed/i, 0.26, 0.38, 0.62, 0.38, 3);
    await drawSegment(/^Fib\b/i, /Fib armed/i, 0.35, 0.72, 0.70, 0.32, 4);
    await drawSegment(/^Short Position\b/i, /Short Position armed/i, 0.42, 0.40, 0.64, 0.24, 5);

    await page.getByRole("button", { name: /^Text\b/i }).first().click();
    await expect(page.getByText(/Text armed/i)).toBeVisible({ timeout: 10_000 });
    await page.mouse.move(box.x + box.width * 0.52, box.y + box.height * 0.55);
    await page.mouse.down();
    await page.mouse.up();
    await expect(page.getByText(/Text Note/)).toBeVisible({ timeout: 10_000 });
    await page.keyboard.press("Escape");
    await expect(page.getByText(/Text Note/)).toBeHidden({ timeout: 10_000 });

    await expect(page.getByText(/6 visible .* 6 total/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/6\. Text/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/^Note$/).first()).toBeVisible({ timeout: 10_000 });

    await page.reload();
    await expect(page.getByText(/6 visible .* 6 total/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/^Note$/).first()).toBeVisible({ timeout: 10_000 });

    expect(errors).toEqual([]);
  });
});
