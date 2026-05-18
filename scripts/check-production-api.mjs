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
const authToken = String(process.env.PRODUCTION_API_BEARER_TOKEN || process.env.PRODUCTION_API_AUTH_TOKEN || "").trim();

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

function numberValue(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function assertFreshDate(label, actualDate, summaryDate, maxLagDays = 10) {
  const parsedSummaryDate = parseIsoDate(summaryDate);
  const parsedActualDate = parseIsoDate(actualDate);
  assert(parsedSummaryDate, `Market summary date was not ISO-like: ${summaryDate}`);
  assert(parsedActualDate, `${label} date was not ISO-like: ${actualDate}`);
  assert(
    parsedActualDate <= parsedSummaryDate,
    `${label} ${actualDate} is after market summary date ${summaryDate}.`,
  );
  assert(
    daysBetween(parsedActualDate, parsedSummaryDate) <= maxLagDays,
    `${label} ${actualDate} is stale versus market summary ${summaryDate}.`,
  );
}

console.log(`Checking production API at ${apiBase}`);

try {
  const health = await fetchJson("/health");
  assert(health && typeof health === "object", "Health endpoint did not return JSON.");

  const summary = await fetchJson("/api/v1/market/summary");
  const summaryDate = summary?.trade_date || summary?.as_of || summary?.asOf;
  assert(summaryDate, "Market summary did not include a trade/as-of date.");
  const totalStocks = numberValue(summary?.total_stocks, summary?.total, summary?.symbols_count);
  const advances = numberValue(summary?.advances);
  const declines = numberValue(summary?.declines);
  assert(totalStocks !== null && totalStocks >= 1000, `Market summary stock count looked too low: ${totalStocks}.`);
  assert(
    (advances ?? 0) + (declines ?? 0) > 0,
    `Market summary did not include real breadth counts: advances=${advances}, declines=${declines}.`,
  );

  const candles = await fetchJson("/api/v1/charts/RELIANCE/candles?timeframe=D&limit=500");
  assert(Array.isArray(candles?.candles), "Candles response did not include a candles array.");
  assert(candles.candles.length > 0, "Candles response was empty for RELIANCE.");
  assert(
    candles.candles.length >= 120,
    `RELIANCE chart history was too shallow for watchlist/full-chart use: ${candles.candles.length} candles.`,
  );
  const latestCandleDate = candles.candles[candles.candles.length - 1]?.time || candles.coverage?.available_to;
  assert(latestCandleDate, "Candles response did not include a latest candle date.");
  const firstCandleDate = candles.candles[0]?.time || candles.coverage?.available_from;
  assert(firstCandleDate, "Candles response did not include an earliest candle date.");
  const parsedFirstCandleDate = parseIsoDate(firstCandleDate);
  const parsedLatestCandleDate = parseIsoDate(latestCandleDate);
  assert(parsedFirstCandleDate, `Earliest RELIANCE candle date was not ISO-like: ${firstCandleDate}`);
  assert(parsedLatestCandleDate, `Latest RELIANCE candle date was not ISO-like: ${latestCandleDate}`);
  assert(
    daysBetween(parsedFirstCandleDate, parsedLatestCandleDate) >= 180,
    `RELIANCE chart history spans only ${daysBetween(parsedFirstCandleDate, parsedLatestCandleDate)} days; expected at least 180 days.`,
  );
  assertFreshDate("Latest RELIANCE candle", latestCandleDate, summaryDate);

  let scannerSummary = "scanner skipped (set PRODUCTION_API_BEARER_TOKEN to verify authenticated scanner data)";
  if (authToken) {
    const scanner = await fetchJson("/api/v1/scanner/run", {
      method: "POST",
      headers: { Authorization: `Bearer ${authToken}` },
      body: {
        filters: { price_min: 1, series: ["EQ"] },
        sort_by: "volume_ratio",
        sort_order: "desc",
        page: 1,
        page_size: 10,
      },
      timeoutMs: 15_000,
    });
    assert(Array.isArray(scanner?.results), "Scanner response did not include a results array.");
    assert(scanner.results.length > 0, "Scanner returned no current EOD matches.");
    assert(numberValue(scanner?.total_matches) > 0, `Scanner total_matches looked empty: ${scanner?.total_matches}.`);
    const scannerDate = scanner?.trade_date || scanner?.as_of || scanner?.source_metadata?.as_of;
    assert(scannerDate, "Scanner response did not include trade/as-of date.");
    assertFreshDate("Scanner trade date", scannerDate, summaryDate);
    scannerSummary = `scanner ${scanner.results.length}/${scanner.total_matches} matches through ${scannerDate}`;
  }

  console.log(
    `Production API ok: summary ${summaryDate}, breadth ${advances}/${declines}, ` +
    `RELIANCE candles ${candles.candles.length} from ${firstCandleDate} through ${latestCandleDate}, ${scannerSummary}.`,
  );
} catch (error) {
  console.error(`Production API check failed: ${error instanceof Error ? error.message : String(error)}`);
  console.error("Fix the backend deployment or update NEXT_PUBLIC_API_URL/PRODUCTION_API_URL before shipping.");
  process.exit(1);
}
