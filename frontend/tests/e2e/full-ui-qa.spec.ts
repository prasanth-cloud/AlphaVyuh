import { test, expect, type Page } from "@playwright/test";
import { qaCredentials } from "./helpers/qaCredentials";

const { email: EMAIL, password: PASSWORD } = qaCredentials();

type SignedInRoute = {
  path: string;
  name: string;
  marker: (page: Page) => Promise<void>;
};

async function login(page: Page) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20000 });
}

async function expectNoRuntimeErrors(page: Page, action: () => Promise<void>) {
  const errors: string[] = [];
  page.on("response", (response) => {
    if (response.status() >= 500) errors.push(`${response.status()} ${response.url()}`);
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await action();
  expect(errors.filter((entry) => !entry.includes("favicon"))).toEqual([]);
}

async function expectAnyCanvasHasPixels(page: Page) {
  await expect
    .poll(
      async () => {
        const hasPaintedCanvas = await page.locator("canvas").evaluateAll((canvases) =>
          canvases.some((canvas) => {
            const c = canvas as HTMLCanvasElement;
            if (c.width < 80 || c.height < 80) return false;
            const ctx = c.getContext("2d");
            if (!ctx) return false;
            const sample = ctx.getImageData(0, 0, c.width, c.height).data;
            for (let i = 3; i < sample.length; i += 4) {
              if (sample[i] !== 0) return true;
            }
            return false;
          })
        );
        if (hasPaintedCanvas) return true;

        const hasVisibleChartCanvas = await page.locator("canvas").evaluateAll((canvases) =>
          canvases.some((canvas) => {
            const rect = canvas.getBoundingClientRect();
            return rect.width >= 80 && rect.height >= 80;
          })
        );
        const body = await page.locator("body").innerText();
        return hasVisibleChartCanvas && /Last price:\s*₹/.test(body) && !/Last price:\s*Pending/.test(body);
      },
      { timeout: 20000, intervals: [500, 1000, 2000] }
    )
    .toBeTruthy();
}

const signedInRoutes: SignedInRoute[] = [
  {
    path: "/alerts",
    name: "scan alerts",
    marker: async (page) => {
      await expect(page.getByRole("heading", { name: "Scan matches" })).toBeVisible({ timeout: 15000 });
    },
  },
  {
    path: "/portfolio",
    name: "portfolio",
    marker: async (page) => {
      await expect(page.locator("body")).toContainText(/Portfolio|Open positions|Portfolio unavailable/i, { timeout: 15000 });
    },
  },
  {
    path: "/options",
    name: "options strategy builder",
    marker: async (page) => {
      await expect(page.getByText("Options Strategy Builder")).toBeVisible({ timeout: 15000 });
    },
  },
  {
    path: "/community",
    name: "community screens",
    marker: async (page) => {
      await expect(page.getByText("Community Screens")).toBeVisible({ timeout: 15000 });
    },
  },
  {
    path: "/upload",
    name: "trade report upload",
    marker: async (page) => {
      await expect(page.getByRole("heading", { name: "Upload trade report" })).toBeVisible({ timeout: 15000 });
    },
  },
  {
    path: "/agents",
    name: "agent mission control",
    marker: async (page) => {
      await expect(page.getByTestId("agent-mission-control")).toBeVisible({ timeout: 15000 });
    },
  },
  {
    path: "/data",
    name: "data status",
    marker: async (page) => {
      await expect(page.getByRole("heading", { name: "Know what is fresh before you trade." })).toBeVisible({ timeout: 15000 });
    },
  },
  {
    path: "/settings",
    name: "settings profile",
    marker: async (page) => {
      await expect(page.locator("body")).toContainText(/Profile|Account Access|Billing/i, { timeout: 15000 });
    },
  },
  {
    path: "/settings?tab=billing",
    name: "settings billing",
    marker: async (page) => {
      await expect(page.getByTestId("billing-launch-posture")).toBeVisible({ timeout: 15000 });
    },
  },
  {
    path: "/settings/broker",
    name: "broker settings",
    marker: async (page) => {
      await expect(page.locator("body")).toContainText(/Broker execution stays in your broker terminal|read-only broker import|Broker status unavailable/i, { timeout: 15000 });
    },
  },
];

test.describe.configure({ mode: "serial" });

test.setTimeout(60000);

test("public landing and auth buttons navigate without runtime errors", async ({ page }) => {
  await expectNoRuntimeErrors(page, async () => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: /Request access/i }).first()).toBeVisible();
    await expect(page.getByText("TradingView Lightweight Charts v5.")).toHaveCount(1);
    await expect(page.getByText("TradingView Lightweight Charts v4.")).toHaveCount(0);
    await page.getByRole("link", { name: /Sign in/i }).first().click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/");
    await page.getByRole("link", { name: /Request access/i }).first().click();
    await expect(page).toHaveURL(/\/signup/);
  });
});

test("signed-in app navigation and chart toolbar are functional", async ({ page }) => {
  await login(page);

  await expectNoRuntimeErrors(page, async () => {
    await page.goto("/charts/RELIANCE");
    await expect(page.locator("summary", { hasText: /1D|1W|1M|3M|6M|1Y|3Y|5Y|Max/ })).toBeVisible({ timeout: 15000 });
    const indicatorsButton = page.locator("button").filter({ hasText: /Indicators|EMA 20|EMA 50|RSI/ }).first();
    const chartToolsButton = page.getByRole("button", { name: "Open chart drawing tools", exact: true });
    await expect(indicatorsButton).toBeVisible();
    await expect(chartToolsButton).toBeVisible();
    await expectAnyCanvasHasPixels(page);

    const timeframeDropdown = page.locator(".chart-timeframe-dropdown").first();
    for (const label of ["1W", "1M", "1D"]) {
      await timeframeDropdown.evaluate((node) => { (node as HTMLDetailsElement).open = true; });
      await timeframeDropdown.getByRole("button", { name: label, exact: true }).click();
      await expectAnyCanvasHasPixels(page);
    }

    await indicatorsButton.click();
    for (const label of ["EMA 20", "EMA 50", "RSI"]) {
      await page.getByRole("button", { name: label, exact: true }).click();
      await page.getByRole("button", { name: label, exact: true }).click();
    }

    await chartToolsButton.click();
    await page.getByRole("button", { name: "Trendline T", exact: true }).click();
    await expect(chartToolsButton).toBeVisible();
    await expect(chartToolsButton).toContainText("Tools · Trendline");

    for (const path of ["/dashboard", "/scanner", "/watchlist", "/journal", "/alerts", "/settings"]) {
      await page.goto(path);
      await expect(page.locator("body")).toBeVisible();
      await expect(page.getByRole("link", { name: /Demo data|Latest session|Provider data/ })).toBeVisible();
    }
  });
});

test("secondary signed-in feature pages render their product surfaces", async ({ page }) => {
  await login(page);

  await expectNoRuntimeErrors(page, async () => {
    for (const route of signedInRoutes) {
      const response = await page.goto(route.path, { waitUntil: "domcontentloaded" });
      expect(response?.status(), `${route.name} should not resolve as a missing route`).not.toBe(404);
      await route.marker(page);
      await expect(page.locator("body"), `${route.name} should not show a generic crash`).not.toContainText(/Application error|Unhandled Runtime Error/i);
    }
  });
});

test("options strategy builder calculates payoff and Greeks from entered legs", async ({ page }) => {
  await login(page);

  await expectNoRuntimeErrors(page, async () => {
    await page.goto("/options", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Options Strategy Builder")).toBeVisible({ timeout: 15000 });

    const spotInput = page.getByPlaceholder("Spot price");
    const strikeInput = page.getByPlaceholder("e.g. 24000").first();
    const premiumInput = page.getByPlaceholder("e.g. 120").first();
    await expect(spotInput).toBeVisible();
    await spotInput.fill("24000");
    await expect(spotInput).toHaveValue("24000");
    await strikeInput.fill("24000");
    await expect(strikeInput).toHaveValue("24000");
    await premiumInput.fill("125");
    await expect(premiumInput).toHaveValue("125");
    const calculateButton = page.getByRole("button", { name: "Calculate Payoff" });
    await expect(calculateButton).toBeEnabled();
    await calculateButton.click();

    await expect(page.getByText("Max Profit")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Max Loss")).toBeVisible();
    await expect(page.getByText("Net Premium")).toBeVisible();
    await expect(page.getByText(/Combined Greeks \(at current spot\)/i)).toBeVisible();
    await expect(page.getByText("Delta", { exact: true })).toBeVisible();
    await expect(page.getByText("Theta", { exact: true })).toBeVisible();
    await expect(page.getByText("Set spot price, add legs, then click Calculate")).not.toBeVisible();
  });
});
