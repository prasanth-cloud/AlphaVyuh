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

function serveHealthyApi(request, response) {
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

  response.writeHead(404);
  response.end(JSON.stringify({ error: "unexpected path" }));
}

function serveRailwayFallback(request, response) {
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

function makeFakeBin({ secrets = [], railwayReady = true }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "alphavyuh-recovery-bin-"));
  const secretOutput = secrets.map((secret) => `${secret}\t2026-05-18T00:00:00Z`).join("\n");
  const gh = `#!/usr/bin/env bash
if [[ "$1" == "secret" && "$2" == "list" ]]; then
  printf '%b' ${JSON.stringify(secretOutput)}
  exit 0
fi
echo "unexpected gh args: $*" >&2
exit 1
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

  fs.writeFileSync(path.join(dir, "gh"), gh, { mode: 0o755 });
  fs.writeFileSync(path.join(dir, "railway"), railway, { mode: 0o755 });
  return dir;
}

async function runPreflight(apiUrl, fakeBin) {
  const child = spawn(process.execPath, ["scripts/check-data-recovery-readiness.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PATH: `${fakeBin}${path.delimiter}${process.env.PATH}`,
      GITHUB_REPOSITORY: "prasanth-cloud/AlphaVyuh",
      PRODUCTION_API_URL: apiUrl,
      ALLOW_LOCAL_API_CHECK: "1",
      ALPHAVYUH_BACKEND_DIR: process.cwd(),
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
  const fakeBin = makeFakeBin({ secrets: [...requiredSecrets, "PRODUCTION_API_BEARER_TOKEN"], railwayReady: true });
  const { code, stdout, stderr } = await runPreflight(apiUrl, fakeBin);
  assert.equal(code, 0, `preflight should pass on healthy production API:\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
  assert.match(stdout, /Production API data smoke/);
  assert.match(stdout, /Recovery status: production data API is serving real EOD smoke data/);
});

await withServer(serveRailwayFallback, async (apiUrl) => {
  const fakeBin = makeFakeBin({ secrets: [], railwayReady: false });
  const { code, stdout, stderr } = await runPreflight(apiUrl, fakeBin);
  assert.notEqual(code, 0, "preflight should fail when API is down and no recovery path is ready");
  assert.match(stdout, /Missing required secrets: RAILWAY_TOKEN, RAILWAY_PROJECT_ID, RAILWAY_SERVICE/);
  assert.match(stdout, /Unauthorized\. Please run railway login again/);
  assert.match(stdout, /Recovery status: backend is down and no deploy path is ready yet/);
  assert.equal(stderr, "");
});

await withServer(serveRailwayFallback, async (apiUrl) => {
  const fakeBin = makeFakeBin({ secrets: requiredSecrets, railwayReady: false });
  const { code, stdout } = await runPreflight(apiUrl, fakeBin);
  assert.notEqual(code, 0, "preflight should fail until production API recovers");
  assert.match(stdout, /Required Railway recovery secrets are present/);
  assert.match(stdout, /Recovery status: backend still needs recovery, but at least one deploy path appears ready/);
});

console.log("check-data-recovery-readiness tests passed.");
