import { test, expect, type Page } from "@playwright/test";
import type { JournalAnalytics, JournalTradeMetrics } from "@/lib/api/types";

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

const TRADE_METRICS: JournalTradeMetrics = {
  closed_trades: 3, eligible_trades: 3, return_trade_count: 3, cash_trade_count: 3,
  wins: 2, losses: 1, breakevens: 0, win_rate_pct: 66.7, loss_rate_pct: 33.3,
  avg_gain_pct: 10, avg_loss_pct: 5, largest_gain_pct: 10, largest_loss_pct: 5,
  avg_win_cash: 1000, avg_loss_cash: 500, expectancy_pct: 5, expectancy_cash: 500,
  payoff_ratio: 2, adjusted_win_loss_ratio: 4, profit_factor_cash: 4,
  avg_winner_holding_days: 19, avg_loser_holding_days: 4,
  winner_holding_count: 2, loser_holding_count: 1,
};

const ANALYTICS: JournalAnalytics = {
  equity_curve: [
    { date: "2026-02-20", cumulative_pnl: 500 },
    { date: "2026-03-20", cumulative_pnl: 1500 },
  ],
  monthly_pnl: [{ month: "Mar 2026", pnl: 1500 }],
  setup_breakdown: [
    { setup: "Breakout", trades: 3, wins: 2, win_rate: 66.7, total_pnl: 1500, avg_pnl: 500 },
  ],
  drawdown_curve: [
    { date: "2026-02-20", drawdown: 0, drawdown_pct: 0 },
    { date: "2026-03-01", drawdown: -350, drawdown_pct: -2.1 },
    { date: "2026-03-20", drawdown: 0, drawdown_pct: 0 },
  ],
  max_drawdown: -350,
  longest_dd_days: 4,
  recovery_factor: 4.29,
  profit_factor: 2.1,
  trading_edge: TRADE_METRICS,
  monthly_tracker: [{ ...TRADE_METRICS, month: "2026-03" }],
  trade_distribution: { returns_pct: [10, 10, -5], gain_count: 2, loss_count: 1, breakeven_count: 0, missing_return_count: 0 },
  metric_coverage: { closed_trades: 3, eligible_trades: 3, return_trade_count: 3, cash_trade_count: 3, unknown_exit_date_count: 0, future_exit_date_count: 0, missing_return_count: 0, missing_cash_pnl_count: 0 },
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

// ── Trade fixture type (nullable fields can be null or a value) ───────────────

type TradeFixture = {
  id: string; symbol: string; company_name: string; trade_type: string;
  entry_date: string; entry_price: number; quantity: number;
  exit_price: number | null; exit_date: string | null;
  stop_loss: number; target_price: number; setup_type: string;
  status: string; pnl: number | null; pnl_pct?: number | null; risk_reward: number;
  holding_days: number | null; entry_reason: string | null;
  exit_reason: string | null; mistakes: string | null; lessons: string | null;
};

// ── Route helper — sets up all journal API mocks ──────────────────────────────

async function mockJournalRoutes(
  page: Page,
  {
    entries = [OPEN_TRADE, CLOSED_TRADE] as TradeFixture[],
    stats = STATS,
    analytics = ANALYTICS,
    brokerConnected = false,
    journalStatus = 200,
    statsStatus = 200,
    analyticsStatus = 200,
    patternsStatus = 200,
    brokerStatus = 200,
  }: {
    entries?: TradeFixture[];
    stats?: typeof STATS;
    analytics?: JournalAnalytics;
    brokerConnected?: boolean;
    journalStatus?: number;
    statsStatus?: number;
    analyticsStatus?: number;
    patternsStatus?: number;
    brokerStatus?: number;
  } = {}
) {
  await page.addInitScript(() => {
    window.localStorage.setItem("alphavyuh-e2e-route-mocks", "true");
  });

  // Entries (with optional status filter)
  await page.route("**/api/v1/journal**", (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();

    if (method === "GET" && !url.pathname.includes("/stats") && !url.pathname.includes("/analytics") && !url.pathname.includes("/lessons")) {
      if (journalStatus >= 400) {
        return route.fulfill({
          status: journalStatus,
          contentType: "application/json",
          body: JSON.stringify({ detail: "Journal entries are temporarily unavailable. Your trades were not loaded." }),
        });
      }
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
      if (statsStatus >= 400) {
        return route.fulfill({
          status: statsStatus,
          contentType: "application/json",
          body: JSON.stringify({ detail: "Journal stats are temporarily unavailable. Trade rows may still be current." }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(stats),
      });
    }

    if (method === "GET" && url.pathname.endsWith("/analytics")) {
      if (analyticsStatus >= 400) {
        return route.fulfill({
          status: analyticsStatus,
          contentType: "application/json",
          body: JSON.stringify({ detail: "Journal analytics are temporarily unavailable. Trade rows may still be current." }),
        });
      }
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
  await page.route("**/api/v1/broker/status", (route) =>
    brokerStatus >= 400
      ? route.fulfill({
          status: brokerStatus,
          contentType: "application/json",
          body: JSON.stringify({ detail: "Broker import status is temporarily unavailable. Reconnect or retry before importing." }),
        })
      : route.fulfill({
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
  await page.route("**/api/v1/charts/search*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        results: [
          { symbol: "INFY", company_name: "Infosys Limited", sector: "IT", series: "EQ" },
          { symbol: "INFOSYS", company_name: "Infosys Ltd ADR", sector: "IT", series: "EQ" },
        ],
      }),
    })
  );

  // AI patterns
  await page.route("**/api/v1/ai/patterns", (route) =>
    patternsStatus >= 400
      ? route.fulfill({
          status: patternsStatus,
          contentType: "application/json",
          body: JSON.stringify({ detail: "Trade pattern review is temporarily unavailable." }),
        })
      : route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(AI_PATTERNS),
        })
  );

  // AI analyse
  await page.route("**/api/v1/ai/analyse", (route) =>
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
  await page.route("**/api/v1/broker/zerodha/import", (route) =>
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

    await page.getByRole("button", { name: "open", exact: true }).click();
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

test.describe("Journal — realized trade outcomes", () => {
  for (const viewport of [
    { name: "desktop", width: 1280, height: 900 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    test(`${viewport.name}: a losing trade does not display its planned ratio as positive R`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await mockJournalRoutes(page, {
        entries: [{
          ...CLOSED_TRADE,
          entry_price: 100,
          exit_price: 95,
          quantity: 10,
          stop_loss: 90,
          target_price: 130,
          pnl: -50,
          pnl_pct: -5,
          risk_reward: 3,
        }],
      });
      await page.goto("/journal");
      await expect(page).toHaveURL(/\/journal$/);

      const row = page.locator("table tbody tr").filter({ hasText: "TCS" });
      await expect(row).toContainText("-₹50");
      await expect(row).not.toContainText("+3.00R");
      const outcomeArea = row.locator(viewport.name === "mobile"
        ? ".journal-mobile-trade-card"
        : "td.journal-table-mobile-hide");
      await expect(outcomeArea.getByText("-5.00%", { exact: true })).toBeVisible();
    });

    test(`${viewport.name}: missing initial risk does not derive R from the current stop`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await mockJournalRoutes(page, {
        entries: [{
          ...CLOSED_TRADE,
          entry_price: 100,
          exit_price: 95,
          quantity: 10,
          stop_loss: 99,
          target_price: 130,
          pnl: -50,
          pnl_pct: null,
          risk_reward: 3,
        }],
      });
      await page.goto("/journal");
      await expect(page).toHaveURL(/\/journal$/);

      const row = page.locator("table tbody tr").filter({ hasText: "TCS" });
      await expect(row).toContainText("-₹50");
      await expect(row).not.toContainText("+3.00R");
      await expect(row).not.toContainText("-5.00R");
      const outcomeArea = row.locator(viewport.name === "mobile"
        ? ".journal-mobile-trade-card"
        : "td.journal-table-mobile-hide");
      await expect(outcomeArea.getByText("R unavailable", { exact: true })).toBeVisible();
    });
  }
});

test.describe("Journal — account data unavailable states", () => {
  test("journal entry failure does not render a false empty journal", async ({ page }) => {
    await mockJournalRoutes(page, { journalStatus: 503 });
    await page.goto("/journal");
    if (page.url().includes("/login")) return;

    await expect(page.getByTestId("journal-account-data-status")).toContainText("Journal entries are temporarily unavailable", { timeout: 15_000 });
    await expect(page.locator("table tbody")).toContainText("Journal data unavailable");
    await expect(page.getByText("No trades yet.")).not.toBeVisible();
    await expect(page.getByRole("button", { name: "Log your first trade" })).not.toBeVisible();
  });

  test("journal stats failure keeps trade rows visible and marks stats unavailable", async ({ page }) => {
    await mockJournalRoutes(page, { statsStatus: 503 });
    await page.goto("/journal");
    if (page.url().includes("/login")) return;

    await expect(page.locator("table tbody")).toContainText("RELIANCE", { timeout: 15_000 });
    await expect(page.locator("table tbody")).toContainText("TCS");
    await expect(page.getByTestId("journal-account-data-status")).toContainText("Journal stats are temporarily unavailable");
    await expect(page.locator("body")).toContainText("Unavailable");
  });

  test("journal analytics failure does not render a false empty analytics tab", async ({ page }) => {
    await mockJournalRoutes(page, { analyticsStatus: 503 });
    await page.goto("/journal");
    if (page.url().includes("/login")) return;

    await page.getByRole("button", { name: "Analytics", exact: true }).click();
    await expect(page.getByTestId("journal-analytics-unavailable")).toContainText("Journal analytics are temporarily unavailable", { timeout: 15_000 });
    await expect(page.getByText("Close some trades to see analytics here.")).not.toBeVisible();
  });

  test("AI pattern failure does not render a false insufficient-trades state", async ({ page }) => {
    await mockJournalRoutes(page, { patternsStatus: 503 });
    await page.goto("/journal");
    if (page.url().includes("/login")) return;

    await page.getByRole("button", { name: "Trade review" }).click();
    await expect(page.getByTestId("journal-patterns-unavailable")).toContainText("Trade pattern review is temporarily unavailable", { timeout: 15_000 });
    await expect(page.getByText("Close at least 3 trades to see pattern stats.")).not.toBeVisible();
  });

  test("broker status failure is visible and hides broker import", async ({ page }) => {
    await mockJournalRoutes(page, { brokerConnected: true, brokerStatus: 503 });
    await page.goto("/journal");
    if (page.url().includes("/login")) return;

    await expect(page.getByTestId("journal-account-data-status")).toContainText("Broker import status is temporarily unavailable", { timeout: 15_000 });
    await expect(page.locator("body")).toContainText("Broker status unavailable");
    await expect(page.getByRole("button", { name: "Import from Zerodha" })).not.toBeVisible();
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
    await expect(page.locator(".heading-card").filter({ hasText: /^Log trade$/ })).toBeVisible();
    await expect(page.getByPlaceholder("e.g. RELIANCE")).toBeVisible();
  });

  test("submitting the add form with required fields calls POST /journal", async ({
    page,
  }) => {
    let postCalled = false;
    await page.route("**/api/v1/journal", async (route) => {
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
    await page.locator("tbody tr", { hasText: "RELIANCE" }).getByRole("button", { name: "Close" }).click();
    await expect(page.locator(".heading-card").filter({ hasText: /^Close RELIANCE$/ })).toBeVisible();
    await expect(page.getByPlaceholder("0.00")).toBeVisible();
  });

  test("submitting the close form calls PATCH /journal/:id", async ({ page }) => {
    await page.goto("/journal");
    if (page.url().includes("/login")) return;

    await page.locator("tbody tr", { hasText: "RELIANCE" }).getByRole("button", { name: "Close" }).click();
    await page.getByPlaceholder("0.00").fill("3050");
    const patchRequest = page.waitForRequest((request) =>
      request.method() === "PATCH" &&
      request.url().includes("/api/v1/journal/trade-open-1")
    );
    await page.getByRole("button", { name: "Close trade" }).click();

    await patchRequest;
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
    await expect(page.getByText("Trade lesson")).toBeVisible();
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
    await page.goto("/journal");
    if (page.url().includes("/login")) return;

    // The × button is in the last column, stop-propagation prevents row click
    const deleteBtn = page
      .locator("table tbody tr")
      .filter({ hasText: "TCS" })
      .getByRole("button", { name: "×" });
    const deleteRequest = page.waitForRequest((request) =>
      request.method() === "DELETE" &&
      request.url().includes("/api/v1/journal/trade-closed-1")
    );
    await deleteBtn.click();

    await deleteRequest;
  });
});

test.describe("Journal — tab navigation", () => {
  test.beforeEach(async ({ page }) => {
    await mockJournalRoutes(page);
  });

  test("Analytics tab switch shows equity curve heading", async ({ page }) => {
    await page.goto("/journal");
    if (page.url().includes("/login")) return;

    await page.getByRole("button", { name: "Analytics", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Equity curve" })).toBeVisible();
  });

  test("Analytics tab surfaces an edge dashboard and next review focus", async ({ page }) => {
    await page.goto("/journal?tab=analytics");
    if (page.url().includes("/login")) return;

    await expect(page.getByTestId("journal-edge-dashboard")).toContainText("Expectancy / trade", { timeout: 15_000 });
    await expect(page.getByTestId("journal-edge-dashboard")).toContainText("Next review focus");
    await expect(page.getByTestId("journal-edge-dashboard")).toContainText("Best setup");
  });

  test("Trade review tab switch shows 'Pattern stats' heading", async ({
    page,
  }) => {
    await page.goto("/journal");
    if (page.url().includes("/login")) return;

    await page.getByRole("button", { name: "Trade review" }).click();
    await expect(page.getByRole("heading", { name: "Pattern stats" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Trade review" })).toBeVisible();
  });

  test("Trade review tab triggers getAiPatterns call", async ({ page }) => {
    let patternsCalled = false;
    await page.route("**/api/v1/ai/patterns", async (route) => {
      patternsCalled = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(AI_PATTERNS),
      });
    });

    await page.goto("/journal");
    if (page.url().includes("/login")) return;

    await page.getByRole("button", { name: "Trade review" }).click();
    await expect(page.getByRole("heading", { name: "Pattern stats" })).toBeVisible();
    await expect(patternsCalled).toBe(true);
  });
});

test.describe("Journal — analytics tools", () => {
  for (const analyticsStatus of [200, 503]) {
    test(`forecast preserves assumptions when delayed analytics ${analyticsStatus === 200 ? "loads" : "fails"}`, async ({ page }) => {
      await mockJournalRoutes(page);
      let releaseAnalytics!: () => void;
      const analyticsReleased = new Promise<void>((resolve) => { releaseAnalytics = resolve; });
      await page.route("**/api/v1/journal/analytics", async (route) => {
        await analyticsReleased;
        await route.fulfill({
          status: analyticsStatus,
          contentType: "application/json",
          body: JSON.stringify(analyticsStatus === 200
            ? ANALYTICS
            : { detail: "Journal analytics are temporarily unavailable. Trade rows may still be current." }),
        });
      });

      await page.goto("/journal?tab=analytics");
      await expect(page.getByText("Loading journal analytics…", { exact: true })).toBeVisible();
      const forecast = page.getByTestId("journal-forecast");
      const assumptions = [
        ["Portfolio size (₹)", "100000"], ["Position allocation (%)", "25"],
        ["Target portfolio return (%)", "10"], ["Average gain (%)", "12"],
        ["Average loss (% magnitude)", "6"], ["Winning trades (%)", "50"],
      ];
      for (const [label, value] of assumptions) {
        await forecast.getByLabel(label, { exact: true }).fill(value);
      }
      await expect(forecast.getByText("Expected cash / trade", { exact: true }).locator("..")).toContainText("+₹750");
      await forecast.getByText("Reinvestment and turnover what-if", { exact: true }).click();
      await forecast.getByLabel("Return per reinvestment (%)", { exact: true }).fill("20");
      await forecast.getByLabel("Reinvestment count", { exact: true }).fill("4");
      await expect(forecast.getByText("Compounded return: 107.36%", { exact: true })).toBeVisible();

      releaseAnalytics();
      if (analyticsStatus === 200) {
        await expect(page.getByTestId("journal-edge-dashboard")).toBeVisible();
        await expect(forecast.getByRole("button", { name: "Use journal averages", exact: true })).toBeVisible();
      } else {
        await expect(page.getByTestId("journal-analytics-unavailable")).toBeVisible();
      }
      for (const [label, value] of assumptions) {
        await expect(forecast.getByLabel(label, { exact: true })).toHaveValue(value);
      }
      await expect(forecast.getByText("Expected cash / trade", { exact: true }).locator("..")).toContainText("+₹750");
      await expect(forecast.getByLabel("Return per reinvestment (%)", { exact: true })).toHaveValue("20");
      await expect(forecast.getByLabel("Reinvestment count", { exact: true })).toHaveValue("4");
      await expect(forecast.getByText("Compounded return: 107.36%", { exact: true })).toBeVisible();
    });
  }

  for (const viewport of [
    { name: "desktop", width: 1280, height: 900 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    test(`${viewport.name}: metrics, tracker, distribution, ratios, and forecast fit the workflow`, async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      await mockJournalRoutes(page);
      await page.goto("/journal?tab=analytics");
      await expect(page).toHaveURL(/\/journal\?tab=analytics$/);

      for (const name of ["Trading edge", "Monthly tracker", "Trade-return distribution", "Summary ratios", "Result-based forecast"]) {
        await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
      }
      await expect(page.getByTestId("journal-trading-edge")).toContainText("66.7%");
      const tracker = page.getByRole("table", { name: "Monthly trading tracker" });
      await expect(tracker.getByRole("row", { name: /2026-03/ })).toContainText("19.0d");
      for (const name of ["Avg gain", "Avg loss", "Win rate", "Trades", "Largest gain", "Largest loss", "Held winners", "Held losers"]) {
        await expect(tracker.getByRole("columnheader", { name, exact: true })).toBeVisible();
      }
      await expect(page.getByRole("img", { name: "Return histogram for 3 trades" })).toBeVisible();
      await expect(page.getByTestId("journal-return-distribution")).toContainText("2 gains · 1 losses");
      await expect(page.getByTestId("journal-forecast").getByLabel("Portfolio size (₹)", { exact: true })).toHaveValue("");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`analytics-${viewport.name}.png`), fullPage: true });
    });
  }

  test("forecast responds to assumptions and keeps reinvestment separate", async ({ page }) => {
    await mockJournalRoutes(page);
    await page.goto("/journal?tab=analytics");
    const forecast = page.getByTestId("journal-forecast");
    for (const [label, value] of [
      ["Portfolio size (₹)", "100000"], ["Position allocation (%)", "25"],
      ["Target portfolio return (%)", "10"], ["Average gain (%)", "12"],
      ["Average loss (% magnitude)", "6"], ["Winning trades (%)", "50"],
    ]) await forecast.getByLabel(label, { exact: true }).fill(value);

    await expect(forecast.getByText("Expected cash / trade", { exact: true }).locator("..")).toContainText("+₹750");
    await expect(forecast.getByText("Trades for expected profit to reach target", { exact: true }).locator("..")).toContainText("14");
    await expect(forecast.getByText("Expected wins / losses", { exact: true }).locator("..")).toContainText("7.00 / 7.00");
    await forecast.getByLabel("Winning trades (%)", { exact: true }).fill("20");
    await expect(forecast.getByText("Trades for expected profit to reach target", { exact: true }).locator("..")).toContainText("Not reachable");
    await forecast.getByLabel("Portfolio size (₹)", { exact: true }).fill("0");
    await expect(forecast.getByRole("alert")).toBeVisible();

    await forecast.getByText("Reinvestment and turnover what-if", { exact: true }).click();
    await forecast.getByLabel("Return per reinvestment (%)", { exact: true }).fill("20");
    await forecast.getByLabel("Reinvestment count", { exact: true }).fill("4");
    await expect(forecast.getByText("Compounded return: 107.36%", { exact: true })).toBeVisible();
  });

  test("missing historical metrics stay unavailable while the calculator remains usable", async ({ page }) => {
    await mockJournalRoutes(page, { analytics: {
      ...ANALYTICS, trading_edge: null, monthly_tracker: [], trade_distribution: null, metric_coverage: null,
    } });
    await page.goto("/journal?tab=analytics");

    await expect(page.getByTestId("journal-trading-edge")).toContainText("Trade-return metrics are unavailable");
    await expect(page.getByTestId("journal-return-distribution")).toContainText("Return distribution is unavailable");
    await expect(page.getByTestId("journal-forecast").getByLabel("Portfolio size (₹)", { exact: true })).toBeVisible();
  });

  test("journal averages exclude breakevens from the two-outcome forecast and preserve chosen exposure", async ({ page }) => {
    await mockJournalRoutes(page, { analytics: {
      ...ANALYTICS,
      trading_edge: {
        ...TRADE_METRICS, wins: 1, losses: 1, breakevens: 1,
        win_rate_pct: 33.3, loss_rate_pct: 33.3, avg_gain_pct: 12, avg_loss_pct: 6,
        largest_gain_pct: 12, largest_loss_pct: 6, avg_win_cash: 120, avg_loss_cash: 60,
        expectancy_cash: 20, expectancy_pct: 2, adjusted_win_loss_ratio: 2, profit_factor_cash: 2,
        winner_holding_count: 1, loser_holding_count: 1,
      },
    } });
    await page.goto("/journal?tab=analytics");
    const forecast = page.getByTestId("journal-forecast");
    await forecast.getByLabel("Portfolio size (₹)", { exact: true }).fill("100000");
    await forecast.getByLabel("Position allocation (%)", { exact: true }).fill("25");
    await forecast.getByLabel("Target portfolio return (%)", { exact: true }).fill("10");
    await forecast.getByRole("button", { name: "Use journal averages", exact: true }).click();

    await expect(forecast.getByLabel("Average gain (%)", { exact: true })).toHaveValue("12");
    await expect(forecast.getByLabel("Average loss (% magnitude)", { exact: true })).toHaveValue("6");
    await expect(forecast.getByLabel("Winning trades (%)", { exact: true })).toHaveValue("50.00");
    await expect(forecast.getByLabel("Portfolio size (₹)", { exact: true })).toHaveValue("100000");
    await expect(forecast.getByLabel("Position allocation (%)", { exact: true })).toHaveValue("25");
    await expect(forecast.getByLabel("Target portfolio return (%)", { exact: true })).toHaveValue("10");
    await expect(page.getByTestId("journal-trading-edge")).toContainText("33.3%");
    await expect(forecast).toContainText("Winning percentage uses decisive trades; breakevens are excluded");
    await expect(forecast.getByText("Expected cash / trade", { exact: true }).locator("..")).toContainText("+₹750");
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
    await page.route("**/api/v1/broker/zerodha/import", async (route) => {
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

  test("broker import failure uses stable recovery copy", async ({ page }) => {
    await mockJournalRoutes(page, { brokerConnected: true });
    await page.route("**/api/v1/broker/zerodha/import", async (route) => {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ detail: "access_token expired for user@example.com" }),
      });
    });

    await page.goto("/journal");
    if (page.url().includes("/login")) return;

    await page.getByRole("button", { name: "Import from Zerodha" }).click();
    await expect(page.getByTestId("journal-toast")).toContainText("Broker import could not run. Check Broker or Data Status, then try again.", { timeout: 15_000 });
    await expect(page.getByTestId("journal-toast")).not.toContainText("access_token");
    await expect(page.getByTestId("journal-toast")).not.toContainText("user@example.com");
  });
});
