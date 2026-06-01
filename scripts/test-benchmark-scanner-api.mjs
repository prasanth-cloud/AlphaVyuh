#!/usr/bin/env node
import http from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { strict as assert } from "node:assert";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function withServer(handler, test) {
  const server = http.createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const { port } = server.address();
    await test(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
  }
}

async function runBenchmark(apiUrl, extraEnv = {}) {
  const child = spawn(process.execPath, ["scripts/benchmark-scanner-api.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PRODUCTION_API_URL: apiUrl,
      ALLOW_LOCAL_API_CHECK: "1",
      SCANNER_BENCHMARK_RUNS: "2",
      SCANNER_BENCHMARK_WARMUP_RUNS: "1",
      ...extraEnv,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });

  const [code] = await once(child, "exit");
  return { code, stdout, stderr };
}

function readJsonBody(request) {
  return new Promise((resolve) => {
    let body = "";
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => resolve(body ? JSON.parse(body) : null));
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function scannerResponse(requestBody) {
  const filters = requestBody?.filters ?? {};
  const prefilters = [
    { op: "eq", column: "stock_universe.is_active", value: true },
    { op: "in_", column: "stock_universe.series", value: filters.series ?? ["EQ", "BE"] },
  ];
  if (filters.sector != null) {
    prefilters.push({ op: "in_", column: "stock_universe.sector", value: filters.sector });
  }
  if (filters.market === "IN") {
    prefilters.push({ op: "in_", column: "stock_universe.market", value: ["NSE", "BSE"] });
  }
  if (filters.market_cap_min != null) {
    prefilters.push({ op: "gte", column: "stock_universe.market_cap_cr", value: filters.market_cap_min });
  }
  if (filters.market_cap_max != null) {
    prefilters.push({ op: "lte", column: "stock_universe.market_cap_cr", value: filters.market_cap_max });
  }
  if (filters.pe_min != null) {
    prefilters.push({ op: "gte", column: "stock_universe.pe_ratio", value: filters.pe_min });
  }
  if (filters.pe_max != null) {
    prefilters.push({ op: "lte", column: "stock_universe.pe_ratio", value: filters.pe_max });
  }
  if (filters.debt_to_equity_max != null) {
    prefilters.push({ op: "lte", column: "stock_universe.debt_to_equity", value: filters.debt_to_equity_max });
  }
  if (filters.roe_min != null) {
    prefilters.push({ op: "gte", column: "stock_universe.roe", value: filters.roe_min });
  }
  if (filters.rs_score_min != null) {
    prefilters.push({ op: "gte", column: "rs_score", value: filters.rs_score_min });
  }
  if (filters.ema_200_trending_up === true) {
    prefilters.push({ op: "gt", column: "ema_200_slope_30d", value: 0 });
  }
  if (filters.avg_volume_50d_min != null) {
    prefilters.push({ op: "gte", column: "avg_volume_50d", value: filters.avg_volume_50d_min });
  }
  if (filters.darvas_box_height_pct_max != null) {
    prefilters.push({ op: "lte", column: "darvas_box_height_pct", value: filters.darvas_box_height_pct_max });
  }
  if (filters.volume_ratio_min != null) {
    prefilters.push({ op: "or_", column: "volume_ratio", value: `volume_ratio.is.null,volume_ratio.gte.${filters.volume_ratio_min}` });
  }
  if (filters.volume_ratio_max != null) {
    prefilters.push({ op: "or_", column: "volume_ratio", value: `volume_ratio.is.null,volume_ratio.lte.${filters.volume_ratio_max}` });
  }
  const w52hLimit = filters.w52h_pct_max ?? filters.week_52_high_pct_max;
  if (w52hLimit != null) {
    prefilters.push({ op: "or_", column: "w52h_pct", value: `w52h_pct.is.null,w52h_pct.gte.${-Math.abs(w52hLimit)}` });
    prefilters.push({ op: "or_", column: "w52h_pct", value: `w52h_pct.is.null,w52h_pct.lte.${Math.abs(w52hLimit)}` });
  }
  if (filters.w52l_pct_min != null) {
    prefilters.push({ op: "or_", column: "w52l_pct", value: `w52l_pct.is.null,w52l_pct.gte.${filters.w52l_pct_min}` });
  }

  const selectivePrefilters = prefilters.length > 2;
  const queryRows = selectivePrefilters ? 120 : 912;
  const queryReductionPct = selectivePrefilters ? 86.8 : 0;
  return {
    trade_date: "2026-05-29",
    total_matches: selectivePrefilters ? 34 : 265,
    visible_count: 10,
    results: [{ symbol: "RELIANCE", close: 100, volume_ratio: 2.4 }],
    query_rows: queryRows,
    source_rows: queryRows,
    query_row_reduction_pct: queryReductionPct,
    db_prefilters_applied: prefilters,
    source_metadata: {
      as_of: "2026-05-29",
      scanner_performance: {
        query_rows: queryRows,
        query_row_reduction_pct: queryReductionPct,
        db_prefilters_applied: prefilters,
        timing_ms: {
          date_lookup: 1,
          query: 3,
          filter: 2,
          vcp: 0,
          sort: 1,
          universe_count: 1,
          total: 8,
        },
      },
    },
  };
}

await withServer(async (request, response) => {
  response.setHeader("content-type", "application/json");
  if (request.url === "/api/v1/scanner/run" && request.method === "POST") {
    assert.equal(request.headers.authorization, "Bearer production-smoke-token");
    const requestBody = await readJsonBody(request);
    await sleep(8);
    response.end(JSON.stringify(scannerResponse(requestBody)));
    return;
  }

  response.writeHead(404);
  response.end(JSON.stringify({ error: "unexpected path" }));
}, async (apiUrl) => {
  const { code, stdout, stderr } = await runBenchmark(apiUrl, {
    PRODUCTION_API_BEARER_TOKEN: "production-smoke-token",
    SCANNER_BENCHMARK_MIN_QUERY_REDUCTION_PCT: "80",
  });
  assert.equal(code, 0, `scanner benchmark should pass:\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
  assert.match(stdout, /Scanner benchmark ok \(2 measured runs each, 1 warmup\):/);
  assert.match(stdout, /baseline: p50=\d+ms p95=\d+ms .*912 rows, 0% query reduction, 2 db prefilters/);
  assert.match(stdout, /trend-template: p50=\d+ms p95=\d+ms .*server total=8ms query=3ms filter=2ms .*120 rows, 86\.8% query reduction, [1-9]\d* db prefilters/);
  assert.match(stdout, /box-breakout: p50=\d+ms p95=\d+ms .*120 rows, 86\.8% query reduction, [1-9]\d* db prefilters/);
  assert.match(stdout, /fundamental-filters: p50=\d+ms p95=\d+ms .*120 rows, 86\.8% query reduction, 10 db prefilters/);
  assert.match(stdout, /Proof status: timing_captured_without_speedup_gate; broad fallbacks=0; missing DB prefilters=0; speedup enforced=no\./);

  const withBaseline = await runBenchmark(apiUrl, {
    PRODUCTION_API_BEARER_TOKEN: "production-smoke-token",
    SCANNER_BENCHMARK_MIN_QUERY_REDUCTION_PCT: "80",
    SCANNER_BENCHMARK_BASELINE_JSON: JSON.stringify({
      baseline: { p50: 1, p95: 1 },
      "trend-template": { p50: 500, p95: 500 },
      "box-breakout": { p50: 500, p95: 500 },
      "fundamental-filters": { p50: 500, p95: 500 },
    }),
    SCANNER_BENCHMARK_MIN_SPEEDUP: "2",
  });
  assert.equal(
    withBaseline.code,
    0,
    `scanner benchmark with baseline should pass:\nSTDOUT:\n${withBaseline.stdout}\nSTDERR:\n${withBaseline.stderr}`,
  );
  assert.match(withBaseline.stdout, /baseline: p50=\d+ms p95=\d+ms .*speedup p50=0\.\d+x p95=0\.\d+x/);
  assert.match(withBaseline.stdout, /trend-template: p50=\d+ms p95=\d+ms .*speedup p50=\d+(\.\d+)?x p95=\d+(\.\d+)?x/);
  assert.match(withBaseline.stdout, /fundamental-filters: p50=\d+ms p95=\d+ms .*speedup p50=\d+(\.\d+)?x p95=\d+(\.\d+)?x/);
  assert.match(withBaseline.stdout, /Proof status: speedup_target_met; broad fallbacks=0; missing DB prefilters=0; speedup enforced=2x\./);

  const missingSelectiveBaseline = await runBenchmark(apiUrl, {
    PRODUCTION_API_BEARER_TOKEN: "production-smoke-token",
    SCANNER_BENCHMARK_MIN_QUERY_REDUCTION_PCT: "80",
    SCANNER_BENCHMARK_BASELINE_JSON: JSON.stringify({
      "trend-template": { p50: 500, p95: 500 },
    }),
    SCANNER_BENCHMARK_MIN_SPEEDUP: "2",
  });
  assert.notEqual(missingSelectiveBaseline.code, 0, "speedup enforcement should fail when selective baselines are missing");
  assert.match(
    missingSelectiveBaseline.stderr,
    /box-breakout is missing p50\/p95 baseline data required by SCANNER_BENCHMARK_MIN_SPEEDUP/,
  );

  const outputDir = mkdtempSync(join(tmpdir(), "scanner-benchmark-"));
  try {
    const outputPath = join(outputDir, "benchmark.json");
    const withOutput = await runBenchmark(apiUrl, {
      PRODUCTION_API_BEARER_TOKEN: "production-smoke-token",
      SCANNER_BENCHMARK_MIN_QUERY_REDUCTION_PCT: "80",
      SCANNER_BENCHMARK_OUTPUT_JSON: outputPath,
    });
    assert.equal(
      withOutput.code,
      0,
      `scanner benchmark JSON output should pass:\nSTDOUT:\n${withOutput.stdout}\nSTDERR:\n${withOutput.stderr}`,
    );
    const output = JSON.parse(readFileSync(outputPath, "utf8"));
    assert.equal(output.runs, 2);
    assert.equal(output.warmup_runs, 1);
    assert.equal(output.api_base, apiUrl);
    assert.ok(Array.isArray(output.results), "benchmark output should include results array");
    assert.equal(output.proof.production_proof, "timing_captured_without_speedup_gate");
    assert.deepEqual(output.proof.broad_fallbacks, []);
    assert.deepEqual(output.proof.missing_db_prefilters, []);
    assert.equal(output.proof.selective_scenarios.length, 3);
    assert.ok(output.results.some((result) => result.name === "trend-template" && result.p50 >= 0 && result.p95 >= 0));
    assert.ok(output.results.some((result) => result.name === "fundamental-filters" && result.prefilterCount >= 10));
    assert.ok(output.results.some((result) => result.name === "trend-template" && result.timingMs?.total === 8));
  } finally {
    rmSync(outputDir, { recursive: true, force: true });
  }
});

await withServer(async (request, response) => {
  response.setHeader("content-type", "application/json");
  if (request.url === "/api/v1/scanner/run" && request.method === "POST") {
    await readJsonBody(request);
    response.end(JSON.stringify({
      trade_date: "2026-05-29",
      total_matches: 1,
      results: [{ symbol: "RELIANCE" }],
      source_metadata: { as_of: "2026-05-29" },
    }));
    return;
  }

  response.writeHead(404);
  response.end(JSON.stringify({ error: "unexpected path" }));
}, async (apiUrl) => {
  const outputDir = mkdtempSync(join(tmpdir(), "scanner-benchmark-failure-"));
  try {
    const outputPath = join(outputDir, "failed-benchmark.json");
    const { code, stdout, stderr } = await runBenchmark(apiUrl, {
      PRODUCTION_API_BEARER_TOKEN: "production-smoke-token",
      SCANNER_BENCHMARK_OUTPUT_JSON: outputPath,
    });
    assert.notEqual(code, 0, "scanner benchmark should fail when diagnostics are missing");
    assert.match(
      stderr,
      /trend-template response did not expose query_rows\/source_rows diagnostics|trend-template response did not expose query_row_reduction_pct/,
      `stderr should explain missing diagnostics, got:\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`,
    );

    const output = JSON.parse(readFileSync(outputPath, "utf8"));
    assert.equal(output.status, "failed");
    assert.equal(output.failure.scenario, "trend-template");
    assert.equal(output.proof.status, "failed");
    assert.equal(output.proof.production_proof, "failed");
    assert.equal(output.proof.failed_scenario, "trend-template");
    assert.match(output.failure.message, /trend-template response did not expose/);
    assert.ok(Array.isArray(output.results), "failed benchmark output should include partial results");
    assert.equal(output.results[0].name, "baseline");
  } finally {
    rmSync(outputDir, { recursive: true, force: true });
  }
});

await withServer(async (_request, response) => {
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify({ ok: true }));
}, async (apiUrl) => {
  const { code, stderr } = await runBenchmark(apiUrl, {
    PRODUCTION_API_BEARER_TOKEN: "",
    PRODUCTION_API_AUTH_TOKEN: "",
  });
  assert.notEqual(code, 0, "scanner benchmark should fail without an auth token");
  assert.match(stderr, /Scanner benchmark requires PRODUCTION_API_BEARER_TOKEN/);
});

console.log("scanner benchmark checker tests passed.");
