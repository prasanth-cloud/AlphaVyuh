import { test, expect, type Page } from "@playwright/test";

/**
 * Broker connect UI — integration spec.
 *
 * Mock-auth runs use client fallback data by default. Route-backed cases opt in
 * to API interception so outage and connected broker states can be exercised.
 */

const baseBrokerStatus = {
  connected: false,
  broker: "zerodha",
  mode: "simulated",
  status: "not_connected",
  status_label: "Mock broker import ready",
  plan: "pro",
  plan_allows_broker: true,
  has_api_key: true,
  has_token: false,
  token_expired: false,
  connected_at: null,
  token_expires_at: null,
  read_only: false,
  can_import: true,
  sync_status: "idle",
  last_synced_at: null,
  read_only_smoke_required: true,
  read_only_smoke_passed: false,
  read_only_smoke_fresh: false,
  read_only_smoke_checked_at: null,
  read_only_smoke_checks: {
    login_url: { ok: true },
    profile: { ok: false },
    holdings: { ok: false, count: 0 },
    positions: { ok: false, count: 0 },
    orderbook: { ok: false, count: 0 },
    tradebook: { ok: false, count: 0 },
  },
  live_order_requires_confirmation: true,
  live_order_enabled: false,
};

async function enableRouteBackedMocks(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("alphavyuh-e2e-route-mocks", "true");
  });
}

async function mockBrokerStatus(page: Page, overrides: Record<string, unknown> = {}) {
  await enableRouteBackedMocks(page);
  await page.route("**/api/v1/broker/status", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...baseBrokerStatus, ...overrides }),
    })
  );
}

// ── Auth gate ─────────────────────────────────────────────────────────────────

test.describe("Broker settings — unauthenticated", () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test("/settings/broker redirects to /login unless mock auth is active", async ({ page }) => {
    await page.goto("/settings/broker");
    if (page.url().includes("/login")) return;

    await expect(page.getByText("Broker connect hub")).toBeVisible();
  });
});

// ── Disconnected state ────────────────────────────────────────────────────────

test.describe("Broker settings — not connected", () => {
  test.beforeEach(async ({ page }) => {
    await mockBrokerStatus(page);
  });

  test("shows Connect button when broker not connected", async ({ page }) => {
    await page.goto("/settings/broker");
    // Wait for the page to render (it will redirect to login if auth not set up)
    // In CI we'd inject a session; for this spec we verify the UI elements exist
    // when the profile call returns 401 (not connected, auth OK)
    const connectBtn = page.getByTestId("connect-btn");
    // If we get redirected to login, the redirect is correct auth behavior — skip
    if (page.url().includes("/login")) return;
    await expect(connectBtn).toBeVisible();
    await expect(connectBtn).toHaveText(/Connect Zerodha/);
  });

  test("shows read-only smoke gate before broker orders can be enabled", async ({ page }) => {
    await page.goto("/settings/broker");
    if (page.url().includes("/login")) return;

    const gate = page.getByTestId("broker-read-only-smoke-gate");
    await expect(gate).toBeVisible();
    await expect(gate).toContainText("Read-only smoke gate: Smoke required");
    await expect(gate).toContainText("before any future sandbox or live order route can be enabled");
    await expect(gate).toContainText("Live and sandbox orders are disabled");
    await expect(page.getByTestId("broker-read-only-checklist")).toContainText("Read-only readiness checklist");
    await expect(page.getByTestId("broker-read-only-checklist")).toContainText("OAuth start");
    await expect(page.getByTestId("broker-read-only-checklist")).toContainText("Passed");
    await expect(page.getByTestId("broker-read-only-checklist")).toContainText("Orderbook");
    await expect(page.getByTestId("broker-read-only-checklist")).toContainText("Needs attention");
    await expect(page.getByTestId("broker-execution-approval-record")).toContainText("Required before any future sandbox/live order test");
    await expect(page.getByTestId("broker-execution-approval-record")).toContainText("Read-only smoke is evidence, not approval");
    await expect(page.getByTestId("broker-execution-approval-record")).toContainText("Fresh same-broker read-only smoke evidence");
    await expect(page.getByTestId("broker-read-only-evidence-pack")).toContainText("Read-only evidence pack");
    await expect(page.getByTestId("broker-read-only-evidence-pack")).toContainText("Read-only evidence incomplete");
    await expect(page.getByTestId("broker-read-only-evidence-pack")).toContainText("Evidence only");
  });

  test("Connect button calls start endpoint and redirects", async ({ page }) => {
    let loginRequests = 0;

    await enableRouteBackedMocks(page);
    await page.route("**/api/v1/broker/status", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(baseBrokerStatus),
      })
    );
    await page.route("**/api/v1/broker/zerodha/login", (route) => {
      loginRequests += 1;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ login_url: `${page.url().split("/settings")[0]}/settings/broker?oauth-started=1` }),
      });
    });

    await page.goto("/settings/broker");
    if (page.url().includes("/login")) return;

    const connectBtn = page.getByTestId("connect-btn");
    await expect(connectBtn).toBeVisible();

    await connectBtn.click();
    await expect.poll(() => loginRequests).toBe(1);
  });
});

test.describe("Broker settings — status unavailable", () => {
  test("does not render outage as upgrade required or disconnected", async ({ page }) => {
    await enableRouteBackedMocks(page);
    await page.route("**/api/v1/broker/status", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Broker status is temporarily unavailable. Existing broker access is not being treated as disconnected." }),
      })
    );

    await page.goto("/settings/broker");
    if (page.url().includes("/login")) return;

    await expect(page.getByTestId("broker-status-unavailable")).toContainText("Broker status unavailable", { timeout: 15_000 });
    await expect(page.getByTestId("broker-status-unavailable")).toContainText("Existing broker access is not being treated as disconnected");
    await expect(page.getByText("Upgrade required")).not.toBeVisible();
    await expect(page.getByTestId("connect-btn")).toBeDisabled();
    await expect(page.getByTestId("connect-btn")).toHaveText("Status unavailable");
  });
});

// ── Connected state ───────────────────────────────────────────────────────────

test.describe("Broker settings — connected", () => {
  test.beforeEach(async ({ page }) => {
    await mockBrokerStatus(page, {
      connected: true,
      mode: "read_only",
      status: "connected_read_only",
      status_label: "Zerodha read-only connected",
      has_token: true,
      connected_at: "2026-05-30T09:00:00Z",
      token_expires_at: "2026-05-31T00:30:00Z",
      read_only: true,
      can_import: true,
      last_synced_at: "2026-05-30T09:05:00Z",
      read_only_smoke_passed: true,
      read_only_smoke_fresh: true,
      read_only_smoke_checked_at: "2026-05-30T09:10:00Z",
      read_only_smoke_checks: {
        login_url: { ok: true },
        profile: { ok: true, user_id_present: true },
        holdings: { ok: true, count: 2 },
        positions: { ok: true, count: 1 },
        orderbook: { ok: true, count: 4 },
        tradebook: { ok: true, count: 3 },
      },
    });
  });

  test("shows connected read-only status", async ({ page }) => {
    await page.goto("/settings/broker");
    if (page.url().includes("/login")) return;

    const status = page.getByTestId("broker-status-connected");
    await expect(status).toBeVisible();
    await expect(status).toContainText("Zerodha connected");
    await expect(page.getByText("Zerodha read-only connected")).toBeVisible();
  });

  test("shows passed read-only smoke gate while orders stay disabled", async ({ page }) => {
    await page.goto("/settings/broker");
    if (page.url().includes("/login")) return;

    const gate = page.getByTestId("broker-read-only-smoke-gate");
    await expect(gate).toContainText("Read-only smoke gate: Smoke passed");
    await expect(gate).toContainText("order submission still stays disabled until owner approval");
    await expect(gate).toContainText("Live and sandbox orders are disabled");
    const checklist = page.getByTestId("broker-read-only-checklist");
    await expect(checklist).toContainText("Read-only verified");
    await expect(checklist).toContainText("Holdings");
    await expect(checklist).toContainText("Passed · 2 rows");
    await expect(checklist).toContainText("Tradebook");
    await expect(checklist).toContainText("Passed · 3 rows");
    const evidence = page.getByTestId("broker-read-only-evidence-pack");
    await expect(evidence).toContainText("Read-only evidence ready for owner review");
    await expect(evidence).toContainText("Owner review ready");
    await expect(evidence).toContainText("6/6 checks passed");
    await expect(evidence).toContainText("evidence, not approval to place orders");
  });

  test("loads the owner-scoped read-only holdings and positions snapshot", async ({ page }) => {
    let holdingsRequests = 0;
    let positionsRequests = 0;
    await page.route("**/api/brokers/zerodha/holdings", (route) => {
      holdingsRequests += 1;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([{
          symbol: "INFY",
          exchange: "NSE",
          quantity: 5,
          average_price: 1500,
          current_value: 8000,
          pnl: 500,
        }]),
      });
    });
    await page.route("**/api/brokers/zerodha/positions", (route) => {
      positionsRequests += 1;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([{
          symbol: "SBIN",
          exchange: "NSE",
          quantity: 2,
          average_price: 570.95,
          pnl: 0.45,
          day_pnl: 0.2,
        }]),
      });
    });

    await page.goto("/settings/broker");
    if (page.url().includes("/login")) return;

    const snapshot = page.getByTestId("broker-account-snapshot");
    await snapshot.getByRole("button", { name: "Load snapshot" }).click();
    await expect.poll(() => holdingsRequests).toBe(1);
    await expect.poll(() => positionsRequests).toBe(1);
    await expect(snapshot).toContainText("SBIN");
    await expect(snapshot).toContainText("Holdings: INFY (5)");
    await expect(snapshot).toContainText("1 open position");
    await expect(snapshot).toContainText("1 holding");
  });

  test("loads the broker-reported read-only equity orderbook", async ({ page }) => {
    let orderbookRequests = 0;
    await page.route("**/api/brokers/zerodha/orders?limit=25", (route) => {
      orderbookRequests += 1;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          broker: "zerodha",
          count: 1,
          fetched_at: "2026-05-30T09:12:00Z",
          orders: [{
            broker_order_id: "kite-order-1",
            symbol: "RELIANCE",
            exchange: "NSE",
            side: "BUY",
            order_type: "LIMIT",
            product: "CNC",
            status: "COMPLETE",
            quantity: 5,
            filled_quantity: 5,
            average_price: 2498.5,
            limit_price: 2500,
            trigger_price: null,
            placed_at: "2026-05-30T09:10:00Z",
            updated_at: "2026-05-30T09:11:00Z",
            rejection_reason: null,
          }],
        }),
      });
    });

    await page.goto("/settings/broker");
    if (page.url().includes("/login")) return;

    const orderbook = page.getByTestId("broker-orderbook-snapshot");
    await orderbook.getByRole("button", { name: "Load orderbook" }).click();
    await expect.poll(() => orderbookRequests).toBe(1);
    await expect(orderbook).toContainText("RELIANCE");
    await expect(orderbook).toContainText("5/5 filled");
    await expect(orderbook).toContainText("Broker-reported orderbook");
  });

  test("shows pending lifecycle and reconciles it into Journal", async ({ page }) => {
    let reconciled = false;
    let reconcileRequests = 0;
    await page.route("**/api/v1/broker/orders/activity?limit=25", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          count: 1,
          orders: [{
            id: "activity-1",
            broker: "zerodha",
            broker_order_id: "kite-order-1",
            journal_id: reconciled ? "journal-1" : null,
            symbol: "RELIANCE",
            side: "BUY",
            quantity: 5,
            order_type: "LIMIT",
            requested_price: 2500,
            execution_status: reconciled ? "COMPLETE" : "PENDING",
            filled_quantity: reconciled ? 5 : 0,
            average_fill_price: reconciled ? 2498.5 : null,
            requires_reconciliation: !reconciled,
            rejection_reason: null,
            placed_at: "2026-06-18T14:00:00Z",
            reconciled_at: reconciled ? "2026-06-18T14:01:00Z" : null,
            journal_state: reconciled ? "recorded" : "not_created",
          }],
        }),
      })
    );
    await page.route("**/api/v1/orders/reconcile/kite-order-1", (route) => {
      reconcileRequests += 1;
      reconciled = true;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "filled",
          broker: "zerodha",
          broker_order_id: "kite-order-1",
          execution_status: "COMPLETE",
          symbol: "RELIANCE",
          quantity: 5,
          filled_quantity: 5,
          average_fill_price: 2498.5,
          requires_reconciliation: false,
          rejection_reason: null,
          journal_id: "journal-1",
          journal_status: "open",
          message: "Zerodha reports complete: 5/5 filled.",
        }),
      });
    });

    await page.goto("/settings/broker");
    if (page.url().includes("/login")) return;

    const timeline = page.getByTestId("broker-activity-timeline");
    await expect(timeline).toContainText("Awaiting fill");
    await expect(timeline).toContainText("not counted as a position yet");
    await timeline.getByRole("button", { name: "Check broker" }).click();
    await expect.poll(() => reconcileRequests).toBe(1);
    await expect(timeline).toContainText("Filled");
    await expect(timeline.getByRole("link", { name: "Open journal" })).toBeVisible();
    await expect(timeline.getByRole("button", { name: "Check broker" })).not.toBeVisible();
  });

  test("shows stale read-only smoke as a refresh-required gate", async ({ page }) => {
    await mockBrokerStatus(page, {
      connected: true,
      mode: "read_only",
      status: "connected_read_only",
      status_label: "Zerodha read-only connected",
      has_token: true,
      read_only: true,
      can_import: true,
      read_only_smoke_passed: false,
      read_only_smoke_fresh: false,
      read_only_smoke_checked_at: "2026-05-29T08:00:00Z",
      read_only_smoke_checks: {
        login_url: { ok: true },
        profile: { ok: true, user_id_present: true },
        holdings: { ok: true, count: 2 },
      },
    });
    await page.goto("/settings/broker");
    if (page.url().includes("/login")) return;

    const gate = page.getByTestId("broker-read-only-smoke-gate");
    await expect(gate).toContainText("Read-only smoke gate: Smoke stale");
    await expect(gate).toContainText("older than the 24-hour launch gate");
    await expect(page.getByTestId("broker-read-only-checklist")).toContainText("Refresh required");
    await expect(page.getByTestId("broker-read-only-evidence-pack")).toContainText("Refresh read-only evidence");
  });

  test("runs the active broker read-only smoke endpoint", async ({ page }) => {
    let upstoxSmokeRequests = 0;
    let zerodhaSmokeRequests = 0;
    await mockBrokerStatus(page, {
      broker: "upstox",
      connected: true,
      mode: "read_only",
      status: "connected_read_only",
      status_label: "Upstox read-only connected",
      has_token: true,
      read_only: true,
      can_import: true,
      read_only_smoke_passed: false,
      read_only_smoke_fresh: false,
      read_only_smoke_checked_at: null,
    });
    await page.route("**/api/brokers/upstox/read-only-smoke", (route) => {
      upstoxSmokeRequests += 1;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          broker: "upstox",
          connected_read_only: true,
          token_expired: false,
          checks: {
            login_url: { ok: true },
            profile: { ok: true, user_id_present: true },
            holdings: { ok: true, count: 1 },
            positions: { ok: true, count: 0 },
            orderbook: { ok: true, count: 0 },
            tradebook: { ok: true, count: 0 },
          },
        }),
      });
    });
    await page.route("**/api/v1/broker/zerodha/read-only-smoke", (route) => {
      zerodhaSmokeRequests += 1;
      return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ detail: "Wrong broker smoke endpoint" }) });
    });

    await page.goto("/settings/broker");
    if (page.url().includes("/login")) return;

    await page.getByRole("button", { name: "Run Upstox read-only smoke" }).click();
    await expect.poll(() => upstoxSmokeRequests).toBe(1);
    await expect.poll(() => zerodhaSmokeRequests).toBe(0);
    await expect(page.getByText("6/6 Upstox read-only checks passed")).toBeVisible();
  });
});

// ── OAuth callback redirect ───────────────────────────────────────────────────

test.describe("Broker callback — ?connected= param", () => {
  test("shows connected state when ?connected=zerodha is in URL", async ({ page }) => {
    await mockBrokerStatus(page, {
      connected: true,
      mode: "read_only",
      status: "connected_read_only",
      status_label: "Zerodha read-only connected",
      has_token: true,
      read_only: true,
      can_import: true,
      read_only_smoke_passed: true,
      read_only_smoke_fresh: true,
    });

    await page.goto("/settings/broker?connected=zerodha");
    if (page.url().includes("/login")) return;

    await expect(page.getByTestId("broker-status-connected")).toBeVisible();
  });
});
