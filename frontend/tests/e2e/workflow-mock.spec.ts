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
    await expect(page.getByRole("heading", { name: /Set up your trading desk/i })).toBeVisible();

    await page.getByLabel(/Intermediate/).check();
    await page.getByLabel(/cash equities/i).check();
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

  test("watchlist id-only route auto-focuses the top priority symbol", async ({ page }) => {
    test.setTimeout(60_000);
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));

    await page.addInitScript(() => {
      localStorage.setItem("alphavyuh-mock-watchlists-v1", JSON.stringify([
        {
          id: "priority-queue",
          name: "Priority queue",
          sort_order: 0,
          created_at: "2026-05-20T00:00:00.000Z",
          items: [
            {
              symbol: "TCS",
              sort_order: 0,
              added_at: "2026-05-20T00:00:00.000Z",
              company_name: "Tata Consultancy Services",
              sector: "IT",
              pinned: false,
              tags: [],
              note: "Lower priority setup",
              close: 3800,
              pct_change: 0.1,
              volume_ratio: 0.9,
              rsi_14: 48,
            },
            {
              symbol: "AUBANK",
              sort_order: 1,
              added_at: "2026-05-20T00:00:00.000Z",
              company_name: "AU Small Finance Bank",
              sector: "Banks",
              pinned: true,
              tags: ["priority"],
              note: "Ready from chart handoff",
              close: 700,
              pct_change: 2.6,
              volume_ratio: 2.1,
              rsi_14: 62,
            },
          ],
        },
      ]));
      localStorage.setItem("alphavyuh-workflow-state-v1", JSON.stringify({
        AUBANK: {
          symbol: "AUBANK",
          watchlist_id: "priority-queue",
          lifecycle: "ready",
          source: "watchlist",
          setup_type: "breakout",
          entry: 700,
          stop: 675,
          target: 755,
          position_size: 10,
          timeframe: "D",
          thesis: "Priority setup with chart packet.",
          invalidation_rule: "Invalidate below 675.",
          confidence: 4,
          setup_quality: 4,
          tags: ["chart-plan", "long"],
        },
      }));
    });

    await page.goto("/watchlist?id=priority-queue", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".workspace-pill").filter({ hasText: "Focus: AUBANK" }).first()).toBeVisible({ timeout: 15_000 });

    const selectedActions = page.locator(".workspace-pill-row").filter({ has: page.getByRole("button", { name: "Review journal" }) });
    await expect(selectedActions).toContainText(/Open chart/);
    await expect(selectedActions).toContainText(/Review journal/);
    await expect(selectedActions).toContainText(/Details/);
    await expect(page.getByText("Plan ready")).toBeVisible();
    await expect(page.getByRole("button", { name: "Full chart" }).first()).toBeVisible();
    const labels = await selectedActions.locator("button").evaluateAll((nodes) =>
      nodes.map((node) => node.textContent?.replace(/\s+/g, " ").trim()).filter(Boolean),
    );
    expect(labels).toEqual(["Open chart", "Review journal", "Details"]);
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
      if (route === "/dashboard") {
        await expect(page.getByTestId("dashboard-workflow-command-center")).toContainText(/Dashboard|Market\/data status|Scan alert matches|Watchlist review|Journal review debt|Broker import status/i);
      }
    }

    await page.goto("/scanner");
    await page.getByRole("button", { name: /^Run scan$/i }).click();
    await expect(page.locator("body")).toContainText(/Trade date|coverage|Demo|AlphaVyuh mock fixtures/i, { timeout: 15_000 });

    await page.goto("/charts/AUBANK?full=1");
    await expect(page.locator("body")).toContainText("AU Small Finance Bank", { timeout: 15_000 });
    await expect(page.locator("body")).toContainText(/Data is .* old|Market data|Demo|As of/i, { timeout: 15_000 });

    expect(errors).toEqual([]);
  });

  test("scanner recent runs can restore a setup review", async ({ page }) => {
    test.setTimeout(60_000);
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto("/scanner");
    await page.getByRole("button", { name: /^Run scan$/i }).click();
    await expect(page.locator(".scanner-row-actions").first()).toBeVisible({ timeout: 20_000 });

    const firstSymbol = ((await page.locator("tbody tr").first().locator(".mono").first().textContent()) ?? "").trim();
    await expect(page.getByTestId("scanner-run-history")).toContainText(/Trend Template|Custom scan/, { timeout: 10_000 });
    await expect(page.getByTestId("scanner-run-history")).toContainText(/AlphaVyuh mock fixtures|Demo/i);

    await page.evaluate(() => sessionStorage.removeItem("alphavyuh-scanner-last-results-v1"));
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("scanner-run-history")).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("scanner-run-history-entry").first().click();

    await expect(page.locator(".scanner-results-toolbar")).toContainText(/Cached results/i, { timeout: 10_000 });
    await expect(page.locator("tbody tr").first()).toContainText(firstSymbol, { timeout: 10_000 });

    const history = await page.evaluate(() => JSON.parse(localStorage.getItem("alphavyuh-scanner-run-history-v1") || "[]"));
    expect(history[0]).toMatchObject({
      dataSource: expect.stringMatching(/AlphaVyuh mock fixtures|Demo/i),
      topSymbols: expect.arrayContaining([firstSymbol]),
    });
    expect(history[0].label).toMatch(/Trend Template|Custom scan/);
    expect(history[0].results.length).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  test("multi-chart review board compares scanner candidates", async ({ page }) => {
    test.setTimeout(60_000);
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));

    await page.addInitScript(() => {
      localStorage.setItem("alphavyuh-workflow-state-v1", JSON.stringify({
        RELIANCE: {
          symbol: "RELIANCE",
          lifecycle: "idea",
          source: "scanner",
          notes: "Scanner: High confidence",
          tags: ["setup-a"],
          scanner_context: {
            source: "scanner",
            preset_id: "trend-template",
            preset_name: "Trend Template",
            match_reasons: ["All moving averages aligned with 52W proximity."],
            confidence_reasons: ["RS and volume confirmed."],
            data_warnings: ["Sector taxonomy pending NSE audit."],
            setup_score: 86,
            setup_grade: "A",
            confidence_label: "High confidence",
            rs_score: 86,
            price_perf_6m_pct: 32.4,
            week_52_high_pct: 5,
            volume_ratio: 1.8,
            rsi_14: 62.4,
            scan_trade_date: "2026-05-07",
            data_source: "NSE bhavcopy",
            data_mode: "eod",
            data_as_of: "2026-05-07",
            captured_at: "2026-05-07T12:00:00.000Z",
          },
        },
      }));
    });
    await page.goto("/charts?symbols=RELIANCE,INFY,TCS,HDFCBANK&from=scanner", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("multi-chart-review-board")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("multi-chart-card-RELIANCE")).toContainText("RELIANCE", { timeout: 15_000 });
    await expect(page.getByTestId("multi-chart-card-INFY")).toContainText("INFY", { timeout: 15_000 });
    await expect(page.locator("body")).toContainText(/Scanner review|Source:|As of|loaded/i, { timeout: 15_000 });
    await expect(page.getByTestId("multi-chart-board-pulse")).toContainText(/Best candidate|Board score|Top blocker/i, { timeout: 15_000 });
    await expect(page.getByTestId("multi-chart-board-pulse")).toContainText(/RELIANCE|avg|5Y daily context/i);
    await expect(page.getByTestId("multi-chart-analysis-RELIANCE")).toContainText(/Analysis context|W\/M|52W|MA|Volume|RSI/i, { timeout: 15_000 });
    await expect(page.getByTestId("multi-chart-analysis-RELIANCE")).toContainText(/Weekly\/monthly|Moving averages/i);
    await expect(page.getByTestId("multi-chart-scanner-context-RELIANCE")).toContainText(/Original scan|Trend Template|RS|Volume/i);
    await expect(page.getByTestId("multi-chart-scanner-context-RELIANCE")).toContainText("All moving averages aligned with 52W proximity.");
    await expect(page.getByTestId("multi-chart-scanner-context-RELIANCE")).toContainText("Sector taxonomy pending NSE audit.");
    await page.getByTestId("multi-chart-copy-review-summary").click();
    await expect(page.locator("body")).toContainText(/Review notes copied|AlphaVyuh review board/i);
    await page.getByRole("button", { name: "5Y" }).click();
    await expect(page.getByRole("button", { name: "5Y" })).toHaveClass(/active/);
    await page.getByRole("button", { name: "Max", exact: true }).click();
    await expect(page.getByRole("button", { name: "Max", exact: true })).toHaveClass(/active/);
    await expect(page.getByTestId("multi-chart-layout-4-up")).toHaveClass(/active/);
    await page.getByTestId("multi-chart-layout-2-up").click();
    await expect(page.getByTestId("multi-chart-layout-2-up")).toHaveClass(/active/);
    await expect(page.getByRole("link", { name: "Share board" })).toHaveAttribute("href", /layout=2-up/);
    await page.getByTestId("multi-chart-card-RELIANCE").getByRole("button", { name: "Ready" }).click();
    await expect(page.getByTestId("multi-chart-card-RELIANCE")).toContainText(/Decision: ready/i);
    await expect(page.locator("body")).toContainText(/RELIANCE marked Ready/i);
    await expect(page.getByRole("link", { name: "Full chart" }).first()).toHaveAttribute("href", /\/charts\/RELIANCE\?full=1&from=scanner/);
    const reviewState = await page.evaluate(() => {
      const workflow = JSON.parse(localStorage.getItem("alphavyuh-workflow-state-v1") || "{}");
      return workflow.RELIANCE;
    });
    expect(reviewState.scanner_context.preset_name).toBe("Trend Template");
    expect(reviewState.notes).toContain("Original scan Trend Template");
    expect(reviewState.notes).toContain("All moving averages aligned with 52W proximity.");

    await page.getByTestId("multi-chart-symbol-import").fill("NSE:ITC\nNSE:AUBANK\nreliance\nITC");
    await page.getByTestId("multi-chart-open-imported").click();
    await expect(page).toHaveURL(/symbols=ITC%2CAUBANK%2CRELIANCE/);
    await expect(page).toHaveURL(/from=manual/);
    await expect(page.getByTestId("multi-chart-card-ITC")).toContainText("ITC", { timeout: 15_000 });
    await expect(page.getByTestId("multi-chart-card-AUBANK")).toContainText("AUBANK", { timeout: 15_000 });
    await expect(page.getByTestId("multi-chart-card-RELIANCE")).toContainText("RELIANCE", { timeout: 15_000 });

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

  test("uploaded trade report can be handed off to journal review without duplicates", async ({ page }) => {
    test.setTimeout(60_000);
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto("/upload", { waitUntil: "domcontentloaded" });
    const sampleReportButton = page.getByRole("button", { name: /^Use sample report$/i });
    await expect(sampleReportButton).toBeVisible({ timeout: 10_000 });
    await expect.poll(async () => {
      if (await page.getByText("Journal-ready").isVisible().catch(() => false)) return true;
      await sampleReportButton.click().catch(() => {});
      return page.getByText("Journal-ready").isVisible().catch(() => false);
    }, { timeout: 10_000 }).toBe(true);
    await page.getByRole("button", { name: /^Analyze report$/i }).first().click();
    await expect(page.getByTestId("trade-report-quality")).toContainText(/Expectancy|Payoff ratio|Avg hold/i);
    await expect(page.getByTestId("trade-report-quality")).toContainText(/AUBANK|TCS|4\.8 days/i);
    await expect(page.getByTestId("trade-report-risk-audit")).toContainText(/Reported charges|Cost drag|Top symbol/i);
    await expect(page.getByTestId("trade-report-risk-audit")).toContainText(/AUBANK|6\.7%|45\.5%/i);
    await page.getByTestId("trade-report-journal-import").click();
    await expect(page.getByTestId("trade-report-journal-import-result")).toContainText(/Imported 4 trade/i, { timeout: 15_000 });

    await page.getByTestId("trade-report-journal-import").click();
    await expect(page.getByTestId("trade-report-journal-import-result")).toContainText(/already imported|skipped 4/i, { timeout: 15_000 });

    await page.goto("/journal?review=needs-review", { waitUntil: "domcontentloaded" });
    await expect(page.locator("tbody tr").filter({ hasText: "RELIANCE" })).toContainText("Broker import", { timeout: 15_000 });
    await page.locator("tbody tr").filter({ hasText: "RELIANCE" }).first().click();
    await expect(page.getByTestId("journal-original-idea")).toContainText(/Broker report|Imported from Generic broker CSV/i, { timeout: 10_000 });

    const imported = await page.evaluate(() => {
      const journal = JSON.parse(localStorage.getItem("alphavyuh-mock-journal-v1") || "[]");
      return journal.filter((entry: { entry_reason?: string }) => entry.entry_reason?.includes("alphavyuh-report-import"));
    });
    expect(imported).toHaveLength(4);
    expect(imported.every((entry: { status: string }) => entry.status === "closed")).toBe(true);
    expect(errors).toEqual([]);
  });

  test("journal review lesson can be saved and survives reload", async ({ page }) => {
    test.setTimeout(60_000);
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));

    await page.addInitScript(() => {
      if (localStorage.getItem("alphavyuh-mock-journal-v1")) return;
      localStorage.setItem("alphavyuh-mock-journal-v1", JSON.stringify([{
        id: "review-save-1",
        user_id: "mock-user",
        symbol: "HDFCBANK",
        company_name: "HDFC Bank",
        trade_type: "long",
        setup_type: "breakout",
        entry_date: "2026-05-01",
        entry_price: 1500,
        quantity: 10,
        exit_date: "2026-05-08",
        exit_price: 1535,
        pnl: 350,
        pnl_pct: 2.3333,
        holding_days: 7,
        stop_loss: 1440,
        target_price: 1650,
        risk_reward: 2.5,
        entry_reason: "Original idea: enter only after volume confirmation above the pivot.",
        exit_reason: "Exited after momentum faded.",
        mistakes: null,
        lessons: null,
        status: "closed",
        source_page: "watchlist",
        source_context: "Review QA",
        scanner_context: { source: "scanner", preset_name: "Trend Template", match_reasons: ["Volume expansion"], data_as_of: "2026-05-01" },
        thesis: "Breakout should hold above the pivot with volume.",
        invalidation_rule: "Close below the base.",
        created_at: "2026-05-01T09:30:00Z",
        updated_at: "2026-05-08T15:30:00Z",
      }]));
    });

    await page.goto("/journal?review=needs-review", { waitUntil: "domcontentloaded" });
    await expect(page.locator("tbody tr").filter({ hasText: "HDFCBANK" })).toBeVisible({ timeout: 15_000 });
    await page.locator("tbody tr").filter({ hasText: "HDFCBANK" }).click();
    await expect(page.getByTestId("journal-original-idea")).toContainText(/Original scan|Original thesis/i, { timeout: 10_000 });
    await expect(page.getByText("Save one process lesson")).toBeVisible();
    await page.getByPlaceholder(/Wait for volume confirmation/i).fill("Wait for volume confirmation before entering the breakout.");
    await page.getByRole("button", { name: "Save review" }).click();
    await expect(page.getByText("Review saved")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Trade lesson")).toBeVisible();
    await expect(page.getByText("Wait for volume confirmation before entering the breakout.")).toBeVisible();

    const saved = await page.evaluate(() => {
      const journal = JSON.parse(localStorage.getItem("alphavyuh-mock-journal-v1") || "[]");
      return journal.find((entry: { id: string }) => entry.id === "review-save-1");
    });
    expect(saved.lessons).toBe("Wait for volume confirmation before entering the breakout.");

    await page.goto("/journal?review=reviewed", { waitUntil: "domcontentloaded" });
    await expect(page.locator("tbody tr").filter({ hasText: "HDFCBANK" })).toContainText("Reviewed", { timeout: 15_000 });
    await page.reload();
    await expect(page.locator("tbody tr").filter({ hasText: "HDFCBANK" })).toContainText("Reviewed", { timeout: 15_000 });

    expect(errors).toEqual([]);
  });

  test("watchlist plan gates ready state and order draft", async ({ page }) => {
    test.setTimeout(60_000);
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));

    await page.addInitScript(() => {
      localStorage.setItem("alphavyuh-mock-watchlists-v1", JSON.stringify([
        {
          id: "mock-leaders",
          name: "Leaders",
          sort_order: 0,
          created_at: "2026-04-20T09:15:00Z",
          items: [
            { symbol: "RELIANCE", sort_order: 0, added_at: "2026-04-20T09:15:00Z", company_name: "Reliance Industries", sector: "Energy", close: 1327.8, pct_change: -1.16, volume_ratio: 1.1, rsi_14: 48, pinned: false, tags: [], note: null },
            { symbol: "AUBANK", sort_order: 1, added_at: "2026-04-20T09:15:00Z", company_name: "AU Small Finance Bank", sector: "Banks", close: 694.35, pct_change: 1.42, volume_ratio: 1.4, rsi_14: 61, pinned: false, tags: [], note: null },
            { symbol: "TCS", sort_order: 2, added_at: "2026-04-20T09:15:00Z", company_name: "Tata Consultancy Services", sector: "IT Services", close: 3824, pct_change: 0.55, volume_ratio: 0.9, rsi_14: 53, pinned: false, tags: [], note: null },
          ],
        },
      ]));
    });
    await page.goto("/watchlist?id=mock-leaders");
    await expect(page.getByText("Decision desk")).toBeVisible({ timeout: 20_000 });
    const seededWatchlist = await page.evaluate(() => {
      const lists = JSON.parse(localStorage.getItem("alphavyuh-mock-watchlists-v1") || "[]");
      return lists.find((list: { name: string }) => list.name === "Leaders");
    });
    expect(seededWatchlist.items.map((item: { symbol: string }) => item.symbol)).toEqual(
      expect.arrayContaining(["RELIANCE", "AUBANK", "TCS"]),
    );
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
    await expect(page.getByTestId("decision-desk-nudges")).toContainText(/Complete entry|Next workflow step/i);
    await expect(page.getByTestId("order-safety-nudges")).toContainText(/Create a plan|Complete entry|Decision Desk/i);

    await page.getByPlaceholder("Entry").fill("1500");
    await page.getByPlaceholder("Stop").fill("1440");
    await page.getByPlaceholder("Target").fill("1650");
    await page.getByPlaceholder("Qty").fill("10");
    await page.getByPlaceholder("Thesis").fill("Breakout holding above prior resistance with clean volume.");
    await page.getByPlaceholder("Invalidation rule").fill("Exit if price closes below the breakout base.");

    await expect(page.getByText("Ready for order draft.")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("decision-desk-nudges")).toContainText(/Plan ready|Ready for journal capture draft/i);
    await expect(page.getByRole("button", { name: /^Ready$/ })).toBeEnabled();
    await expect(page.getByRole("button", { name: /^Save buy journal draft$/i })).toBeEnabled();

    await page.getByRole("button", { name: /^Save buy journal draft$/i }).click();
    await expect(page.getByText(/saved as a journal capture draft/i)).toBeVisible({ timeout: 10_000 });

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

    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", {
        value: {
          writeText: async (text: string) => {
            localStorage.setItem("alphavyuh-test-clipboard", text);
          },
        },
        configurable: true,
      });
    });
    await page.goto("/scanner");
    await page.getByRole("button", { name: /^Run scan$/i }).click();
    await expect(page.getByRole("button", { name: /Create watchlist/i }).first()).toBeVisible({ timeout: 20_000 });

    const resultRows = page.locator("tbody tr").filter({ has: page.getByRole("button", { name: /^Shortlist$/ }) });
    await expect(resultRows.first()).toBeVisible({ timeout: 10_000 });
    const symbol = ((await resultRows.first().locator(".mono").first().textContent()) ?? "RELIANCE").trim();

    await resultRows.first().locator("input[type=checkbox]").check({ force: true });
    await expect(page.getByText("1 selected")).toBeVisible();
    await page.locator(".scanner-results-toolbar").getByRole("button", { name: /^Copy TV symbols$/i }).click();
    await expect(page.getByTestId("scanner-toast")).toContainText("Copied 1 TradingView symbol", { timeout: 10_000 });
    await expect.poll(() => page.evaluate(() => localStorage.getItem("alphavyuh-test-clipboard"))).toBe(`NSE:${symbol}`);
    await page.locator(".scanner-results-toolbar").getByRole("button", { name: /^Shortlist$/i }).click();
    await expect(resultRows.first().getByText("Shortlisted")).toBeVisible();

    await page.getByRole("button", { name: /Create watchlist/i }).first().click();
    await page.getByPlaceholder(/Watchlist name/).fill("Launch Flow QA");
    await page.getByRole("button", { name: /^Create$/ }).click();

    await expect(page).toHaveURL(/\/watchlist/, { timeout: 15_000 });
    await expect(page.getByText("Launch Flow QA").first()).toBeVisible();
    await expect(page.locator(".workspace-pill").filter({ hasText: `Focus: ${symbol}` }).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("watchlist-decision-record")).toContainText(/Decision record|Source|Reason|Data as of|Captured price|Current price|Journal/i, { timeout: 10_000 });
    await expect(page.getByTestId("trade-idea-context")).toContainText(/Original scan|Trend Template|As of/i, { timeout: 10_000 });

    const seededContext = await page.evaluate((activeSymbol) => {
      const workflow = JSON.parse(localStorage.getItem("alphavyuh-workflow-state-v1") || "{}");
      return workflow[activeSymbol];
    }, symbol);
    expect(seededContext).toMatchObject({
      lifecycle: "watch",
      source: "scanner",
      scanner_context: {
        source: "scanner",
      },
    });
    expect(seededContext.scanner_context.match_reasons.length).toBeGreaterThan(0);
    expect(seededContext.scanner_context.captured_price).toEqual(expect.any(Number));
    expect(seededContext.scanner_context.captured_volume_ratio).toEqual(expect.any(Number));

    const launchWatchlist = await page.evaluate(() => {
      const lists = JSON.parse(localStorage.getItem("alphavyuh-mock-watchlists-v1") || "[]");
      return lists.find((list: { name: string }) => list.name === "Launch Flow QA");
    });
    const watchlistUrl = `/watchlist?id=${launchWatchlist.id}&symbol=${encodeURIComponent(symbol)}`;
    await page.getByRole("button", { name: /^Full chart$/ }).first().click();
    await expect(page).toHaveURL(new RegExp(`/charts/${symbol}`), { timeout: 15_000 });
    await expect(page.locator("body")).toContainText(symbol, { timeout: 15_000 });
    await expect(page.locator("body")).toContainText(/Scanner and chart context|latest available market snapshot/i, { timeout: 15_000 });
    const chartWorkflow = await page.evaluate((activeSymbol) => {
      const workflow = JSON.parse(localStorage.getItem("alphavyuh-workflow-state-v1") || "{}");
      return workflow[activeSymbol];
    }, symbol);
    expect(chartWorkflow.scanner_context?.preset_name).toMatch(/Trend Template|Custom scan/i);
    expect(chartWorkflow.scanner_context?.match_reasons?.length).toBeGreaterThan(0);
    await expect(page.getByText("Chart playbook")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("body")).toContainText(/Demo data|Data as of/i, { timeout: 15_000 });

    await page.goto(watchlistUrl);
    await expect(page.locator(".workspace-pill").filter({ hasText: `Focus: ${symbol}` }).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("trade-idea-context")).toContainText(/Original scan|Trend Template|As of/i, { timeout: 10_000 });

    await page.getByRole("button", { name: /^Order$/ }).click();
    await expect(page.getByRole("button", { name: /^Ready$/ })).toBeDisabled();
    await page.getByPlaceholder("Entry").fill("1500");
    await page.getByPlaceholder("Stop").fill("1440");
    await page.getByPlaceholder("Target").fill("1650");
    await page.getByPlaceholder("Qty").fill("3");
    await page.getByPlaceholder("Thesis").fill("Launch QA setup from scanner shortlist with clear confirmation.");
    await page.getByPlaceholder("Invalidation rule").fill("Exit if the breakout base fails on closing basis.");

    await expect(page.getByText("Ready for order draft.")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: /^Save buy journal draft$/i })).toBeEnabled();
    await page.getByRole("button", { name: /^Save buy journal draft$/i }).click();
    await expect(page.getByText(/saved as a journal capture draft/i)).toBeVisible({ timeout: 10_000 });

    await page.goto("/journal");
    await expect(page.locator("body")).toContainText(symbol, { timeout: 15_000 });
    await expect(page.locator("body")).toContainText(/Review|Needs review|Open/i, { timeout: 15_000 });
    await page.locator("tbody tr").filter({ hasText: symbol }).first().click();
    await expect(page.getByTestId("journal-original-idea")).toContainText(/Original scan|Original thesis/i, { timeout: 10_000 });
    await expect(page.getByTestId("journal-original-idea")).toContainText(/Trend Template|Launch QA setup/i);
    await expect(page.getByTestId("journal-original-idea")).toContainText(/Review prompts/i);

    const state = await page.evaluate((activeSymbol) => {
      const journal = JSON.parse(localStorage.getItem("alphavyuh-mock-journal-v1") || "[]");
      const workflow = JSON.parse(localStorage.getItem("alphavyuh-workflow-state-v1") || "{}");
      return {
        journal: journal.find((entry: { symbol: string }) => entry.symbol === activeSymbol),
        workflow: workflow[activeSymbol],
      };
    }, symbol);
    expect(state.journal).toMatchObject({ symbol, quantity: 3, status: "open" });
    expect(state.journal.entry_reason).toContain("Scanner:");
    expect(state.journal.entry_reason).toContain("Matched:");
    expect(state.journal.entry_reason).toContain("Thesis: Launch QA setup");
    expect(state.journal.entry_reason).toContain("Invalidation: Exit if");
    expect(state.journal).toMatchObject({
      source_page: "watchlist",
      scanner_context: {
        source: "scanner",
      },
      thesis: "Launch QA setup from scanner shortlist with clear confirmation.",
      invalidation_rule: "Exit if the breakout base fails on closing basis.",
    });
    expect(state.workflow).toMatchObject({
      lifecycle: "open",
      entry: 1500,
      stop: 1440,
      target: 1650,
      position_size: 3,
      thesis: "Launch QA setup from scanner shortlist with clear confirmation.",
      invalidation_rule: "Exit if the breakout base fails on closing basis.",
      scanner_context: {
        source: "scanner",
      },
    });
    expect(["scanner", "watchlist"]).toContain(state.workflow.source);
    expect(errors).toEqual([]);
  });

  test("saved scanner screens can be composed with visible provenance", async ({ page }) => {
    test.setTimeout(60_000);
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto("/scanner");
    await page.getByLabel("Select saved screen Trend Template").check();
    await page.getByLabel("Select saved screen VCP Breakout").check();
    await page.getByRole("button", { name: /^Combine 2 screens$/ }).click();

    await expect(page.locator(".scanner-results-toolbar")).toContainText("AND · Trend Template + VCP Breakout", { timeout: 20_000 });
    await expect(page.locator(".scanner-results-toolbar")).toContainText("Saved scan composition");
    await expect(page.getByText(/matches from AND composition/i)).toBeVisible({ timeout: 10_000 });

    const resultRows = page.locator("tbody tr").filter({ has: page.getByRole("button", { name: /^Shortlist$/ }) });
    await expect(resultRows.first()).toBeVisible({ timeout: 10_000 });
    await expect(resultRows.first()).toContainText("Trend Template + VCP Breakout");
    await resultRows.first().click();
    await expect(page.locator("tbody")).toContainText("Screen: Trend Template");
    await expect(page.locator("tbody")).toContainText("Screen: VCP Breakout");

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
    await expect(page.locator(".scanner-row-actions").first()).toBeVisible({ timeout: 20_000 });

    const resultRows = page.locator("tbody tr").filter({ has: page.getByRole("button", { name: /^Shortlist$/ }) });
    await expect(resultRows.nth(2)).toBeVisible({ timeout: 10_000 });
    const shortlistSymbol = ((await resultRows.nth(0).locator(".mono").first().textContent()) ?? "").trim();
    const ignoredSymbol = ((await resultRows.nth(1).locator(".mono").first().textContent()) ?? "").trim();
    const reviewSymbol = ((await resultRows.nth(2).locator(".mono").first().textContent()) ?? "").trim();

    await resultRows.nth(0).getByRole("button", { name: /^Shortlist$/ }).click();
    await expect(resultRows.nth(0).getByText("Shortlisted")).toBeVisible();
    await resultRows.nth(1).getByLabel(new RegExp(`More actions for ${ignoredSymbol}`)).selectOption("ignore");
    await expect(resultRows.nth(1).getByText("Ignored")).toBeVisible();

    await resultRows.nth(2).locator("input[type=checkbox]").check({ force: true });
    await expect(page.getByText("1 selected")).toBeVisible();
    await page.locator(".scanner-results-toolbar").getByRole("button", { name: /^Review later$/i }).click();
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
    await expect(page.locator(".scanner-row-actions").first()).toBeVisible({ timeout: 20_000 });

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

    await page.getByRole("button", { name: "Open chart drawing tools", exact: true }).click();
    await page.getByRole("button", { name: "Long position L", exact: true }).click();
    await expect(page.getByText(/Long position armed/i)).toBeVisible({ timeout: 10_000 });

    const box = await overlay.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    await page.mouse.move(box.x + box.width * 0.34, box.y + box.height * 0.48);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.58, box.y + box.height * 0.66);
    await page.mouse.up();

    await expect(page.getByText("Drawings · 1")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Selected: Long position/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: /Use as plan/i })).toHaveCount(0);
    await expect(page.getByText(/Plan entry/i)).toHaveCount(0);
    await expect(page.getByPlaceholder("Entry")).toHaveCount(0);
    await expect(page.getByPlaceholder("Stop")).toHaveCount(0);
    await expect(page.getByPlaceholder("Target")).toHaveCount(0);

    expect(errors).toEqual([]);
  });

  test("position drawing sends chart context into the watchlist Decision Desk", async ({ page }) => {
    test.setTimeout(60_000);
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));

    await page.addInitScript(() => {
      const baseItem = {
        symbol: "AUBANK",
        sort_order: 0,
        added_at: "2026-05-20T00:00:00.000Z",
        company_name: "AU Small Finance Bank",
        sector: "Banks",
        pinned: false,
        tags: [],
        note: "",
      };
      localStorage.setItem("alphavyuh-mock-watchlists-v1", JSON.stringify([
        { id: "desk-primary", name: "Primary queue", sort_order: 0, created_at: "2026-05-20T00:00:00.000Z", items: [baseItem] },
        { id: "desk-secondary", name: "Rotation queue", sort_order: 1, created_at: "2026-05-20T00:00:00.000Z", items: [{ ...baseItem, note: "Source queue for chart handoff" }] },
      ]));
    });

    await page.goto("/charts/AUBANK?from=watchlist&watchlistId=desk-secondary&watchlist=Rotation%20queue&full=1");
    const overlay = page.getByTestId("chart-drawing-overlay");
    await expect(overlay).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: "Open chart drawing tools", exact: true }).click();
    await page.getByRole("button", { name: "Long position L", exact: true }).click();
    await expect(page.getByText(/Long position armed/i)).toBeVisible({ timeout: 10_000 });

    const box = await overlay.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    await page.mouse.move(box.x + box.width * 0.34, box.y + box.height * 0.48);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.58, box.y + box.height * 0.66);
    await page.mouse.up();

    await expect(page.getByRole("button", { name: /Send to desk/i })).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: /Send to desk/i }).click();
    await expect(page.getByText(/Confirm desk handoff/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/R:R/i)).toBeVisible();
    await page.getByRole("button", { name: /^Send plan$/i }).click();

    await expect(page).toHaveURL(/\/watchlist\?symbol=AUBANK&id=desk-secondary&planDraft=chart/, { timeout: 15_000 });
    await expect(page.getByText(/Chart plan context loaded into Decision Desk/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(".workspace-pill").filter({ hasText: "Focus: AUBANK" }).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByPlaceholder("Thesis")).toHaveValue(/Chart plan:/, { timeout: 15_000 });
    await expect(page.getByPlaceholder("Invalidation rule")).toHaveValue(/drawn stop below/i);
    await expect(page.getByPlaceholder("Notes, tags, review later context...")).toHaveValue(/Full chart long position drawing/i);

    const workflow = await page.evaluate(() => {
      const states = JSON.parse(localStorage.getItem("alphavyuh-workflow-state-v1") || "{}");
      return states.AUBANK;
    });
    expect(workflow).toMatchObject({
      symbol: "AUBANK",
      watchlist_id: "desk-secondary",
      source: "chart",
      lifecycle: "watch",
      setup_type: "breakout",
    });
    expect(workflow.thesis).toContain("Chart plan:");
    expect(workflow.invalidation_rule).toContain("drawn stop below");
    expect(workflow.tags).toEqual(expect.arrayContaining(["chart-plan", "long"]));
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

    await page.getByRole("button", { name: "Open chart drawing tools", exact: true }).click();
    await page.getByRole("button", { name: "Rectangle / zone Z", exact: true }).click();
    await expect(page.getByText(/Rectangle \/ zone armed/i)).toBeVisible({ timeout: 10_000 });

    const box = await overlay.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    await page.mouse.move(box.x + box.width * 0.30, box.y + box.height * 0.42);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.58, box.y + box.height * 0.57);
    await page.mouse.up();

    await expect(page.getByText("Drawings · 1")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Selected: Rectangle \/ zone/i)).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: /Zone note/i }).click();
    await expect(page.getByText("Drawings · 2")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Zone \d+\.\d+-\d+\.\d+/).first()).toBeVisible({ timeout: 10_000 });

    await page.reload();
    await expect(page.getByText("Drawings · 2")).toBeVisible({ timeout: 15_000 });

    expect(errors).toEqual([]);
  });

  test("selected drawing creates a mock price alert draft", async ({ page }) => {
    test.setTimeout(60_000);
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto("/charts/AUBANK?full=1");
    const overlay = page.getByTestId("chart-drawing-overlay");
    await expect(overlay).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: "Open chart drawing tools", exact: true }).click();
    await page.getByRole("button", { name: "Horizontal line H", exact: true }).click();
    await expect(page.getByText(/Horizontal line armed/i)).toBeVisible({ timeout: 10_000 });

    const box = await overlay.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    await page.mouse.move(box.x + box.width * 0.24, box.y + box.height * 0.48);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.68, box.y + box.height * 0.48);
    await page.mouse.up();

    await expect(page.getByText("Drawings · 1")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Selected: Horizontal line/i)).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: /Alert from drawing/i }).click();
    await expect(page.getByText(/Alert set (above|below)/i)).toBeVisible({ timeout: 10_000 });

    const alerts = await page.evaluate(() => JSON.parse(localStorage.getItem("alphavyuh-mock-price-alerts-v1") || "[]"));
    expect(alerts[0]).toMatchObject({
      symbol: "AUBANK",
      note: "Horizontal line alert from saved drawing",
      is_active: true,
    });
    expect(["above", "below"]).toContain(alerts[0].condition);
    expect(typeof alerts[0].target_price).toBe("number");
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
      await page.getByRole("button", { name: "Open chart drawing tools", exact: true }).click();
      await page.getByRole("button", { name: buttonName, exact: true }).click();
      await expect(page.getByText(armedText)).toBeVisible({ timeout: 10_000 });
      await page.mouse.move(box.x + box.width * startX, box.y + box.height * startY);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * endX, box.y + box.height * endY);
      await page.mouse.up();
      await expect(page.getByText(`Drawings · ${expectedCount}`)).toBeVisible({ timeout: 10_000 });
    };

    await drawSegment("Ray R", /Ray armed/i, 0.22, 0.68, 0.58, 0.45, 1);
    await drawSegment("Horizontal line H", /Horizontal line armed/i, 0.18, 0.50, 0.66, 0.50, 2);
    await drawSegment("Fibonacci retracement F", /Fibonacci retracement armed/i, 0.35, 0.72, 0.70, 0.32, 3);
    await drawSegment("Short position S", /Short position armed/i, 0.42, 0.40, 0.64, 0.24, 4);

    await page.getByRole("button", { name: "Open chart drawing tools", exact: true }).click();
    await page.getByRole("button", { name: "Text note N", exact: true }).click();
    await expect(page.getByText(/Text note armed/i)).toBeVisible({ timeout: 10_000 });
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
