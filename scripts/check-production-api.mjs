#!/usr/bin/env node

function normalizeApiBaseUrl(raw, fallback = "") {
  let cleaned = String(raw ?? "")
    .trim()
    .replace(/\\+[rnt]/g, "")
    .replace(/[\r\n\t]/g, "")
    .trim();

  while (
    cleaned.length >= 2 &&
    ((cleaned.startsWith('"') && cleaned.endsWith('"')) ||
      (cleaned.startsWith("'") && cleaned.endsWith("'")) ||
      (cleaned.startsWith("`") && cleaned.endsWith("`")))
  ) {
    cleaned = cleaned.slice(1, -1).trim();
  }

  cleaned = cleaned.replace(/\\+$/g, "").replace(/\/+$/, "");
  return cleaned || fallback;
}

const rawApiUrl = process.env.PRODUCTION_API_URL || process.env.NEXT_PUBLIC_API_URL;
const apiBase = normalizeApiBaseUrl(rawApiUrl);

if (!apiBase) {
  console.log("Skipping production API check: PRODUCTION_API_URL or NEXT_PUBLIC_API_URL is not set.");
  process.exit(0);
}

if (
  process.env.ALLOW_LOCAL_API_CHECK !== "1" &&
  /^https?:\/\/(localhost|127\.0\.0\.1|\[?::1\]?)(:|\/|$)/i.test(apiBase)
) {
  console.log(`Skipping production API check for local URL: ${apiBase}`);
  console.log("Set ALLOW_LOCAL_API_CHECK=1 to run the same data smoke against a local backend.");
  process.exit(0);
}

async function fetchJson(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 8000);
  try {
    const response = await fetch(`${apiBase}${path}`, {
      method: options.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        ...(options.headers ?? {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text.slice(0, 200) };
    }
    if (!response.ok) {
      const railwayFallback =
        response.headers.get("x-railway-fallback") === "true" ||
        String(data?.message ?? "").toLowerCase().includes("application not found");
      const hint = railwayFallback
        ? " Railway is returning its fallback response, so the backend service is not deployed or the domain is not attached to the service."
        : "";
      throw new Error(`${path} returned ${response.status}: ${JSON.stringify(data).slice(0, 220)}${hint}`);
    }
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function parseIsoDate(value) {
  if (!value || typeof value !== "string") return null;
  const match = value.match(/^\d{4}-\d{2}-\d{2}/);
  if (!match) return null;
  const parsed = new Date(`${match[0]}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function daysBetween(start, end) {
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

console.log(`Checking production API at ${apiBase}`);

try {
  const health = await fetchJson("/health");
  assert(health && typeof health === "object", "Health endpoint did not return JSON.");

  const summary = await fetchJson("/api/v1/market/summary");
  const summaryDate = summary?.trade_date || summary?.as_of || summary?.asOf;
  assert(summaryDate, "Market summary did not include a trade/as-of date.");

  const candles = await fetchJson("/api/v1/charts/RELIANCE/candles?timeframe=D&limit=5");
  assert(Array.isArray(candles?.candles), "Candles response did not include a candles array.");
  assert(candles.candles.length > 0, "Candles response was empty for RELIANCE.");
  const latestCandleDate = candles.candles[candles.candles.length - 1]?.time || candles.coverage?.available_to;
  assert(latestCandleDate, "Candles response did not include a latest candle date.");

  const parsedSummaryDate = parseIsoDate(summaryDate);
  const parsedCandleDate = parseIsoDate(latestCandleDate);
  assert(parsedSummaryDate, `Market summary date was not ISO-like: ${summaryDate}`);
  assert(parsedCandleDate, `Latest RELIANCE candle date was not ISO-like: ${latestCandleDate}`);
  assert(
    parsedCandleDate <= parsedSummaryDate,
    `Latest RELIANCE candle ${latestCandleDate} is after market summary date ${summaryDate}.`,
  );
  assert(
    daysBetween(parsedCandleDate, parsedSummaryDate) <= 10,
    `Latest RELIANCE candle ${latestCandleDate} is stale versus market summary ${summaryDate}.`,
  );

  console.log(`Production API ok: summary ${summaryDate}, RELIANCE candles ${candles.candles.length} through ${latestCandleDate}.`);
} catch (error) {
  console.error(`Production API check failed: ${error instanceof Error ? error.message : String(error)}`);
  console.error("Fix the backend deployment or update NEXT_PUBLIC_API_URL/PRODUCTION_API_URL before shipping.");
  process.exit(1);
}
