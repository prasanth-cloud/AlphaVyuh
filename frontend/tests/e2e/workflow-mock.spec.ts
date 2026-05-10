import { expect, test } from "@playwright/test";

test.describe("Mock workflow smoke", () => {
  test("signup first-run flow reaches a focused starter watchlist", async ({ page }) => {
    test.setTimeout(60_000);
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto("/signup");
    await page.getByLabel("Full name").fill("Launch QA Trader");
    await page.getByLabel("Email").fill(`launch-${Date.now()}@alphavyuh.test`);
    await page.getByLabel("Password", { exact: true }).fill("LaunchPass123!");
    await page.getByLabel("Confirm password").fill("LaunchPass123!");
    await page.getByRole("button", { name: /^Create account$/ }).click();

    await expect(page).toHaveURL(/\/onboarding/, { timeout: 15_000 });
    await expect(page.getByText("Set up your private beta desk.")).toBeVisible();

    await page.getByLabel(/Intermediate/).check();
    await page.getByLabel(/Equity/).check();
    await page.getByRole("button", { name: /Continue/i }).click();
    await page.getByRole("button", { name: /None yet/i }).click();
    await page.getByRole("button", { name: /Continue/i }).click();
    await page.getByRole("button", { name: /Starter queue/i }).click();

    await expect(page).toHaveURL(/\/watchlist\?id=.*symbol=RELIANCE/, { timeout: 15_000 });
    await expect(page.locator(".workspace-pill").filter({ hasText: "Focus: RELIANCE" }).first()).toBeVisible({ timeout: 10_000 });

    const starter = await page.evaluate(() => {
      const lists = JSON.parse(localStorage.getItem("alphavyuh-mock-watchlists-v1") || "[]");
      return lists.find((list: { name: string }) => list.name === "Starter setup queue");
    });
    expect(starter.items.map((item: { symbol: string }) => item.symbol)).toEqual(
      expect.arrayContaining(["RELIANCE", "TCS", "INFY"]),
    );
    expect(errors).toEqual([]);
  });

  test("market data provenance is visible across core workflow surfaces", async ({ page }) => {
    test.setTimeout(60_000);
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));

    for (const route of ["/dashboard", "/scanner", "/watchlist", "/charts/AUBANK?full=1", "/data"]) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await expect(page.locator("body")).toContainText(/Demo|Market data|BACKEND DATA|DEMO DATA/i, { timeout: 15_000 });
      await expect(page.locator("body")).toContainText(/As of|Updated|Data is|Source|Provider|coverage|Data: Demo fixtures/i, { timeout: 15_000 });
    }

    await page.goto("/scanner");
    await page.getByRole("button", { name: /^Run scan$/i }).click();
    await expect(page.locator("body")).toContainText(/Trade date|coverage|Demo|AlphaVyuh mock fixtures/i, { timeout: 15_000 });

    await page.goto("/charts/AUBANK?full=1");
    await expect(page.locator("body")).toContainText("AU Small Finance Bank", { timeout: 15_000 });
    await expect(page.locator("body")).toContainText(/Data is .* old|Market data|Demo|As of/i, { timeout: 15_000 });

    expect(errors).toEqual([]);
  });

  test("journal explains review queue and trade source labels", async ({ page }) => {
    await page.goto("/journal", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("journal-review-queue")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("journal-review-queue")).toContainText(/Needs review|No closed trades waiting/i);
    await expect(page.getByTestId("journal-review-queue")).toContainText(/Broker import/);
    await expect(page.getByTestId("journal-review-queue")).toContainText(/Chart\/sim/);
    await expect(page.locator("body")).toContainText(/Trade review|Import from Zerodha|Broker/i, { timeout: 15_000 });
  });

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

    const focusPill = page.locator(".workspace-pill").filter({ hasText: /^Focus:/ }).first();
    const focusSymbol = async () => ((await focusPill.textContent()) ?? "").replace("Focus:", "").trim();
    const initialSymbol = await focusSymbol();
    expect(initialSymbol).toMatch(/^[A-Z0-9]+$/);

    await page.getByRole("button", { name: /^Next/ }).click();
    await expect.poll(focusSymbol).not.toBe(initialSymbol);
    const nextSymbol = await focusSymbol();

    await page.getByRole("button", { name: /Prev$/ }).click();
    await expect.poll(focusSymbol).toBe(initialSymbol);

    await page.keyboard.press("ArrowDown");
    await expect.poll(focusSymbol).toBe(nextSymbol);
    await page.keyboard.press("ArrowUp");
    await expect.poll(focusSymbol).toBe(initialSymbol);

    await page.getByRole("button", { name: /^Order$/ }).click();
    const lockedOrder = page.getByRole("button", { name: /Create a plan before drafting an order|Complete entry/i });
    await expect(lockedOrder).toBeVisible();
    await expect(lockedOrder).toBeDisabled();
    await expect(page.getByRole("button", { name: /^Ready$/ })).toBeDisabled();
    await expect(page.getByTestId("decision-desk-nudges")).toContainText(/Complete entry|Next best action/i);
    await expect(page.getByTestId("order-safety-nudges")).toContainText(/Create a plan|Complete entry|Decision Desk/i);

    await page.getByPlaceholder("Entry").fill("1500");
    await page.getByPlaceholder("Stop").fill("1440");
    await page.getByPlaceholder("Target").fill("1650");
    await page.getByPlaceholder("Qty").fill("10");
    await page.getByPlaceholder("Thesis").fill("Breakout holding above prior resistance with clean volume.");
    await page.getByPlaceholder("Invalidation rule").fill("Exit if price closes below the breakout base.");

    await expect(page.getByText("Ready for order draft.")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("decision-desk-nudges")).toContainText(/Plan ready|Ready for simulated order draft/i);
    await expect(page.getByRole("button", { name: /^Ready$/ })).toBeEnabled();
    await expect(page.getByRole("button", { name: /^Save simulated buy draft$/i })).toBeEnabled();

    await page.getByRole("button", { name: /^Save simulated buy draft$/i }).click();
    await expect(page.getByText(/saved as a simulated journal draft/i)).toBeVisible({ timeout: 10_000 });

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

  test("scanner idea can become a watchlist plan, mock order, and journal draft", async ({ page }) => {
    test.setTimeout(90_000);
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto("/scanner");
    await page.getByRole("button", { name: /^Run scan$/i }).click();
    await expect(page.getByRole("button", { name: /Create watchlist/i }).first()).toBeVisible({ timeout: 20_000 });

    const resultRows = page.locator("tbody tr").filter({ has: page.getByRole("button", { name: /^Shortlist$/ }) });
    await expect(resultRows.first()).toBeVisible({ timeout: 10_000 });
    const symbol = ((await resultRows.first().locator(".mono").first().textContent()) ?? "RELIANCE").trim();

    await resultRows.first().locator("input[type=checkbox]").check({ force: true });
    await expect(page.getByText("1 selected")).toBeVisible();
    await page.getByRole("button", { name: /Shortlist selected/i }).click();
    await expect(resultRows.first().getByText("Shortlisted")).toBeVisible();

    await page.getByRole("button", { name: /Create watchlist/i }).first().click();
    await page.getByPlaceholder(/Watchlist name/).fill("Launch Flow QA");
    await page.getByRole("button", { name: /^Create$/ }).click();

    await expect(page).toHaveURL(/\/watchlist/, { timeout: 15_000 });
    await expect(page.getByText("Launch Flow QA").first()).toBeVisible();
    await expect(page.locator(".workspace-pill").filter({ hasText: `Focus: ${symbol}` }).first()).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: /^Order$/ }).click();
    await expect(page.getByRole("button", { name: /^Ready$/ })).toBeDisabled();
    await page.getByPlaceholder("Entry").fill("1500");
    await page.getByPlaceholder("Stop").fill("1440");
    await page.getByPlaceholder("Target").fill("1650");
    await page.getByPlaceholder("Qty").fill("3");
    await page.getByPlaceholder("Thesis").fill("Launch QA setup from scanner shortlist with clear confirmation.");
    await page.getByPlaceholder("Invalidation rule").fill("Exit if the breakout base fails on closing basis.");

    await expect(page.getByText("Ready for order draft.")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: /^Save simulated buy draft$/i })).toBeEnabled();
    await page.getByRole("button", { name: /^Save simulated buy draft$/i }).click();
    await expect(page.getByText(/saved as a simulated journal draft/i)).toBeVisible({ timeout: 10_000 });

    await page.goto("/journal");
    await expect(page.locator("body")).toContainText(symbol, { timeout: 15_000 });
    await expect(page.locator("body")).toContainText(/Review|Needs review|Open/i, { timeout: 15_000 });

    const state = await page.evaluate((activeSymbol) => {
      const journal = JSON.parse(localStorage.getItem("alphavyuh-mock-journal-v1") || "[]");
      const workflow = JSON.parse(localStorage.getItem("alphavyuh-workflow-state-v1") || "{}");
      return {
        journal: journal.find((entry: { symbol: string }) => entry.symbol === activeSymbol),
        workflow: workflow[activeSymbol],
      };
    }, symbol);
    expect(state.journal).toMatchObject({ symbol, quantity: 3, status: "open" });
    expect(state.workflow).toMatchObject({ lifecycle: "open" });
    expect(["scanner", "watchlist"]).toContain(state.workflow.source);
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

    const resultRows = page.locator("tbody tr").filter({ has: page.getByRole("button", { name: /^Shortlist$/ }) });
    await expect(resultRows.nth(2)).toBeVisible({ timeout: 10_000 });
    const shortlistSymbol = ((await resultRows.nth(0).locator(".mono").first().textContent()) ?? "").trim();
    const ignoredSymbol = ((await resultRows.nth(1).locator(".mono").first().textContent()) ?? "").trim();
    const reviewSymbol = ((await resultRows.nth(2).locator(".mono").first().textContent()) ?? "").trim();

    await resultRows.nth(0).getByRole("button", { name: /^Shortlist$/ }).click();
    await expect(resultRows.nth(0).getByText("Shortlisted")).toBeVisible();
    await resultRows.nth(1).getByRole("button", { name: /^Ignore$/ }).click();
    await expect(resultRows.nth(1).getByText("Ignored")).toBeVisible();

    await resultRows.nth(2).locator("input[type=checkbox]").check({ force: true });
    await expect(page.getByText("1 selected")).toBeVisible();
    await page.getByRole("button", { name: /Review later selected/i }).click();
    await expect(resultRows.nth(2).locator(".caption").filter({ hasText: /^Review later$/ })).toBeVisible();

    const workflowMarks = await page.evaluate(() => JSON.parse(localStorage.getItem("alphavyuh-workflow-state-v1") || "{}"));
    expect(workflowMarks[shortlistSymbol]).toMatchObject({ lifecycle: "idea", source: "scanner" });
    expect(workflowMarks[ignoredSymbol]).toMatchObject({ lifecycle: "ignored", ignored: true, source: "scanner" });
    expect(workflowMarks[reviewSymbol]).toMatchObject({ lifecycle: "review_later", review_later: true, source: "scanner" });

    await resultRows.nth(0).getByLabel(new RegExp(`Add ${shortlistSymbol} to watchlist`)).selectOption({ label: "Leaders" });
    await expect(page.getByText(`${shortlistSymbol} added`)).toBeVisible({ timeout: 10_000 });
    await expect(resultRows.nth(0).getByText("Watching")).toBeVisible({ timeout: 10_000 });
    const leadersWatchlist = await page.evaluate(() => {
      const lists = JSON.parse(localStorage.getItem("alphavyuh-mock-watchlists-v1") || "[]");
      return lists.find((list: { name: string }) => list.name === "Leaders");
    });
    expect(leadersWatchlist.items.some((item: { symbol: string }) => item.symbol === shortlistSymbol)).toBe(true);
    const scannerAddWorkflow = await page.evaluate((symbol) => {
      const workflow = JSON.parse(localStorage.getItem("alphavyuh-workflow-state-v1") || "{}");
      return workflow[symbol];
    }, shortlistSymbol);
    expect(scannerAddWorkflow).toMatchObject({
      lifecycle: "watch",
      source: "scanner",
      watchlist_id: leadersWatchlist.id,
      ignored: false,
      review_later: false,
    });

    await page.goto(`/watchlist?id=${leadersWatchlist.id}&symbol=${shortlistSymbol}`);
    await expect(page.getByText("Decision desk")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(".workspace-pill").filter({ hasText: `Focus: ${shortlistSymbol}` }).first()).toBeVisible({ timeout: 10_000 });
    await page.goto("/scanner");
    await page.getByRole("button", { name: /^Run scan$/i }).click();
    await expect(page.getByRole("button", { name: /Review later selected/i })).toBeVisible({ timeout: 20_000 });

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

    await expect(page.getByText("Drawings · 1")).toBeVisible({ timeout: 10_000 });
    await page.reload();
    await expect(page.getByText("Drawings · 1")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("body")).not.toContainText("Objects");

    expect(errors).toEqual([]);
  });

  test("risk reward drawing stays chart-only with trade plan UI removed", async ({ page }) => {
    test.setTimeout(60_000);
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto("/charts/AUBANK?full=1");
    const overlay = page.getByTestId("chart-drawing-overlay");
    await expect(overlay).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: "Tools ▾", exact: true }).click();
    await page.getByRole("button", { name: "Long Position L", exact: true }).click();
    await expect(page.getByText(/Long Position armed/i)).toBeVisible({ timeout: 10_000 });

    const box = await overlay.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    await page.mouse.move(box.x + box.width * 0.34, box.y + box.height * 0.48);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.58, box.y + box.height * 0.66);
    await page.mouse.up();

    await expect(page.getByText("Drawings · 1")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Selected: Long Position/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: /Use as plan/i })).toHaveCount(0);
    await expect(page.getByText(/Plan entry/i)).toHaveCount(0);
    await expect(page.getByPlaceholder("Entry")).toHaveCount(0);
    await expect(page.getByPlaceholder("Stop")).toHaveCount(0);
    await expect(page.getByPlaceholder("Target")).toHaveCount(0);

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

    await page.getByRole("button", { name: "Tools ▾", exact: true }).click();
    await page.getByRole("button", { name: "Zone Z", exact: true }).click();
    await expect(page.getByText(/Zone armed/i)).toBeVisible({ timeout: 10_000 });

    const box = await overlay.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    await page.mouse.move(box.x + box.width * 0.30, box.y + box.height * 0.42);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.58, box.y + box.height * 0.57);
    await page.mouse.up();

    await expect(page.getByText("Drawings · 1")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Selected: Zone/i)).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: /Zone note/i }).click();
    await expect(page.getByText("Drawings · 2")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Zone \d+\.\d+-\d+\.\d+/).first()).toBeVisible({ timeout: 10_000 });

    await page.reload();
    await expect(page.getByText("Drawings · 2")).toBeVisible({ timeout: 15_000 });

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
      buttonName: string,
      armedText: RegExp,
      startX: number,
      startY: number,
      endX: number,
      endY: number,
      expectedCount: number,
    ) => {
      await page.getByRole("button", { name: "Tools ▾", exact: true }).click();
      await page.getByRole("button", { name: buttonName, exact: true }).click();
      await expect(page.getByText(armedText)).toBeVisible({ timeout: 10_000 });
      await page.mouse.move(box.x + box.width * startX, box.y + box.height * startY);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * endX, box.y + box.height * endY);
      await page.mouse.up();
      await expect(page.getByText(`Drawings · ${expectedCount}`)).toBeVisible({ timeout: 10_000 });
    };

    await drawSegment("Ray R", /Ray armed/i, 0.22, 0.68, 0.58, 0.45, 1);
    await drawSegment("Horizontal H", /Horizontal armed/i, 0.18, 0.50, 0.66, 0.50, 2);
    await drawSegment("Fib F", /Fib armed/i, 0.35, 0.72, 0.70, 0.32, 3);
    await drawSegment("Short Position S", /Short Position armed/i, 0.42, 0.40, 0.64, 0.24, 4);

    await page.getByRole("button", { name: "Tools ▾", exact: true }).click();
    await page.getByRole("button", { name: "Text N", exact: true }).click();
    await expect(page.getByText(/Text armed/i)).toBeVisible({ timeout: 10_000 });
    await page.mouse.move(box.x + box.width * 0.52, box.y + box.height * 0.55);
    await page.mouse.down();
    await page.mouse.up();
    await expect(page.getByText(/Text Note/)).toBeVisible({ timeout: 10_000 });
    await page.keyboard.press("Escape");
    await expect(page.getByText(/Text Note/)).toBeHidden({ timeout: 10_000 });

    await expect(page.getByText("Drawings · 5")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/^Note$/).first()).toBeVisible({ timeout: 10_000 });

    await page.reload();
    await expect(page.getByText("Drawings · 5")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/^Note$/).first()).toBeVisible({ timeout: 10_000 });

    expect(errors).toEqual([]);
  });
});
