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

async function runChecker(apiUrl) {
  const child = spawn(process.execPath, ["scripts/check-production-api.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PRODUCTION_API_URL: apiUrl,
      ALLOW_LOCAL_API_CHECK: "1",
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
    response.end(JSON.stringify({ as_of: "2026-05-18" }));
    return;
  }
  if (request.url === "/api/v1/charts/RELIANCE/candles?timeframe=D&limit=5") {
    response.end(JSON.stringify({
      candles: [
        { time: "2023-04-01", open: 1, high: 2, low: 1, close: 2, volume: 10 },
        { time: "2023-04-04", open: 2, high: 3, low: 2, close: 3, volume: 20 },
      ],
      coverage: { available_to: "2023-04-04" },
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
    response.end(JSON.stringify({ as_of: "2026-05-18" }));
    return;
  }
  if (request.url === "/api/v1/charts/RELIANCE/candles?timeframe=D&limit=5") {
    response.end(JSON.stringify({
      candles: [
        { time: "2026-05-15", open: 1, high: 2, low: 1, close: 2, volume: 10 },
        { time: "2026-05-18", open: 2, high: 3, low: 2, close: 3, volume: 20 },
      ],
      coverage: { available_to: "2026-05-18" },
    }));
    return;
  }

  response.writeHead(404);
  response.end(JSON.stringify({ error: "unexpected path" }));
}, async (apiUrl) => {
  const { code, stdout, stderr } = await runChecker(apiUrl);
  assert.equal(code, 0, `production API check should pass on current data:\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
  assert.match(stdout, /RELIANCE candles 2 through 2026-05-18/);
});

console.log("check-production-api fallback and candle freshness tests passed.");
