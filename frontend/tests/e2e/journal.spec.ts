import { test, expect } from "@playwright/test";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const OPEN_TRADE = {
  id: "trade-open-1",
  symbol: "RELIANCE",
  company_name: "Reliance Industries Ltd",
  trade_type: "long",
  entry_date: "2026-04-01",
  entry_price: 2800,
  quantity: 10,
  exit_price: null,
  exit_date: null,
  stop_loss: 2650,
  target_price: 3100,
  setup_type: "vcp",
  status: "open",
  pnl: null,
  risk_reward: 2.0,
  holding_days: null,
  entry_reason: "EMA alignment and volume surge",
  exit_reason: null,
  mistakes: null,
  lessons: null,
};

const CLOSED_TRADE = {
  id: "trade-closed-1",
  symbol: "TCS",
  company_name: "Tata Consultancy Services",
  trade_type: "long",
  entry_date: "2026-03-01",
  entry_price: 3900,
  quantity: 5,
  exit_price: 4200,
  exit_date: "2026-03-20",
  stop_loss: 3750,
  target_price: 4400,
  setup_type: "breakout",
  status: "closed",
  pnl: 1500,
  risk_reward: 2.0,
  holding_days: 19,
  entry_reason: "Breakout from base",
  exit_reason: "Target hit",
  mistakes: null,
  lessons: "Wait for volume confirmation on entry.",
};

const STATS = {
  total_trades: 1,
  open_trades: 1,
  total_pnl: 1500,
  win_rate: 100,
  avg_hold_days: 19,
};

const ANALYTICS = {
  equity_curve: [
    { date: "2026-03-20", cumulative_pnl: 1500 },
  ],
  monthly_pnl: [{ month: "Mar 2026", pnl: 1500 }],
  setup_breakdown: [],
  drawdown_curve: [],
  max_drawdown: 0,
  longest_dd_days: 0,
  recovery_factor: null,
  profit_factor: null,
};

const AI_PATTERNS = {
  ready: false,
  min_trades_required: 3,
  trades_available: 1,
  avg_hold_winners: null,
  avg_hold_losers: null,
  day_of_week: null,
  by_holding_period: null,
  by_direction: null,
};

// ── Route helper — sets up all journal API mocks ──────────────────────────────

async function mockJournalRoutes(
  page: Parameters<Parameters<typeof test>[1]>[0]["page"],
  {
    entries = [OPEN_TRADE, CLOSED_TRADE],
    stats = STATS,
    analytics = ANALYTICS,
    brokerConnected = false,
  }: {
    entries?: typeof OPEN_TRADE[];
    stats?: typeof STATS;
    analytics?: typeof ANALYTICS;
    brokerConnected?: boolean;
  } = {}
) {
  // Entries (with optional status filter)
  await page.route(`${API}/api/v1/journal*`, (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();

    if (method === "GET" && !url.pathname.includes("/stats") && !url.pathname.includes("/analytics") && !url.pathname.includes("/lessons")) {
      const statusFilter = url.searchParams.get("status");
      const filtered = statusFilter
        ? entries.filter((e) => e.status === statusFilter)
        : entries;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ entries: filtered, total: filtered.length }),
      });
    }

    if (method === "GET" && url.pathname.endsWith("/stats")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(stats),
      });
    }

    if (method === "GET" && url.pathname.endsWith("/analytics")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(analytics),
      });
    }

    if (method === "POST" && url.pathname.endsWith("/lessons")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ...CLOSED_TRADE, lessons: "Hold winners longer." }),
      });
    }

    if (method === "POST" && !url.pathname.includes("/lessons")) {
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          ...OPEN_TRADE,
          id: "trade-new-1",
          symbol: "INFY",
        }),
      });
    }

    if (method === "PATCH") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ...OPEN_TRADE, status: "closed", exit_price: 3050, pnl: 2500 }),
      });
    }

    if (method === "DELETE") {
      return route.fulfill({ status: 204 });
    }

    return route.continue();
  });

  // Broker status
  await page.route(`${API}/api/v1/broker/status`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        connected: brokerConnected,
        broker: brokerConnected ? "zerodha" : null,
        status: brokerConnected ? "connected" : "disconnected",
      }),
    })
  );

  // Symbol search
  await page.route(`${API}/api/v1/charts/search*`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        { symbol: "INFY", company_name: "Infosys Limited" },
        { symbol: "INFOSYS", company_name: "Infosys Ltd ADR" },
      ]),
    })
  );

  // AI patterns
  await page.route(`${API}/api/v1/ai/patterns`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(AI_PATTERNS),
    })
  );

  // AI analyse
  await page.route(`${API}/api/v1/ai/analyse`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        analysis: "## Patterns\n- You exit winners too early.\n- Strong performance on VCP setups.",
        trades_analysed: 2,
      }),
    })
  );

  // Zerodha import
  await page.route(`${API}/api/v1/broker/zerodha/import`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ imported: 0, message: "No new trades to import" }),
    })
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe("Journal — trade table", () => {
  test.beforeEach(async ({ page }) => {
    await mockJournalRoutes(page);
  });

  test("shows open and closed trades in the table", async ({ page }) => {
    await page.goto("/journal");
    if (page.url().includes("/login")) return;

    await expect(page.locator("table tbody")).toContainText("RELIANCE");
    await expect(page.locator("table tbody")).toContainText("TCS");
  });

  test("clicking a trade row opens the view panel", async ({ page }) => {
    await page.goto("/journal");
    if (page.url().includes("/login")) return;

    await page.locator("table tbody tr").first().click();
    await expect(page.getByText("Entry price")).toBeVisible();
    await expect(page.getByText("Entry date")).toBeVisible();
  });

  test("filter — open shows only open trades", async ({ page }) => {
    await page.goto("/journal");
    if (page.url().includes("/login")) return;

    await page.getByRole("button", { name: "open" }).click();
    await expect(page.locator("table tbody")).toContainText("RELIANCE");
    await expect(page.locator("table tbody")).not.toContainText("TCS");
  });

  test("filter — closed shows only closed trades", async ({ page }) => {
    await mockJournalRoutes(page, { entries: [CLOSED_TRADE] });
    await page.goto("/journal");
    if (page.url().includes("/login")) return;

    await page.getByRole("button", { name: "closed" }).click();
    await expect(page.locator("table tbody")).not.toContainText("RELIANCE");
    await expect(page.locator("table tbody")).toContainText("TCS");
  });
});

test.describe("Journal — add trade", () => {
  test.beforeEach(async ({ page }) => {
    await mockJournalRoutes(page);
  });

  test("Log trade button opens the add panel", async ({ page }) => {
    await page.goto("/journal");
    if (page.url().includes("/login")) return;

    await page.getByRole("button", { name: "+ Log trade" }).click();
    await expect(page.getByText("Log trade")).toBeVisible();
    await expect(page.getByPlaceholder("e.g. RELIANCE")).toBeVisible();
  });

  test("submitting the add form with required fields calls POST /journal", async ({
    page,
  }) => {
    let postCalled = false;
    await page.route(`${API}/api/v1/journal`, async (route) => {
      if (route.request().method() === "POST") {
        postCalled = true;
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ ...OPEN_TRADE, id: "trade-new-1", symbol: "INFY" }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/journal");
    if (page.url().includes("/login")) return;

    await page.getByRole("button", { name: "+ Log trade" }).click();

    // Fill symbol — type to trigger autocomplete then click suggestion
    await page.getByPlaceholder("e.g. RELIANCE").fill("INFY");
    await page.getByText("Infosys Limited").click();

    // Fill required numeric fields
    await page.locator("input[type=number]").first().fill("1500");
    await page.locator("input[type=number]").nth(1).fill("10");

    await page.getByRole("button", { name: "Save trade" }).click();

    await expect(postCalled).toBe(true);
  });
});

test.describe("Journal — close trade", () => {
  test.beforeEach(async ({ page }) => {
    await mockJournalRoutes(page);
  });

  test("Close button in row opens the close panel for that trade", async ({
    page,
  }) => {
    await page.goto("/journal");
    if (page.url().includes("/login")) return;

    // The open trade row has a "Close" button
    await page.getByRole("button", { name: "Close" }).first().click();
    await expect(page.getByText("Close RELIANCE")).toBeVisible();
    await expect(page.getByPlaceholder("0.00")).toBeVisible();
  });

  test("submitting the close form calls PATCH /journal/:id", async ({ page }) => {
    let patchCalled = false;
    await page.route(`${API}/api/v1/journal/trade-open-1`, async (route) => {
      if (route.request().method() === "PATCH") {
        patchCalled = true;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ...OPEN_TRADE, status: "closed", exit_price: 3050, pnl: 2500 }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/journal");
    if (page.url().includes("/login")) return;

    await page.getByRole("button", { name: "Close" }).first().click();
    await page.getByPlaceholder("0.00").fill("3050");
    await page.getByRole("button", { name: "Close trade" }).click();

    await expect(patchCalled).toBe(true);
  });
});

test.describe("Journal — view trade details", () => {
  test.beforeEach(async ({ page }) => {
    await mockJournalRoutes(page);
  });

  test("clicking a closed trade row shows its detail fields in the side panel", async ({
    page,
  }) => {
    await page.goto("/journal");
    if (page.url().includes("/login")) return;

    // Click the TCS (closed) row
    await page.locator("table tbody tr").filter({ hasText: "TCS" }).click();

    await expect(page.getByText("Entry reason")).toBeVisible();
    await expect(page.getByText("Exit reason")).toBeVisible();
    await expect(page.getByText("AI lesson")).toBeVisible();
  });

  test("view panel for open trade shows 'Close this trade' button", async ({
    page,
  }) => {
    await page.goto("/journal");
    if (page.url().includes("/login")) return;

    await page.locator("table tbody tr").filter({ hasText: "RELIANCE" }).click();
    await expect(page.getByRole("button", { name: "Close this trade" })).toBeVisible();
  });
});

test.describe("Journal — delete trade", () => {
  test.beforeEach(async ({ page }) => {
    await mockJournalRoutes(page);
    // Accept the confirm dialog automatically
    page.on("dialog", (dialog) => dialog.accept());
  });

  test("clicking × on a row calls DELETE /journal/:id", async ({ page }) => {
    let deleteCalled = false;
    await page.route(`${API}/api/v1/journal/trade-closed-1`, async (route) => {
      if (route.request().method() === "DELETE") {
        deleteCalled = true;
        await route.fulfill({ status: 204 });
      } else {
        await route.continue();
      }
    });

    await page.goto("/journal");
    if (page.url().includes("/login")) return;

    // The × button is in the last column, stop-propagation prevents row click
    const deleteBtn = page
      .locator("table tbody tr")
      .filter({ hasText: "TCS" })
      .getByRole("button", { name: "×" });
    await deleteBtn.click();

    await expect(deleteCalled).toBe(true);
  });
});

test.describe("Journal — tab navigation", () => {
  test.beforeEach(async ({ page }) => {
    await mockJournalRoutes(page);
  });

  test("Analytics tab switch shows equity curve heading", async ({ page }) => {
    await page.goto("/journal");
    if (page.url().includes("/login")) return;

    await page.getByRole("button", { name: "Analytics" }).click();
    await expect(page.getByText("Equity curve")).toBeVisible();
  });

  test("AI analysis tab switch shows 'Pattern stats' heading", async ({
    page,
  }) => {
    await page.goto("/journal");
    if (page.url().includes("/login")) return;

    await page.getByRole("button", { name: "AI analysis" }).click();
    await expect(page.getByText("Pattern stats")).toBeVisible();
    await expect(page.getByText("AI deep analysis")).toBeVisible();
  });

  test("AI tab triggers getAiPatterns call", async ({ page }) => {
    let patternsCalled = false;
    await page.route(`${API}/api/v1/ai/patterns`, async (route) => {
      patternsCalled = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(AI_PATTERNS),
      });
    });

    await page.goto("/journal");
    if (page.url().includes("/login")) return;

    await page.getByRole("button", { name: "AI analysis" }).click();
    await expect(page.getByText("Pattern stats")).toBeVisible();
    await expect(patternsCalled).toBe(true);
  });
});

test.describe("Journal — broker sync import", () => {
  test("no broker connected: Import from Zerodha button is NOT shown", async ({
    page,
  }) => {
    await mockJournalRoutes(page, { brokerConnected: false });
    await page.goto("/journal");
    if (page.url().includes("/login")) return;

    await expect(
      page.getByRole("button", { name: "Import from Zerodha" })
    ).not.toBeVisible();
  });

  test("broker connected: Import from Zerodha button is visible", async ({
    page,
  }) => {
    await mockJournalRoutes(page, { brokerConnected: true });
    await page.goto("/journal");
    if (page.url().includes("/login")) return;

    await expect(
      page.getByRole("button", { name: "Import from Zerodha" })
    ).toBeVisible();
  });

  test("clicking Import from Zerodha calls POST /broker/zerodha/import", async ({
    page,
  }) => {
    let importCalled = false;
    await mockJournalRoutes(page, { brokerConnected: true });
    await page.route(`${API}/api/v1/broker/zerodha/import`, async (route) => {
      importCalled = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ imported: 0, message: "No new trades to import" }),
      });
    });

    await page.goto("/journal");
    if (page.url().includes("/login")) return;

    await page.getByRole("button", { name: "Import from Zerodha" }).click();
    await expect(importCalled).toBe(true);
  });
});
