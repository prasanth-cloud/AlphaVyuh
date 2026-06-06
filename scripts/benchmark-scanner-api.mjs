#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";

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
const runs = Math.max(1, Number(process.env.SCANNER_BENCHMARK_RUNS || 5));
const warmupRuns = Math.max(0, Number(process.env.SCANNER_BENCHMARK_WARMUP_RUNS || 1));
const timeoutMs = Math.max(1000, Number(process.env.SCANNER_BENCHMARK_TIMEOUT_MS || 30_000));
const minQueryReductionPct = Number(process.env.SCANNER_BENCHMARK_MIN_QUERY_REDUCTION_PCT || 0);
const minSpeedup = Number(process.env.SCANNER_BENCHMARK_MIN_SPEEDUP || 0);
const requireDiagnostics = process.env.SCANNER_BENCHMARK_REQUIRE_DIAGNOSTICS !== "0";
const rawBaseline = String(
  process.env.SCANNER_BENCHMARK_BASELINE_JSON || process.env.SCANNER_BENCHMARK_BASELINE_PATH || "",
).trim();
const outputJsonPath = String(process.env.SCANNER_BENCHMARK_OUTPUT_JSON || "").trim();

const scenarios = [
  {
    name: "baseline",
    expectDbPrefilters: false,
    enforceSpeedup: false,
    body: {
      filters: { price_min: 1, series: ["EQ"] },
      sort_by: "volume_ratio",
      sort_order: "desc",
      page: 1,
      page_size: 10,
    },
  },
  {
    name: "trend-template",
    expectDbPrefilters: true,
    enforceSpeedup: true,
    body: {
      preset_id: "trend_template",
      filters: {
        all_smas_bullish: true,
        price_vs_ema50: "above",
        price_vs_ema150: "above",
        price_vs_sma50: "above",
        price_vs_sma150: "above",
        price_vs_sma200: "above",
        price_vs_ema200: "above",
        ema50_above_ema150: true,
        ema150_above_ema200: true,
        ema_200_trending_up: true,
        rsi_min: 50,
        rs_score_min: 70,
        week_52_high_pct_max: 25,
        w52l_pct_min: 30,
        series: ["EQ"],
      },
      sort_by: "setup_score",
      sort_order: "desc",
      page: 1,
      page_size: 10,
    },
  },
  {
    name: "box-breakout",
    expectDbPrefilters: true,
    enforceSpeedup: true,
    body: {
      preset_id: "darvas_box_breakout",
      filters: {
        week_52_high_pct_max: 8,
        price_vs_sma50: "above",
        volume_ratio_min: 1.5,
        atr_pct_max: 6,
        darvas_box_height_pct_max: 15,
        avg_volume_50d_min: 100000,
        series: ["EQ"],
      },
      sort_by: "setup_score",
      sort_order: "desc",
      page: 1,
      page_size: 10,
    },
  },
  {
    name: "fundamental-filters",
    expectDbPrefilters: true,
    enforceSpeedup: true,
    body: {
      filters: {
        series: ["EQ"],
        market: "IN",
        sector: ["Financial Services", "IT"],
        market_cap_min: 500,
        market_cap_max: 100000,
        pe_min: 1,
        pe_max: 80,
        roe_min: 10,
        debt_to_equity_max: 2,
      },
      sort_by: "volume_ratio",
      sort_order: "desc",
      page: 1,
      page_size: 10,
    },
  },
];

if (!apiBase) {
  console.log("Skipping scanner benchmark: PRODUCTION_API_URL or NEXT_PUBLIC_API_URL is not set.");
  process.exit(0);
}

if (
  process.env.ALLOW_LOCAL_API_CHECK !== "1" &&
  /^https?:\/\/(localhost|127\.0\.0\.1|\[?::1\]?)(:|\/|$)/i.test(apiBase)
) {
  console.log(`Skipping scanner benchmark for local URL: ${apiBase}`);
  console.log("Set ALLOW_LOCAL_API_CHECK=1 to benchmark a local backend.");
  process.exit(0);
}

if (!authToken) {
  console.error("Scanner benchmark requires PRODUCTION_API_BEARER_TOKEN or PRODUCTION_API_AUTH_TOKEN.");
  process.exit(1);
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
  const attempts = options.attempts ?? 2;
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${apiBase}${path}`, {
        method: options.method ?? "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
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
        throw new Error(`${path} returned ${response.status}: ${JSON.stringify(data).slice(0, 220)}`);
      }
      return data;
    } catch (error) {
      lastError = error?.name === "AbortError"
        ? new Error(`${path} timed out after ${timeoutMs}ms`)
        : error;
      if (attempt === attempts || !isRetryableFetchError(error)) {
        throw lastError;
      }
      await sleep(500 * attempt);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError || new Error(`${path} failed without an error.`);
}

function numberValue(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function latencyValue(baseline, ...keys) {
  for (const key of keys) {
    const value = numberValue(baseline?.[key]);
    if (value !== null && value > 0) return value;
  }
  return null;
}

function normalizeBaselineEntry(entry) {
  if (!entry || typeof entry !== "object") return null;
  const p50 = latencyValue(entry, "p50", "p50_ms", "p50Ms", "latency_p50_ms", "latencyP50Ms");
  const p95 = latencyValue(entry, "p95", "p95_ms", "p95Ms", "latency_p95_ms", "latencyP95Ms");
  if (p50 === null && p95 === null) return null;
  return { p50, p95 };
}

function loadBaseline(raw) {
  if (!raw) return new Map();

  const text = raw.startsWith("{") || raw.startsWith("[")
    ? raw
    : readFileSync(raw, "utf8");
  const parsed = JSON.parse(text);
  const entries = new Map();

  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      const name = String(item?.name || item?.scenario || "").trim();
      const baseline = normalizeBaselineEntry(item);
      if (name && baseline) entries.set(name, baseline);
    }
    return entries;
  }

  const source = Array.isArray(parsed?.results) ? parsed.results : parsed;
  if (Array.isArray(source)) {
    for (const item of source) {
      const name = String(item?.name || item?.scenario || "").trim();
      const baseline = normalizeBaselineEntry(item);
      if (name && baseline) entries.set(name, baseline);
    }
    return entries;
  }

  if (source && typeof source === "object") {
    for (const [name, value] of Object.entries(source)) {
      const baseline = normalizeBaselineEntry(value);
      if (baseline) entries.set(name, baseline);
    }
  }

  return entries;
}

function speedupRatio(baselineMs, currentMs) {
  if (!Number.isFinite(baselineMs) || !Number.isFinite(currentMs) || baselineMs <= 0 || currentMs <= 0) {
    return null;
  }
  return Number((baselineMs / currentMs).toFixed(2));
}

function speedupSummary(result, baseline) {
  if (!baseline) return null;
  return {
    p50: speedupRatio(baseline.p50, result.p50),
    p95: speedupRatio(baseline.p95, result.p95),
  };
}

function isBroadFallback(result) {
  return (
    result?.fallbackStage === "base_query" ||
    (result?.fallbackQuery === true && result?.prefilterCount === 0)
  );
}

function benchmarkProof(results, failure = null) {
  const selective = results.filter((result) => result?.enforceSpeedup === true);
  const selectiveScenarios = selective.map((result) => {
    const queryReductionGatePassed = minQueryReductionPct <= 0
      ? null
      : result.queryReductionPct !== null && result.queryReductionPct >= minQueryReductionPct;
    const speedupGatePassed = minSpeedup <= 0
      ? null
      : result.speedup_p50 !== null &&
        result.speedup_p50 >= minSpeedup &&
        result.speedup_p95 !== null &&
        result.speedup_p95 >= minSpeedup;

    return {
      name: result.name,
      p50: result.p50,
      p95: result.p95,
      speedup_p50: result.speedup_p50 ?? null,
      speedup_p95: result.speedup_p95 ?? null,
      query_reduction_pct: result.queryReductionPct,
      db_prefilters: result.prefilterCount,
      fallback_query: result.fallbackQuery,
      fallback_stage: result.fallbackStage,
      broad_fallback: isBroadFallback(result),
      db_prefilter_gate_passed: result.prefilterCount !== null && result.prefilterCount > 0,
      query_reduction_gate_passed: queryReductionGatePassed,
      speedup_gate_passed: speedupGatePassed,
    };
  });

  const broadFallbacks = selectiveScenarios
    .filter((scenario) => scenario.broad_fallback)
    .map((scenario) => scenario.name);
  const missingDbPrefilters = selectiveScenarios
    .filter((scenario) => !scenario.db_prefilter_gate_passed)
    .map((scenario) => scenario.name);
  const queryReductionFailures = selectiveScenarios
    .filter((scenario) => scenario.query_reduction_gate_passed === false)
    .map((scenario) => scenario.name);
  const speedupFailures = selectiveScenarios
    .filter((scenario) => scenario.speedup_gate_passed === false)
    .map((scenario) => scenario.name);

  let productionProof = "timing_captured_without_speedup_gate";
  if (failure) {
    productionProof = "failed";
  } else if (
    minSpeedup > 0 &&
    speedupFailures.length === 0 &&
    missingDbPrefilters.length === 0 &&
    broadFallbacks.length === 0
  ) {
    productionProof = "speedup_target_met";
  }

  return {
    status: failure ? "failed" : "ok",
    min_query_reduction_pct: minQueryReductionPct,
    min_speedup: minSpeedup,
    speedup_enforced: minSpeedup > 0,
    production_proof: productionProof,
    selective_scenarios: selectiveScenarios,
    broad_fallbacks: broadFallbacks,
    missing_db_prefilters: missingDbPrefilters,
    query_reduction_failures: queryReductionFailures,
    speedup_failures: speedupFailures,
    failed_scenario: failure?.scenario ?? null,
  };
}

function benchmarkPayload(results, failure = null) {
  const payload = {
    generated_at: new Date().toISOString(),
    status: failure ? "failed" : "ok",
    api_base: apiBase,
    runs,
    warmup_runs: warmupRuns,
    scenarios: results,
    results,
    proof: benchmarkProof(results, failure),
  };
  if (failure) payload.failure = failure;
  return payload;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function writeBenchmarkJson(results, failure = null) {
  if (!outputJsonPath) return;
  writeFileSync(outputJsonPath, `${JSON.stringify(benchmarkPayload(results, failure), null, 2)}\n`);
}

function dbPrefilterCount(scanner) {
  const topLevel = scanner?.db_prefilters_applied;
  if (Array.isArray(topLevel)) return topLevel.length;
  const metadata = scanner?.source_metadata?.scanner_performance?.db_prefilters_applied;
  if (Array.isArray(metadata)) return metadata.length;
  return null;
}

function scannerTiming(scanner) {
  const timing = scanner?.source_metadata?.scanner_performance?.timing_ms;
  return timing && typeof timing === "object" ? timing : null;
}

function scannerFallbackQuery(scanner) {
  const topLevel = scanner?.fallback_query;
  if (typeof topLevel === "boolean") return topLevel;
  const metadata = scanner?.source_metadata?.scanner_performance?.fallback_query;
  return typeof metadata === "boolean" ? metadata : null;
}

function scannerFallbackStage(scanner) {
  const topLevel = scanner?.fallback_stage;
  if (typeof topLevel === "string" && topLevel.trim()) return topLevel;
  const metadata = scanner?.source_metadata?.scanner_performance?.fallback_stage;
  return typeof metadata === "string" && metadata.trim() ? metadata : null;
}

function percentile(values, pct) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((pct / 100) * sorted.length) - 1);
  return sorted[index];
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function validateBenchmarkAuth() {
  try {
    const me = await fetchJson("/api/v1/me", { attempts: 1 });
    assert(me && typeof me === "object", "auth preflight did not return a user object.");
    return me;
  } catch (error) {
    const preflightError = new Error(
      `Scanner benchmark auth preflight failed before timing: ${errorMessage(error)}. ` +
        "The production smoke bearer token was rejected; rerun the smoke account preparation with a run-scoped QA user.",
    );
    preflightError.scenarioName = "auth-preflight";
    throw preflightError;
  }
}

async function runScenario(scenario) {
  for (let index = 0; index < warmupRuns; index += 1) {
    await fetchJson("/api/v1/scanner/run", {
      method: "POST",
      body: scenario.body,
    });
  }

  const samples = [];
  let lastResponse = null;

  for (let index = 0; index < runs; index += 1) {
    const started = performance.now();
    lastResponse = await fetchJson("/api/v1/scanner/run", {
      method: "POST",
      body: scenario.body,
    });
    samples.push(Math.round(performance.now() - started));
  }

  assert(Array.isArray(lastResponse?.results), `${scenario.name} response did not include results.`);
  assert(numberValue(lastResponse?.total_matches) !== null, `${scenario.name} response did not include total_matches.`);

  const queryRows = numberValue(
    lastResponse?.query_rows,
    lastResponse?.source_rows,
    lastResponse?.source_metadata?.scanner_performance?.query_rows,
    lastResponse?.source_metadata?.symbols_count,
  );
  const queryReductionPct = numberValue(
    lastResponse?.query_row_reduction_pct,
    lastResponse?.source_metadata?.scanner_performance?.query_row_reduction_pct,
  );
  const prefilterCount = dbPrefilterCount(lastResponse);
  const timingMs = scannerTiming(lastResponse);
  const fallbackQuery = scannerFallbackQuery(lastResponse);
  const fallbackStage = scannerFallbackStage(lastResponse);

  if (requireDiagnostics && scenario.expectDbPrefilters) {
    assert(queryRows !== null, `${scenario.name} response did not expose query_rows/source_rows diagnostics.`);
    assert(queryReductionPct !== null, `${scenario.name} response did not expose query_row_reduction_pct.`);
    assert(prefilterCount !== null && prefilterCount > 0, `${scenario.name} response did not expose db_prefilters_applied.`);
  }
  if (scenario.expectDbPrefilters && minQueryReductionPct > 0) {
    assert(
      queryReductionPct !== null && queryReductionPct >= minQueryReductionPct,
      `${scenario.name} query reduction ${queryReductionPct}% was below required ${minQueryReductionPct}%.`,
    );
  }

  return {
    name: scenario.name,
    runs,
    p50: percentile(samples, 50),
    p95: percentile(samples, 95),
    min: Math.min(...samples),
    max: Math.max(...samples),
    queryRows,
    queryReductionPct,
    prefilterCount,
    timingMs,
    fallbackQuery,
    fallbackStage,
    enforceSpeedup: scenario.enforceSpeedup === true,
    totalMatches: numberValue(lastResponse?.total_matches),
    visibleCount: Array.isArray(lastResponse?.results) ? lastResponse.results.length : null,
    tradeDate: lastResponse?.trade_date || lastResponse?.source_metadata?.as_of || null,
  };
}

let outputResults = [];
let activeScenario = null;

try {
  activeScenario = "auth-preflight";
  await validateBenchmarkAuth();
  activeScenario = null;

  const baselineByScenario = loadBaseline(rawBaseline);
  if (rawBaseline && baselineByScenario.size === 0) {
    throw new Error("SCANNER_BENCHMARK_BASELINE_JSON did not contain any scenario p50/p95 latency baselines.");
  }

  const results = [];
  for (const scenario of scenarios) {
    activeScenario = scenario.name;
    try {
      results.push(await runScenario(scenario));
      outputResults = [...results];
    } catch (error) {
      if (error && typeof error === "object") error.scenarioName = scenario.name;
      throw error;
    }
  }

  activeScenario = null;
  outputResults = results.map((result) => ({
    ...result,
    speedup_p50: null,
    speedup_p95: null,
  }));

  const enrichedResults = [];
  for (const [index, result] of results.entries()) {
    activeScenario = result.name;
    const baseline = baselineByScenario.get(result.name);
    const speedup = speedupSummary(result, baseline);
    const enriched = {
      ...result,
      speedup_p50: speedup?.p50 ?? null,
      speedup_p95: speedup?.p95 ?? null,
    };
    outputResults[index] = enriched;
    enrichedResults.push(enriched);

    if (result.enforceSpeedup && minSpeedup > 0) {
      try {
        assert(
          baseline,
          `${result.name} is missing p50/p95 baseline data required by SCANNER_BENCHMARK_MIN_SPEEDUP.`,
        );
        assert(
          speedup.p50 !== null && speedup.p50 >= minSpeedup,
          `${result.name} p50 speedup ${speedup.p50 ?? "unknown"}x was below required ${minSpeedup}x.`,
        );
        assert(
          speedup.p95 !== null && speedup.p95 >= minSpeedup,
          `${result.name} p95 speedup ${speedup.p95 ?? "unknown"}x was below required ${minSpeedup}x.`,
        );
      } catch (error) {
        if (error && typeof error === "object") error.scenarioName = result.name;
        throw error;
      }
    }
  }
  activeScenario = null;

  const summary = enrichedResults.map((result) => {
    const queryRows = result.queryRows === null ? "unknown rows" : `${result.queryRows} rows`;
    const reduction = result.queryReductionPct === null ? "unknown reduction" : `${result.queryReductionPct}% query reduction`;
    const prefilters = result.prefilterCount === null ? "unknown db prefilters" : `${result.prefilterCount} db prefilters`;
    const timingText = result.timingMs
      ? `, server total=${result.timingMs.total ?? "unknown"}ms query=${result.timingMs.query ?? "unknown"}ms filter=${result.timingMs.filter ?? "unknown"}ms`
      : "";
    const fallbackText = result.fallbackQuery ? `, fallback=${result.fallbackStage ?? "unknown"}` : "";
    const speedupText = result.speedup_p50 !== null || result.speedup_p95 !== null
      ? `, speedup p50=${result.speedup_p50 ?? "unknown"}x p95=${result.speedup_p95 ?? "unknown"}x`
      : "";
    return `${result.name}: p50=${result.p50}ms p95=${result.p95}ms min=${result.min}ms max=${result.max}ms${speedupText}${timingText}${fallbackText} ${queryRows}, ${reduction}, ${prefilters}, matches=${result.visibleCount}/${result.totalMatches}, date=${result.tradeDate ?? "unknown"}`;
  });

  writeBenchmarkJson(enrichedResults);

  console.log(`Scanner benchmark ok (${runs} measured run${runs === 1 ? "" : "s"} each, ${warmupRuns} warmup):`);
  for (const line of summary) {
    console.log(`- ${line}`);
  }
  const proof = benchmarkProof(enrichedResults);
  const speedupStatus = proof.speedup_enforced ? `${proof.min_speedup}x` : "no";
  console.log(
    `Proof status: ${proof.production_proof}; broad fallbacks=${proof.broad_fallbacks.length}; ` +
      `missing DB prefilters=${proof.missing_db_prefilters.length}; speedup enforced=${speedupStatus}.`,
  );
} catch (error) {
  writeBenchmarkJson(outputResults, {
    message: errorMessage(error),
    scenario: error?.scenarioName || activeScenario || null,
  });
  console.error(`Scanner benchmark failed: ${errorMessage(error)}`);
  process.exit(1);
}
