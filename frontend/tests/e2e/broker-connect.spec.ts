import { test, expect } from "@playwright/test";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const notConnectedStatus = {
  connected: false,
  broker: "zerodha",
  mode: "simulated",
  status: "not_connected",
  status_label: "Broker import ready",
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
  live_order_requires_confirmation: true,
  live_order_enabled: false,
};

const connectedStatus = {
  ...notConnectedStatus,
  connected: true,
  status: "connected_read_only",
  mode: "read_only",
  has_token: true,
  read_only: true,
  connected_at: "2026-05-20T09:00:00Z",
  token_expires_at: "2026-05-21T00:30:00Z",
  broker_user_name: "Test Trader",
  status_label: "Read-only broker import connected",
};

test.describe("Broker settings — unauthenticated", () => {
  test.skip(process.env.PLAYWRIGHT_MOCK_AUTH === "true", "Mock auth intentionally bypasses app-route redirects.");

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test("/settings/broker redirects to /login when not signed in", async ({ page }) => {
    await page.goto("/settings/broker");
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("Broker settings — current read-only hub", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("alphavyuh-e2e-route-mocks", "true");
    });
  });

  test("shows Connect button when broker is not connected", async ({ page }) => {
    await page.route(`${API}/api/v1/broker/status`, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(notConnectedStatus) }),
    );

    await page.goto("/settings/broker");
    await expect(page.getByTestId("connect-btn")).toBeVisible();
    await expect(page.getByTestId("connect-btn")).toHaveText(/Connect Zerodha/);
    await expect(page.getByText("Broker execution stays in your broker terminal")).toBeVisible();
  });

  test("Connect button calls Zerodha login endpoint and enters opening state", async ({ page }) => {
    await page.route(`${API}/api/v1/broker/status`, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(notConnectedStatus) }),
    );
    await page.route(`${API}/api/v1/broker/zerodha/login`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ login_url: "https://kite.zerodha.com/connect/login?api_key=test&v=3&state=abc" }),
      }),
    );

    await page.goto("/settings/broker");
    const connectBtn = page.getByTestId("connect-btn");
    await expect(connectBtn).toBeVisible();

    const loginRequest = page.waitForRequest(`${API}/api/v1/broker/zerodha/login`);
    await connectBtn.click();
    await loginRequest;
  });

  test("does not render broker status outage as upgrade required or disconnected", async ({ page }) => {
    await page.route(`${API}/api/v1/broker/status`, (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Broker status is temporarily unavailable. Existing broker access is not being treated as disconnected." }),
      }),
    );

    await page.goto("/settings/broker");

    await expect(page.getByTestId("broker-status-unavailable")).toContainText("Broker status unavailable", { timeout: 15_000 });
    await expect(page.getByTestId("broker-status-unavailable")).toContainText("Existing broker access is not being treated as disconnected");
    await expect(page.getByText("Upgrade required")).not.toBeVisible();
    await expect(page.getByTestId("connect-btn")).toBeDisabled();
    await expect(page.getByTestId("connect-btn")).toHaveText("Status unavailable");
  });

  test("shows connected read-only status and import controls", async ({ page }) => {
    await page.route(`${API}/api/v1/broker/status`, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(connectedStatus) }),
    );

    await page.goto("/settings/broker");

    await expect(page.getByTestId("broker-status-connected")).toBeVisible();
    await expect(page.getByTestId("broker-status-connected")).toContainText("Zerodha connected");
    await expect(page.getByRole("button", { name: /Import Zerodha filled trades/i })).toBeEnabled();
    await expect(page.getByText("Order placement remains in your broker terminal.")).toBeVisible();
  });

  test("connected callback reloads status and shows read-only connected state", async ({ page }) => {
    await page.route(`${API}/api/v1/broker/status`, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(connectedStatus) }),
    );

    await page.goto("/settings/broker?connected=zerodha");

    await expect(page.getByTestId("broker-status-connected")).toBeVisible();
    await expect(page.getByText("Broker connected. Account reads and filled-trade import are available.")).toBeVisible();
  });
});
