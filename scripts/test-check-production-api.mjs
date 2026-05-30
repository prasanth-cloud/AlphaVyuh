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
    const close = 101 + index;
    const previousClose = index > 0 ? 100 + index : null;
    candles.push({
      time: current.toISOString().slice(0, 10),
      open: 100 + index,
      high: 102 + index,
      low: 99 + index,
      close,
      volume: 1000 + index,
      pct_change: previousClose ? Number((((close - previousClose) / previousClose) * 100).toFixed(2)) : 0,
    });
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return candles;
}

function tradingDayCandles(startDate, endDate, options = {}) {
  const candles = [];
  const current = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  let index = 0;
  while (current <= end) {
    const weekday = current.getUTCDay();
    if (weekday !== 0 && weekday !== 6) {
      const close = 101 + index;
      const previousClose = index > 0 ? 100 + index : null;
      candles.push({
        time: current.toISOString().slice(0, 10),
        open: 100 + index,
        high: 102 + index,
        low: 99 + index,
        close,
        volume: 1000 + index,
        pct_change: previousClose ? Number((((close - previousClose) / previousClose) * 100).toFixed(2)) : 0,
      });
      index += 1;
    }
    current.setUTCDate(current.getUTCDate() + 1);
  }
  if (options.duplicateLatest && candles.length >= 2) {
    const previous = candles.at(-2);
    candles[candles.length - 1] = {
      ...previous,
      time: candles.at(-1).time,
      pct_change: 0,
    };
  }
  return candles;
}

function chartResponse(symbol, startDate = "2021-05-18", endDate = "2026-05-18", options = {}) {
  const candles = tradingDayCandles(startDate, endDate, options);
  return JSON.stringify({
    symbol,
    timeframe: "D",
    candles,
    coverage: {
      requested_from: "2021-05-18",
      requested_to: "2026-05-18",
      available_from: startDate,
      available_to: candles.at(-1)?.time,
      returned_candles: candles.length,
      requested_limit: 1300,
      timeframe: "D",
      symbol,
      five_year_contract: {
        years: 5,
        minimum_calendar_days: 1811,
        minimum_daily_candles: 1134,
        status: "met",
      },
    },
  });
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
    response.end(JSON.stringify({ as_of: "2026-05-18", total_stocks: 3147, advances: 1000, declines: 900, unchanged: 120 }));
    return;
  }
  if (request.url === "/api/v1/charts/RELIANCE/candles?timeframe=D&from_date=2021-05-18&to_date=2026-05-18&limit=1300") {
    response.end(chartResponse("RELIANCE", "2021-04-01", "2026-04-04"));
    return;
  }

  response.writeHead(404);
  response.end(JSON.stringify({ error: "unexpected path" }));
}, async (apiUrl) => {
  const { code, stdout, stderr } = await runChecker(apiUrl);
  assert.notEqual(code, 0, "production API check should fail on stale chart candles");
  assert.match(
    stderr,
    /Latest RELIANCE candle 2026-04-03 is stale versus market summary 2026-05-18/,
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
    response.end(JSON.stringify({ as_of: "2026-05-18", total_stocks: 3147, advances: 0, declines: 2, unchanged: 2462 }));
    return;
  }

  response.writeHead(404);
  response.end(JSON.stringify({ error: "unexpected path" }));
}, async (apiUrl) => {
  const { code, stdout, stderr } = await runChecker(apiUrl);
  assert.notEqual(code, 0, "production API check should fail on implausibly flat breadth");
  assert.match(
    stderr,
    /Market summary did not include a two-sided breadth distribution|Market summary breadth looked implausibly flat/,
    `stderr should explain flat breadth, got:\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`,
  );
});

await withServer((request, response) => {
  response.setHeader("content-type", "application/json");
  if (request.url === "/health") {
    response.end(JSON.stringify({ status: "ok" }));
    return;
  }
  if (request.url === "/api/v1/market/summary") {
    response.end(JSON.stringify({ as_of: "2026-05-18", total_stocks: 3147, advances: 1000, declines: 900, unchanged: 120 }));
    return;
  }
  if (request.url === "/api/v1/charts/RELIANCE/candles?timeframe=D&from_date=2021-05-18&to_date=2026-05-18&limit=1300") {
    response.end(chartResponse("RELIANCE", "2021-05-18", "2026-05-18", { duplicateLatest: true }));
    return;
  }

  response.writeHead(404);
  response.end(JSON.stringify({ error: "unexpected path" }));
}, async (apiUrl) => {
  const { code, stdout, stderr } = await runChecker(apiUrl);
  assert.notEqual(code, 0, "production API check should fail on duplicated latest chart candle");
  assert.match(
    stderr,
    /RELIANCE latest candle duplicates the previous session OHLCV\/volume/,
    `stderr should explain duplicate latest candle, got:\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`,
  );
});

await withServer((request, response) => {
  response.setHeader("content-type", "application/json");
  if (request.url === "/health") {
    response.end(JSON.stringify({ status: "ok" }));
    return;
  }
  if (request.url === "/api/v1/market/summary") {
    response.end(JSON.stringify({ as_of: "2026-05-18", total_stocks: 3147, advances: 1000, declines: 900, unchanged: 120 }));
    return;
  }
  if (request.url === "/api/v1/charts/RELIANCE/candles?timeframe=D&from_date=2021-05-18&to_date=2026-05-18&limit=1300") {
    const payload = JSON.parse(chartResponse("RELIANCE"));
    delete payload.coverage.five_year_contract;
    response.end(JSON.stringify(payload));
    return;
  }

  response.writeHead(404);
  response.end(JSON.stringify({ error: "unexpected path" }));
}, async (apiUrl) => {
  const { code, stdout, stderr } = await runChecker(apiUrl);
  assert.notEqual(code, 0, "production API check should fail when 5Y contract metadata is missing");
  assert.match(
    stderr,
    /RELIANCE coverage did not include five_year_contract metadata/,
    `stderr should explain missing five-year contract metadata, got:\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`,
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
  if (request.url === "/api/v1/charts/RELIANCE/candles?timeframe=D&from_date=2021-05-18&to_date=2026-05-18&limit=1300") {
    const payload = JSON.parse(chartResponse("RELIANCE"));
    payload.timeframe = "W";
    payload.coverage.timeframe = "W";
    response.end(JSON.stringify(payload));
    return;
  }

  response.writeHead(404);
  response.end(JSON.stringify({ error: "unexpected path" }));
}, async (apiUrl) => {
  const { code, stdout, stderr } = await runChecker(apiUrl);
  assert.notEqual(code, 0, "production API check should fail when 5Y smoke returns non-daily candles");
  assert.match(
    stderr,
    /5Y chart smoke must use daily candles/,
    `stderr should explain non-daily 5Y candles, got:\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`,
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

  response.writeHead(404);
  response.end(JSON.stringify({ error: "unexpected path" }));
}, async (apiUrl) => {
  const { code, stdout, stderr } = await runChecker(apiUrl);
  assert.equal(code, 0, `production API check should pass on current data:\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
  assert.match(stdout, /charts RELIANCE \d+ daily candles 2021-05-18->2026-05-18; ITC \d+ daily candles 2021-05-18->2026-05-18; AUBANK \d+ daily candles 2021-05-18->2026-05-18/);
  assert.match(stdout, /scanner skipped/);
});

await withServer((request, response) => {
  response.setHeader("content-type", "application/json");
  if (request.url === "/health") {
    response.end(JSON.stringify({ status: "ok" }));
    return;
  }
  if (request.url === "/api/v1/market/summary") {
    response.end(JSON.stringify({ as_of: "2026-05-18", total_stocks: 3147, advances: 1000, declines: 900, unchanged: 120 }));
    return;
  }
  if (request.url === "/api/v1/charts/RELIANCE/candles?timeframe=D&from_date=2021-05-18&to_date=2026-05-18&limit=1300") {
    const candles = dailyCandles("2026-01-01", 60);
    response.end(JSON.stringify({
      candles,
      coverage: {
        requested_from: "2021-05-18",
        requested_to: "2026-05-18",
        available_from: "2026-01-01",
        available_to: candles.at(-1)?.time,
        returned_candles: candles.length,
        requested_limit: 1300,
        timeframe: "D",
        symbol: "RELIANCE",
        five_year_contract: {
          years: 5,
          minimum_calendar_days: 1811,
          minimum_daily_candles: 1134,
          status: "partial",
        },
      },
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
    /RELIANCE daily 5Y chart history was too shallow: 60 candles, expected at least 1134/,
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
