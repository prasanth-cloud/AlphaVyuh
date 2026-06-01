#!/usr/bin/env node
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
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

function dailyCandles(startDate, count) {
  const candles = [];
  const current = new Date(`${startDate}T00:00:00Z`);
  for (let index = 0; index < count; index += 1) {
    candles.push({
      time: current.toISOString().slice(0, 10),
      open: 100 + index,
      high: 102 + index,
      low: 99 + index,
      close: 101 + index,
      volume: 1000 + index,
    });
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return candles;
}

function chartResponse(symbol, startDate = "2021-05-18", count = 1827) {
  const candles = dailyCandles(startDate, count);
  const endDate = candles.at(-1)?.time;
  return JSON.stringify({
    symbol,
    timeframe: "D",
    candles,
    coverage: {
      available_from: startDate,
      available_to: endDate,
      requested_from: startDate,
      requested_to: endDate,
      requested_limit: 1300,
      returned_candles: candles.length,
      timeframe: "D",
      symbol,
      five_year_contract: {
        years: 5,
        minimum_calendar_days: 1811,
        minimum_daily_candles: 1200,
        status: "met",
      },
    },
  });
}

function serveHealthyApi(request, response) {
  response.setHeader("content-type", "application/json");
  if (serveSupabaseRest(request, response)) return;
  if (request.url === "/health") {
    response.end(JSON.stringify({ status: "ok" }));
    return;
  }
  if (request.url === "/api/v1/market/summary") {
    response.end(JSON.stringify({ as_of: "2026-05-18", total_stocks: 3147, advances: 1000, declines: 900, unchanged: 120 }));
    return;
  }
  if (request.url === "/api/v1/charts/RELIANCE/candles?timeframe=D&from_date=2021-05-18&to_date=2026-05-18&limit=1300") {
    response.end(chartResponse("RELIANCE"));
    return;
  }
  if (request.url === "/api/v1/charts/ITC/candles?timeframe=D&from_date=2021-05-18&to_date=2026-05-18&limit=1300") {
    response.end(chartResponse("ITC"));
    return;
  }
  if (request.url === "/api/v1/charts/AUBANK/candles?timeframe=D&from_date=2021-05-18&to_date=2026-05-18&limit=1300") {
    response.end(chartResponse("AUBANK"));
    return;
  }
  if (request.url === "/api/v1/scanner/run" && request.method === "POST") {
    response.end(JSON.stringify({
      trade_date: "2026-05-18",
      total_matches: 265,
      results: [{ symbol: "RELIANCE", close: 100, volume_ratio: 2.4 }],
      source_metadata: { as_of: "2026-05-18" },
    }));
    return;
  }

  response.writeHead(404);
  response.end(JSON.stringify({ error: "unexpected path" }));
}

function serveRailwayFallback(request, response) {
  if (serveSupabaseRest(request, response)) return;
  if (request.url === "/health") {
    response.writeHead(404, {
      "content-type": "application/json",
      "x-railway-fallback": "true",
    });
    response.end(JSON.stringify({ status: "error", code: 404, message: "Application not found" }));
    return;
  }

  response.writeHead(500, { "content-type": "application/json" });
  response.end(JSON.stringify({ error: "unexpected path" }));
}

function serveSupabaseRest(request, response) {
  const url = new URL(request.url, "http://127.0.0.1");
  if (
    url.pathname !== "/rest/v1/daily_ohlcv" &&
    url.pathname !== "/rest/v1/stock_universe" &&
    url.pathname !== "/rest/v1/ingest_runs"
  ) {
    return false;
  }

  response.setHeader("content-type", "application/json");
  response.setHeader("content-range", url.pathname.endsWith("stock_universe") ? "0-0/3447" : "0-0/3147");

  if (url.pathname.endsWith("daily_ohlcv") && url.searchParams.get("trade_date") === "eq.2026-05-18") {
    response.end(JSON.stringify([{ symbol: "RELIANCE" }]));
    return true;
  }
  if (url.pathname.endsWith("daily_ohlcv")) {
    response.end(JSON.stringify([{ trade_date: "2026-05-18" }]));
    return true;
  }
  if (url.pathname.endsWith("ingest_runs")) {
    response.end(JSON.stringify([
      {
        run_id: "market-breadth-snapshot-2026-05-18",
        started_at: "2026-05-18T13:00:00Z",
        meta: {
          snapshot: {
            status: "healthy",
            trade_date: "2026-05-18",
          },
        },
      },
      {
        run_id: "refresh-2026-05-18-120000",
        started_at: "2026-05-18T12:00:00Z",
        meta: {
          supplemental_data: {
            status: "healthy",
            warnings: [],
            rs_score: { status: "success", trade_date: "2026-05-18" },
            yfinance: {
              status: "success",
              attempted: 200,
              success: 200,
              failed: 0,
              coverage_pct: 100,
              rate_limited: 0,
              failure_reasons: {},
            },
          },
        },
      },
    ]));
    return true;
  }
  response.end(JSON.stringify([{ symbol: "RELIANCE" }]));
  return true;
}

function serveApiWithDegradedSupplemental(request, response) {
  const url = new URL(request.url, "http://127.0.0.1");
  if (url.pathname === "/rest/v1/ingest_runs") {
    response.setHeader("content-type", "application/json");
    response.setHeader("content-range", "0-0/1");
    response.end(JSON.stringify([{
      run_id: "refresh-2026-05-18-120000",
      started_at: "2026-05-18T12:00:00Z",
      meta: {
        supplemental_data: {
          status: "degraded",
          warnings: [
            "RS score calculation failed for the latest bhavcopy run.",
            "yfinance supplement degraded: 42/200 symbols updated.",
          ],
          rs_score: { status: "failed", trade_date: "2026-05-18" },
          yfinance: {
            status: "degraded",
            attempted: 200,
            success: 42,
            failed: 158,
            coverage_pct: 21,
            rate_limited: 155,
            failure_reasons: { rate_limited: 155, no_data: 3 },
          },
        },
      },
    }]));
    return;
  }
  serveHealthyApi(request, response);
}

function serveApiWithoutSupplementalRuns(request, response) {
  const url = new URL(request.url, "http://127.0.0.1");
  if (url.pathname === "/rest/v1/ingest_runs") {
    response.setHeader("content-type", "application/json");
    response.setHeader("content-range", "0-0/1");
    response.end(JSON.stringify([{
      run_id: "market-breadth-snapshot-2026-05-18",
      started_at: "2026-05-18T13:00:00Z",
      meta: {
        snapshot: {
          status: "healthy",
          trade_date: "2026-05-18",
        },
      },
    }]));
    return;
  }
  serveHealthyApi(request, response);
}

function makeFakeBin({ secrets = [], railwayReady = true, installRailway = true, workflowRuns = [], vercelEnv = {} }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "alphavyuh-recovery-bin-"));
  const secretOutput = secrets.map((secret) => `${secret}\t2026-05-18T00:00:00Z`).join("\n");
  const workflowOutput = JSON.stringify(workflowRuns);
  const vercelEnvOutput = Object.entries(vercelEnv)
    .map(([key, value]) => `${key}=${JSON.stringify(String(value))}`)
    .join("\n");
  const gh = `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === "secret" && args[1] === "list") {
  process.stdout.write(${JSON.stringify(secretOutput)});
  process.exit(0);
}
if (args[0] === "run" && args[1] === "list") {
  process.stdout.write(${JSON.stringify(workflowOutput)});
  process.exit(0);
}
process.stderr.write(\`unexpected gh args: \${args.join(" ")}\`);
process.exit(1);
`;
  const railway = railwayReady
    ? `#!/usr/bin/env node
if (process.argv[2] === "whoami") { console.log("AlphaVyuh"); process.exit(0); }
if (process.argv[2] === "status") { console.log(JSON.stringify({ project: "AlphaVyuh", service: "backend" })); process.exit(0); }
process.stderr.write("unexpected railway args");
process.exit(1);
`
    : `#!/usr/bin/env node
process.stderr.write("Unauthorized. Please run railway login again.");
process.exit(1);
`;
  const vercel = `#!/usr/bin/env node
const fs = require("fs");
const outPath = process.argv[4];
if (process.argv[2] === "env" && process.argv[3] === "pull" && outPath) {
  fs.writeFileSync(outPath, ${JSON.stringify(vercelEnvOutput)});
  process.exit(0);
}
process.stderr.write("unexpected vercel args");
process.exit(1);
`;

  fs.writeFileSync(path.join(dir, "gh"), gh, { mode: 0o755 });
  if (installRailway) {
    fs.writeFileSync(path.join(dir, "railway"), railway, { mode: 0o755 });
  }
  fs.writeFileSync(path.join(dir, "vercel"), vercel, { mode: 0o755 });
  return dir;
}

function resultNames(stdout) {
  return [...stdout.matchAll(/^\[(?:PASS|WARN|FAIL)] (.+)$/gm)].map((match) => match[1]);
}

async function runPreflight(apiUrl, fakeBin, extraEnv = {}) {
  const child = spawn(process.execPath, ["scripts/check-data-recovery-readiness.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PATH: `${fakeBin}${path.delimiter}${process.env.PATH}`,
      ALPHAVYUH_GH_BIN: path.join(fakeBin, "gh"),
      ALPHAVYUH_RAILWAY_BIN: path.join(fakeBin, "railway"),
      ALPHAVYUH_VERCEL_BIN: path.join(fakeBin, "vercel"),
      GITHUB_REPOSITORY: "prasanth-cloud/AlphaVyuh",
      PRODUCTION_API_URL: apiUrl,
      SUPABASE_URL: apiUrl,
      SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
      ALLOW_LOCAL_API_CHECK: "1",
      ALPHAVYUH_BACKEND_DIR: process.cwd(),
      PRODUCTION_API_CHART_SYMBOLS: "RELIANCE,ITC,AUBANK",
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

const requiredSecrets = ["RAILWAY_TOKEN", "RAILWAY_PROJECT_ID", "RAILWAY_SERVICE"];

await withServer(serveHealthyApi, async (apiUrl) => {
  const fakeBin = makeFakeBin({
    secrets: [...requiredSecrets, "PRODUCTION_API_BEARER_TOKEN"],
    railwayReady: true,
    vercelEnv: {
      NEXT_PUBLIC_API_URL: apiUrl,
      NEXT_PUBLIC_DATA_MODE: "live",
      NEXT_PUBLIC_ALLOW_MOCK_FALLBACK: "false",
    },
  });
  const { code, stdout, stderr } = await runPreflight(apiUrl, fakeBin);
  assert.equal(code, 0, `preflight should pass on healthy production API:\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
  assert.match(stdout, /Production API data smoke/);
  assert.match(stdout, /Vercel production env/);
  assert.match(stdout, /Frontend points at the recovery API URL; data mode is live; mock fallback is false/);
  assert.match(stdout, /Chart smoke config/);
  assert.match(stdout, /Production chart smoke will verify: RELIANCE, ITC, AUBANK/);
  assert.match(stdout, /Authenticated app smoke/);
  assert.match(stdout, /Skipped scanner\/watchlist authenticated API verification/);
  assert.match(stdout, /Supplemental refresh data/);
  assert.match(stdout, /Latest supplemental run refresh-2026-05-18-120000 supplemental status is healthy/);
  assert.match(stdout, /Skipped 1 newer non-supplemental ingest run/);
  assert.deepEqual(resultNames(stdout).slice(0, 7), [
    "Production API data smoke",
    "Vercel production env",
    "Supabase EOD data",
    "Supplemental refresh data",
    "Chart smoke config",
    "Authenticated app smoke",
    "GitHub recovery secrets",
  ]);
  assert.match(stdout, /Public API recovery status: production data API is serving real EOD smoke data/);
  assert.match(stdout, /Full app recovery status: not complete until authenticated scanner\/watchlist and signed-in browser smoke pass/);
});

await withServer(serveApiWithDegradedSupplemental, async (apiUrl) => {
  const fakeBin = makeFakeBin({
    secrets: [...requiredSecrets, "PRODUCTION_API_BEARER_TOKEN"],
    railwayReady: true,
    vercelEnv: {
      NEXT_PUBLIC_API_URL: apiUrl,
      NEXT_PUBLIC_DATA_MODE: "live",
      NEXT_PUBLIC_ALLOW_MOCK_FALLBACK: "false",
    },
  });
  const { code, stdout, stderr } = await runPreflight(apiUrl, fakeBin);
  assert.equal(code, 0, `public recovery should pass while warning on degraded supplemental data:\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
  assert.match(stdout, /\[WARN] Supplemental refresh data/);
  assert.match(stdout, /supplemental status is degraded/);
  assert.match(stdout, /RS score: failed/);
  assert.match(stdout, /yfinance: degraded \(42\/200 symbols, rate_limited=155\)/);
  assert.match(stdout, /Inspect Daily NSE refresh logs before trusting RS-ranked scanner output/);
});

await withServer(serveApiWithoutSupplementalRuns, async (apiUrl) => {
  const fakeBin = makeFakeBin({
    secrets: [...requiredSecrets, "PRODUCTION_API_BEARER_TOKEN"],
    railwayReady: true,
    vercelEnv: {
      NEXT_PUBLIC_API_URL: apiUrl,
      NEXT_PUBLIC_DATA_MODE: "live",
      NEXT_PUBLIC_ALLOW_MOCK_FALLBACK: "false",
    },
  });
  const { code, stdout, stderr } = await runPreflight(apiUrl, fakeBin);
  assert.equal(code, 0, `public recovery should pass while warning when recent runs lack supplemental metadata:\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
  assert.match(stdout, /\[WARN] Supplemental refresh data/);
  assert.match(stdout, /No supplemental data trust metadata found in the latest 1 ingest run/);
  assert.match(stdout, /Run the current Daily NSE refresh before treating RS\/yfinance coverage as verified/);
});

await withServer(serveHealthyApi, async (apiUrl) => {
  const fakeBin = makeFakeBin({
    secrets: [...requiredSecrets, "PRODUCTION_API_BEARER_TOKEN"],
    railwayReady: true,
    vercelEnv: {
      NEXT_PUBLIC_API_URL: apiUrl,
      NEXT_PUBLIC_DATA_MODE: "live",
      NEXT_PUBLIC_ALLOW_MOCK_FALLBACK: "false",
    },
  });
  const { code, stdout, stderr } = await runPreflight(apiUrl, fakeBin, {
    PRODUCTION_API_BEARER_TOKEN: "production-smoke-token",
  });
  assert.equal(code, 0, `preflight should pass on healthy production API with authenticated smoke token:\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
  assert.match(stdout, /Authenticated app smoke/);
  assert.match(stdout, /Production API check included authenticated scanner verification/);
  assert.match(stdout, /Full app recovery status: authenticated scanner verification passed; run the signed-in browser smoke before launch/);
});

await withServer(serveHealthyApi, async (apiUrl) => {
  const fakeBin = makeFakeBin({
    secrets: [...requiredSecrets, "PRODUCTION_API_BEARER_TOKEN"],
    installRailway: false,
    vercelEnv: {
      NEXT_PUBLIC_API_URL: apiUrl,
      NEXT_PUBLIC_DATA_MODE: "live",
      NEXT_PUBLIC_ALLOW_MOCK_FALLBACK: "false",
    },
  });
  const { code, stdout, stderr } = await runPreflight(apiUrl, fakeBin, {
    PRODUCTION_API_BEARER_TOKEN: "production-smoke-token",
    REQUIRE_AUTHENTICATED_SMOKE: "1",
  });
  assert.equal(code, 0, `strict preflight should not fail a recovered API because local Railway CLI is absent:\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
  assert.match(stdout, /\[WARN] Local Railway CLI/);
  assert.match(stdout, /spawn .*railway ENOENT/);
  assert.match(stdout, /Production API check included authenticated scanner verification/);
  assert.equal(stderr, "");
});

await withServer(serveHealthyApi, async (apiUrl) => {
  const fakeBin = makeFakeBin({
    secrets: [...requiredSecrets, "PRODUCTION_API_BEARER_TOKEN"],
    railwayReady: true,
    vercelEnv: {
      NEXT_PUBLIC_API_URL: apiUrl,
      NEXT_PUBLIC_DATA_MODE: "live",
      NEXT_PUBLIC_ALLOW_MOCK_FALLBACK: "false",
    },
  });
  const { code, stdout, stderr } = await runPreflight(apiUrl, fakeBin, {
    REQUIRE_AUTHENTICATED_SMOKE: "1",
  });
  assert.notEqual(code, 0, `strict preflight should fail without authenticated smoke token:\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
  assert.match(stdout, /Skipped scanner\/watchlist authenticated API verification/);
  assert.match(stdout, /Full app recovery status: not complete until authenticated scanner\/watchlist and signed-in browser smoke pass/);
});

await withServer(serveRailwayFallback, async (apiUrl) => {
  const fakeBin = makeFakeBin({
    secrets: [],
    railwayReady: false,
    vercelEnv: {
      NEXT_PUBLIC_API_URL: apiUrl,
      NEXT_PUBLIC_DATA_MODE: "live",
      NEXT_PUBLIC_ALLOW_MOCK_FALLBACK: "false",
    },
  });
  const { code, stdout, stderr } = await runPreflight(apiUrl, fakeBin);
  assert.notEqual(code, 0, "preflight should fail when API is down and no recovery path is ready");
  assert.match(stdout, /Missing required secrets: RAILWAY_TOKEN, RAILWAY_PROJECT_ID, RAILWAY_SERVICE/);
  assert.match(stdout, /Frontend points at the recovery API URL; data mode is live; mock fallback is false/);
  assert.match(stdout, /Production chart smoke will verify: RELIANCE, ITC, AUBANK/);
  assert.match(stdout, /No Railway Backend Recovery workflow runs found/);
  assert.match(stdout, /(?:Unauthorized\. Please run railway login again|Railway CLI is not authenticated locally)/);
  assert.match(stdout, /npm run recover:railway-backend:login/);
  assert.deepEqual(resultNames(stdout), [
    "Production API data smoke",
    "Vercel production env",
    "Supabase EOD data",
    "Supplemental refresh data",
    "Chart smoke config",
    "GitHub recovery secrets",
    "Railway recovery workflow",
    "Local Railway CLI",
  ]);
  assert.match(stdout, /Recovery status: backend is down and no deploy path is ready yet/);
  assert.equal(stderr, "");
});

await withServer(serveRailwayFallback, async (apiUrl) => {
  const fakeBin = makeFakeBin({
    secrets: requiredSecrets,
    railwayReady: false,
    vercelEnv: {
      NEXT_PUBLIC_API_URL: apiUrl,
      NEXT_PUBLIC_DATA_MODE: "live",
      NEXT_PUBLIC_ALLOW_MOCK_FALLBACK: "false",
    },
    workflowRuns: [{
      status: "completed",
      conclusion: "failure",
      createdAt: "2026-05-18T21:00:00Z",
      url: "https://github.com/prasanth-cloud/AlphaVyuh/actions/runs/1",
    }],
  });
  const { code, stdout } = await runPreflight(apiUrl, fakeBin);
  assert.notEqual(code, 0, "preflight should fail until production API recovers");
  assert.match(stdout, /Required Railway recovery secrets are present/);
  assert.match(stdout, /Recovery smoke secrets not set: PRODUCTION_API_BEARER_TOKEN, PLAYWRIGHT_QA_EMAIL, PLAYWRIGHT_QA_PASSWORD/);
  assert.match(stdout, /Optional secrets not set: RAILWAY_WORKSPACE, PRODUCTION_API_CHART_SYMBOLS/);
  assert.match(stdout, /Latest run 2026-05-18T21:00:00Z is failure/);
  assert.match(stdout, /Recovery status: backend still needs recovery, but at least one deploy path appears ready/);
  assert.match(stdout, /npm run recover:railway-backend:login/);
});

await withServer(serveRailwayFallback, async (apiUrl) => {
  const fakeBin = makeFakeBin({
    secrets: requiredSecrets,
    railwayReady: true,
    vercelEnv: {
      NEXT_PUBLIC_API_URL: apiUrl,
      NEXT_PUBLIC_DATA_MODE: "live",
      NEXT_PUBLIC_ALLOW_MOCK_FALLBACK: "false",
    },
  });
  const { code, stdout } = await runPreflight(apiUrl, fakeBin, {
    PRODUCTION_API_CHART_SYMBOLS: " , ",
  });
  assert.notEqual(code, 0, "preflight should fail when chart smoke symbols are explicitly empty");
  assert.match(stdout, /No chart smoke symbols are configured/);
});

await withServer(serveRailwayFallback, async (apiUrl) => {
  const fakeBin = makeFakeBin({
    secrets: requiredSecrets,
    railwayReady: true,
    vercelEnv: {
      NEXT_PUBLIC_API_URL: "same-origin",
      NEXT_PUBLIC_DATA_MODE: "live",
      NEXT_PUBLIC_ALLOW_MOCK_FALLBACK: "false",
    },
  });
  const { code, stdout } = await runPreflight(apiUrl, fakeBin);
  assert.notEqual(code, 0, "preflight should still fail until the same-origin API smoke passes");
  assert.match(stdout, /Frontend uses same-origin recovery API/);
  assert.doesNotMatch(stdout, /NEXT_PUBLIC_API_URL does not match the recovery API URL/);
});

await withServer(serveRailwayFallback, async (apiUrl) => {
  const fakeBin = makeFakeBin({
    secrets: requiredSecrets,
    railwayReady: true,
    vercelEnv: {
      NEXT_PUBLIC_API_URL: "https://old-backend.example.com",
      NEXT_PUBLIC_DATA_MODE: "live",
      NEXT_PUBLIC_ALLOW_MOCK_FALLBACK: "false",
    },
  });
  const { code, stdout } = await runPreflight(apiUrl, fakeBin);
  assert.notEqual(code, 0, "preflight should fail when Vercel production API URL targets a different backend");
  assert.match(stdout, /NEXT_PUBLIC_API_URL does not match the recovery API URL/);
});

await withServer(serveRailwayFallback, async (apiUrl) => {
  const fakeBin = makeFakeBin({
    secrets: requiredSecrets,
    railwayReady: true,
    vercelEnv: {
      NEXT_PUBLIC_API_URL: apiUrl,
      NEXT_PUBLIC_DATA_MODE: "live",
      NEXT_PUBLIC_ALLOW_MOCK_FALLBACK: "true",
    },
  });
  const { code, stdout } = await runPreflight(apiUrl, fakeBin);
  assert.notEqual(code, 0, "preflight should fail when production frontend mock fallback remains enabled");
  assert.match(stdout, /NEXT_PUBLIC_ALLOW_MOCK_FALLBACK is true/);
});

console.log("check-data-recovery-readiness tests passed.");
