#!/usr/bin/env node
import http from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strict as assert } from "node:assert";

function validMetadata(overrides = {}) {
  const sectors = [
    "Auto",
    "Banking",
    "Cement",
    "Chemicals",
    "Energy",
    "Financial Services",
    "FMCG",
    "Healthcare",
    "IT",
    "Metal",
    "Pharma",
    "Realty",
  ];
  const sectoralLabels = [
    "Nifty Auto Index",
    "Nifty Bank Index",
    "Nifty Cement Index",
    "Nifty Chemicals Index",
    "Nifty Financial Services Index",
    "Nifty FMCG Index",
    "Nifty Healthcare Index",
    "Nifty IT Index",
    "Nifty Metal Index",
    "Nifty Pharma Index",
    "Nifty Realty Index",
    "Nifty Oil and Gas Index",
  ];

  return {
    status: "ok",
    metadata: {
      source: "stock_universe.sector",
      contract_as_of: "2026-05-30",
      reference: {
        name: "NSE sectoral indices",
        url: "https://www.nseindia.com/static/products-services/indices-sectoral",
        as_of: "2026-03-02",
        relationship: "reference_only_not_equity_universe_source",
      },
      universe_taxonomy: {
        name: "AlphaVyuh equity universe sectors",
        source: "stock_universe.sector",
        relationship: "stock classification labels used for filters and analysis",
      },
      sectoral_indices: sectoralLabels.map((label) => ({ symbol: label.toUpperCase(), label, aliases: [] })),
      active_count: 3147,
      active_count_scope: "active_universe",
      classified_count: 3145,
      unmapped_count: 2,
      unmapped_symbols: ["UNKNOWN1", "UNKNOWN2"],
      unmapped_symbols_truncated: false,
      sector_counts: sectors.map((sector, index) => ({
        sector,
        active_count: 300 - index,
        aliases: [],
        related_sectoral_indices: sector === "Energy" ? ["Nifty Oil and Gas Index"] : [],
        hidden_by_filter: false,
      })),
      sector_count: sectors.length,
      display_filter: {
        minimum_active_symbols: 1,
        hidden_sector_count: 0,
        description: "All mapped sectors are shown.",
      },
      ...overrides,
    },
  };
}

async function withServer(payload, test) {
  const server = http.createServer((request, response) => {
    response.setHeader("content-type", "application/json");
    if (request.url === "/api/v1/market/sectors/audit") {
      response.end(JSON.stringify(payload));
      return;
    }
    response.writeHead(404);
    response.end(JSON.stringify({ error: "unexpected path" }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const { port } = server.address();
    await test(`http://127.0.0.1:${port}/api/v1/market/sectors/audit`);
  } finally {
    server.close();
  }
}

async function runChecker(extraEnv = {}, args = []) {
  const child = spawn(process.execPath, ["scripts/check-sector-taxonomy-contract.mjs", ...args], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      SECTOR_AUDIT_MIN_ACTIVE_COUNT: "1000",
      SECTOR_AUDIT_MIN_SECTOR_COUNT: "10",
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

function writeFixture(payload) {
  const dir = mkdtempSync(join(tmpdir(), "alphavyuh-sector-contract-"));
  const path = join(dir, "fixture.json");
  writeFileSync(path, JSON.stringify(payload));
  return path;
}

const validFixture = writeFixture(validMetadata());
{
  const { code, stdout, stderr } = await runChecker({}, ["--fixture", validFixture]);
  assert.equal(code, 0, `fixture check should pass:\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
  assert.match(stdout, /Sector taxonomy ok: 12 sectors, 3147 active symbols, 2 unmapped/);
}

await withServer(validMetadata(), async (url) => {
  const { code, stdout, stderr } = await runChecker({ SECTOR_AUDIT_URL: url, ALLOW_LOCAL_API_CHECK: "1" });
  assert.equal(code, 0, `URL check should pass:\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
  assert.match(stdout, /NSE reference 2026-03-02/);
});

{
  const payload = validMetadata({
    display_filter: {
      minimum_active_symbols: 3,
      hidden_sector_count: 1,
      description: "Sectors with fewer than 3 active symbols are hidden from this summary.",
    },
  });
  const { code, stdout, stderr } = await runChecker({}, ["--fixture", writeFixture(payload)]);
  assert.notEqual(code, 0, "checker should fail when the audit still hides small sectors");
  assert.match(
    stderr,
    /Sector audit must not hide small sectors/,
    `stderr should explain hidden sector filtering:\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`,
  );
}

{
  const payload = validMetadata({
    sectoral_indices: validMetadata().metadata.sectoral_indices.filter((item) => item.label !== "Nifty IT Index"),
  });
  const { code, stdout, stderr } = await runChecker({}, ["--fixture", writeFixture(payload)]);
  assert.notEqual(code, 0, "checker should fail when an NSE sectoral index label is missing");
  assert.match(
    stderr,
    /Missing NSE sectoral index reference label: Nifty IT Index/,
    `stderr should explain missing NSE label:\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`,
  );
}

{
  const payload = validMetadata({ unmapped_symbols: undefined });
  const { code, stdout, stderr } = await runChecker({}, ["--fixture", writeFixture(payload)]);
  assert.notEqual(code, 0, "checker should fail when unmapped symbols are not exposed");
  assert.match(
    stderr,
    /must expose unmapped_symbols/,
    `stderr should explain missing unmapped symbols:\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`,
  );
}
