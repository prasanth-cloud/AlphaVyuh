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
const chartSmokeSymbols = String(process.env.PRODUCTION_API_CHART_SYMBOLS || "RELIANCE,ITC,AUBANK")
  .split(",")
  .map((symbol) => symbol.trim().toUpperCase())
  .filter(Boolean);
const fiveYearChartLimit = Number(process.env.PRODUCTION_API_5Y_CHART_LIMIT || 1300);
const fiveYearMinCandles = Number(process.env.PRODUCTION_API_5Y_MIN_CANDLES || Math.floor(252 * 5 * 0.9));
const fiveYearMinSpanDays = Number(process.env.PRODUCTION_API_5Y_MIN_SPAN_DAYS || (365 * 5 - 14));

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableFetchError(error) {
  const message = String(error?.message || error || "");
  return (
    error?.name === "AbortError" ||
    /aborted|fetch failed|ECONNRESET|ETIMEDOUT|terminated|network/i.test(message)
  );
}

async function fetchJson(path, options = {}) {
  const attempts = options.attempts ?? 3;
  const timeoutMs = options.timeoutMs ?? 15_000;
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
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
    } catch (error) {
      lastError = error?.name === "AbortError"
        ? new Error(`${path} timed out after ${timeoutMs}ms`)
        : error;
      if (attempt === attempts || !isRetryableFetchError(error)) {
        throw lastError;
      }
      await sleep((options.retryDelayMs ?? 1000) * attempt);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError || new Error(`${path} failed without an error.`);
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

function subtractYearsIso(value, years) {
  const parsed = parseIsoDate(value);
  assert(parsed, `Could not derive 5Y chart window from non-ISO date: ${value}`);
  const next = new Date(parsed.getTime());
  next.setUTCFullYear(next.getUTCFullYear() - years);
  return next.toISOString().slice(0, 10);
}

function numberValue(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function candleNumber(candle, field) {
  return numberValue(candle?.[field]);
}

function candleSignature(candle) {
  const values = [
    candleNumber(candle, "open"),
    candleNumber(candle, "high"),
    candleNumber(candle, "low"),
    candleNumber(candle, "close"),
    candleNumber(candle, "volume"),
  ];
  if (values.some((value) => value === null)) return null;
  return values.map((value) => Number(value).toFixed(4)).join("|");
}

function latestCandlePctChange(candles) {
  const latest = candles.at(-1);
  const previous = candles.at(-2);
  const stored = numberValue(latest?.pct_change, latest?.pctChange, latest?.change_pct, latest?.changePct);
  if (stored !== null) return stored;
  const latestClose = candleNumber(latest, "close");
  const previousClose = candleNumber(previous, "close");
  if (latestClose === null || previousClose === null || previousClose === 0) return null;
  return ((latestClose - previousClose) / previousClose) * 100;
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
  const unchanged = numberValue(summary?.unchanged);
  assert(totalStocks !== null && totalStocks >= 1000, `Market summary stock count looked too low: ${totalStocks}.`);
  assert(
    advances !== null && declines !== null && unchanged !== null,
    `Market summary did not include full breadth counts: advances=${advances}, declines=${declines}, unchanged=${unchanged}.`,
  );
  assert(
    advances > 0 && declines > 0,
    `Market summary did not include a two-sided breadth distribution: advances=${advances}, declines=${declines}.`,
  );
  assert(
    unchanged / totalStocks < 0.85 && (advances + declines) / totalStocks >= 0.08,
    `Market summary breadth looked implausibly flat: advances=${advances}, declines=${declines}, unchanged=${unchanged}, total=${totalStocks}.`,
  );

  assert(chartSmokeSymbols.length > 0, "No chart smoke symbols configured.");
  assert(Number.isFinite(fiveYearChartLimit) && fiveYearChartLimit >= fiveYearMinCandles, `5Y chart limit ${fiveYearChartLimit} is below the minimum candle contract ${fiveYearMinCandles}.`);
  const fiveYearStartDate = subtractYearsIso(summaryDate, 5);
  const chartSummaries = [];
  const latestPctChanges = [];
  for (const symbol of chartSmokeSymbols) {
    const candlePath = `/api/v1/charts/${encodeURIComponent(symbol)}/candles?timeframe=D&from_date=${fiveYearStartDate}&to_date=${summaryDate}&limit=${fiveYearChartLimit}`;
    const candles = await fetchJson(candlePath);
    assert(Array.isArray(candles?.candles), `${symbol} candles response did not include a candles array.`);
    assert(candles.candles.length > 0, `${symbol} candles response was empty.`);
    assert(
      candles.candles.length >= fiveYearMinCandles,
      `${symbol} daily 5Y chart history was too shallow: ${candles.candles.length} candles, expected at least ${fiveYearMinCandles}.`,
    );
    const latestCandleDate = candles.candles[candles.candles.length - 1]?.time || candles.coverage?.available_to;
    assert(latestCandleDate, `${symbol} candles response did not include a latest candle date.`);
    const firstCandleDate = candles.candles[0]?.time || candles.coverage?.available_from;
    assert(firstCandleDate, `${symbol} candles response did not include an earliest candle date.`);
    const parsedFirstCandleDate = parseIsoDate(firstCandleDate);
    const parsedLatestCandleDate = parseIsoDate(latestCandleDate);
    assert(parsedFirstCandleDate, `Earliest ${symbol} candle date was not ISO-like: ${firstCandleDate}`);
    assert(parsedLatestCandleDate, `Latest ${symbol} candle date was not ISO-like: ${latestCandleDate}`);
    const spanDays = daysBetween(parsedFirstCandleDate, parsedLatestCandleDate);
    assert(
      spanDays >= fiveYearMinSpanDays,
      `${symbol} daily chart history spans only ${spanDays} days; expected at least ${fiveYearMinSpanDays} days for the 5Y launch contract.`,
    );
    const contractStatus = candles.coverage?.five_year_contract?.status;
    assert(
      !contractStatus || contractStatus === "met",
      `${symbol} daily 5Y chart contract status was ${contractStatus}.`,
    );
    assertFreshDate(`Latest ${symbol} candle`, latestCandleDate, summaryDate);
    const latest = candles.candles.at(-1);
    const previous = candles.candles.at(-2);
    if (previous) {
      const latestSignature = candleSignature(latest);
      const previousSignature = candleSignature(previous);
      assert(
        latestSignature && previousSignature && latestSignature !== previousSignature,
        `${symbol} latest candle duplicates the previous session OHLCV/volume.`,
      );
      const pctChange = latestCandlePctChange(candles.candles);
      assert(pctChange !== null, `${symbol} latest candle did not expose or allow pct_change calculation.`);
      latestPctChanges.push({ symbol, pctChange });
    }
    chartSummaries.push(`${symbol} ${candles.candles.length} daily candles ${firstCandleDate}->${latestCandleDate}`);
  }
  assert(
    latestPctChanges.some((item) => Math.abs(item.pctChange) > 0.05),
    `Latest smoke candle pct_change values looked implausibly flat: ${
      latestPctChanges.map((item) => `${item.symbol}=${item.pctChange.toFixed(2)}%`).join(", ")
    }.`,
  );

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
      timeoutMs: 30_000,
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
    `charts ${chartSummaries.join("; ")}, ${scannerSummary}.`,
  );
} catch (error) {
  console.error(`Production API check failed: ${error instanceof Error ? error.message : String(error)}`);
  console.error("Fix the backend deployment or update NEXT_PUBLIC_API_URL/PRODUCTION_API_URL before shipping.");
  process.exit(1);
}
