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

async function runChecker(apiUrl, extraEnv = {}) {
  const child = spawn(process.execPath, ["scripts/check-production-api.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PRODUCTION_API_URL: apiUrl,
      ALLOW_LOCAL_API_CHECK: "1",
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

await withServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(404, {
      "content-type": "application/json",
      "x-railway-fallback": "true",
    });
    response.end(JSON.stringify({
      status: "error",
      code: 404,
      message: "Application not found",
    }));
    return;
  }

  response.writeHead(500, { "content-type": "application/json" });
  response.end(JSON.stringify({ error: "unexpected path" }));
}, async (apiUrl) => {
  const { code, stdout, stderr } = await runChecker(apiUrl);
  assert.notEqual(code, 0, "production API check should fail on Railway fallback");
  assert.match(
    stderr,
    /Railway is returning its fallback response/,
    `stderr should explain Railway fallback, got:\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`,
  );
});

await withServer((request, response) => {
  response.setHeader("content-type", "application/json");
  if (request.url === "/health") {
    response.end(JSON.stringify({ status: "ok" }));
    return;
  }
  if (request.url === "/api/v1/market/summary") {
    response.end(JSON.stringify({ as_of: "2026-05-18", total_stocks: 3147, advances: 1000, declines: 900 }));
    return;
  }
  if (request.url === "/api/v1/charts/RELIANCE/candles?timeframe=D&limit=500") {
    response.end(JSON.stringify({
      candles: dailyCandles("2022-09-17", 200),
      coverage: { available_from: "2022-09-17", available_to: "2023-04-04" },
    }));
    return;
  }

  response.writeHead(404);
  response.end(JSON.stringify({ error: "unexpected path" }));
}, async (apiUrl) => {
  const { code, stdout, stderr } = await runChecker(apiUrl);
  assert.notEqual(code, 0, "production API check should fail on stale chart candles");
  assert.match(
    stderr,
    /Latest RELIANCE candle 2023-04-04 is stale versus market summary 2026-05-18/,
    `stderr should explain stale chart data, got:\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`,
  );
});

await withServer((request, response) => {
  response.setHeader("content-type", "application/json");
  if (request.url === "/health") {
    response.end(JSON.stringify({ status: "ok" }));
    return;
  }
  if (request.url === "/api/v1/market/summary") {
    response.end(JSON.stringify({ as_of: "2026-05-18", total_stocks: 3147, advances: 1000, declines: 900 }));
    return;
  }
  if (request.url === "/api/v1/charts/RELIANCE/candles?timeframe=D&limit=500") {
    response.end(JSON.stringify({
      candles: dailyCandles("2025-10-31", 200),
      coverage: { available_to: "2026-05-18" },
    }));
    return;
  }

  response.writeHead(404);
  response.end(JSON.stringify({ error: "unexpected path" }));
}, async (apiUrl) => {
  const { code, stdout, stderr } = await runChecker(apiUrl);
  assert.equal(code, 0, `production API check should pass on current data:\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
  assert.match(stdout, /RELIANCE candles 200 from 2025-10-31 through 2026-05-18/);
  assert.match(stdout, /scanner skipped/);
});

await withServer((request, response) => {
  response.setHeader("content-type", "application/json");
  if (request.url === "/health") {
    response.end(JSON.stringify({ status: "ok" }));
    return;
  }
  if (request.url === "/api/v1/market/summary") {
    response.end(JSON.stringify({ as_of: "2026-05-18", total_stocks: 3147, advances: 1000, declines: 900 }));
    return;
  }
  if (request.url === "/api/v1/charts/RELIANCE/candles?timeframe=D&limit=500") {
    response.end(JSON.stringify({
      candles: dailyCandles("2026-01-01", 60),
      coverage: { available_from: "2026-01-01", available_to: "2026-03-01" },
    }));
    return;
  }

  response.writeHead(404);
  response.end(JSON.stringify({ error: "unexpected path" }));
}, async (apiUrl) => {
  const { code, stdout, stderr } = await runChecker(apiUrl);
  assert.notEqual(code, 0, "production API check should fail on shallow chart history");
  assert.match(
    stderr,
    /RELIANCE chart history was too shallow for watchlist\/full-chart use: 60 candles/,
    `stderr should explain shallow chart history, got:\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`,
  );
});

await withServer((request, response) => {
  response.setHeader("content-type", "application/json");
  if (request.url === "/health") {
    response.end(JSON.stringify({ status: "ok" }));
    return;
  }
  if (request.url === "/api/v1/market/summary") {
    response.end(JSON.stringify({ as_of: "2026-05-18", total_stocks: 3147, advances: 1000, declines: 900 }));
    return;
  }
  if (request.url === "/api/v1/charts/RELIANCE/candles?timeframe=D&limit=500") {
    response.end(JSON.stringify({
      candles: dailyCandles("2025-10-31", 200),
      coverage: { available_from: "2025-10-31", available_to: "2026-05-18" },
    }));
    return;
  }
  if (request.url === "/api/v1/scanner/run" && request.method === "POST") {
    assert.equal(request.headers.authorization, "Bearer production-smoke-token");
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
}, async (apiUrl) => {
  const { code, stdout, stderr } = await runChecker(apiUrl, { PRODUCTION_API_BEARER_TOKEN: "production-smoke-token" });
  assert.equal(code, 0, `production API check should pass with authenticated scanner smoke:\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
  assert.match(stdout, /scanner 1\/265 matches through 2026-05-18/);
});

console.log("check-production-api fallback and candle freshness tests passed.");
