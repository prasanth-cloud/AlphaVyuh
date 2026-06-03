#!/usr/bin/env node
import { appendFileSync } from "node:fs";

const TRUSTED_PRODUCTION_API_URL = "https://alphavyuh-production.up.railway.app";
const TRUSTED_LIVE_URL = "https://www.alphavyuh.com";

function assertTrustedUrl(input, expected, label) {
  const raw = String(input || expected).trim();
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`${label} must be ${expected}`);
  }
  const expectedUrl = new URL(expected);
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.hostname !== expectedUrl.hostname ||
    parsed.port ||
    parsed.pathname.replace(/\/+$/, "") !== "" ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(`${label} must be exactly ${expected}`);
  }
  return expected;
}

function exportEnv(values) {
  if (!process.env.GITHUB_ENV) return;
  appendFileSync(process.env.GITHUB_ENV, `${Object.entries(values).map(([key, value]) => `${key}=${value}`).join("\n")}\n`);
}

try {
  const productionApiUrl = assertTrustedUrl(
    process.env.PRODUCTION_API_URL_INPUT,
    TRUSTED_PRODUCTION_API_URL,
    "PRODUCTION_API_URL",
  );
  const values = { PRODUCTION_API_URL: productionApiUrl };

  if (process.env.REQUIRE_LIVE_URL === "1") {
    values.PLAYWRIGHT_BASE_URL = assertTrustedUrl(
      process.env.LIVE_URL_INPUT,
      TRUSTED_LIVE_URL,
      "PLAYWRIGHT_BASE_URL",
    );
  }

  exportEnv(values);
  console.log("Production workflow targets ok: trusted production URLs selected.");
} catch (error) {
  console.error(`Production workflow target validation failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
