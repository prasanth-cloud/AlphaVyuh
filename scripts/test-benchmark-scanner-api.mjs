#!/usr/bin/env node
import http from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { strict as assert } from "node:assert";

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

function scannerResponse(requestBody) {
  const filters = requestBody?.filters ?? {};
  const prefilters = [];
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

  const queryRows = prefilters.length ? 120 : 912;
  const queryReductionPct = prefilters.length ? 86.8 : 0;
  return {
    trade_date: "2026-05-29",
    total_matches: prefilters.length ? 34 : 265,
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
      },
    },
  };
}

await withServer(async (request, response) => {
  response.setHeader("content-type", "application/json");
  if (request.url === "/api/v1/scanner/run" && request.method === "POST") {
    assert.equal(request.headers.authorization, "Bearer production-smoke-token");
    const requestBody = await readJsonBody(request);
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
  assert.match(stdout, /baseline: p50=\d+ms p95=\d+ms .*912 rows, 0% query reduction, 0 db prefilters/);
  assert.match(stdout, /trend-template: p50=\d+ms p95=\d+ms .*120 rows, 86\.8% query reduction, [1-9]\d* db prefilters/);
  assert.match(stdout, /box-breakout: p50=\d+ms p95=\d+ms .*120 rows, 86\.8% query reduction, [1-9]\d* db prefilters/);
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
  const { code, stdout, stderr } = await runBenchmark(apiUrl, {
    PRODUCTION_API_BEARER_TOKEN: "production-smoke-token",
  });
  assert.notEqual(code, 0, "scanner benchmark should fail when diagnostics are missing");
  assert.match(
    stderr,
    /trend-template response did not expose query_rows\/source_rows diagnostics|trend-template response did not expose query_row_reduction_pct/,
    `stderr should explain missing diagnostics, got:\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`,
  );
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
