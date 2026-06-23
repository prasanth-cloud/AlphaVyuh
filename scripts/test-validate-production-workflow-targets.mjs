#!/usr/bin/env node
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { strict as assert } from "node:assert";

async function run(env) {
  const root = mkdtempSync(join(tmpdir(), "alphavyuh-production-targets-"));
  const githubEnv = join(root, "github-env");
  const child = spawn(process.execPath, ["scripts/validate-production-workflow-targets.mjs"], {
    cwd: process.cwd(),
    env: {
      PATH: process.env.PATH,
      GITHUB_ENV: githubEnv,
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const [code] = await once(child, "exit");
  const exported = code === 0 ? readFileSync(githubEnv, "utf8") : "";
  return { code, stdout, stderr, exported };
}

{
  const { code, stdout, exported } = await run({
    PRODUCTION_API_URL_INPUT: "https://alphavyuh-production.up.railway.app",
    LIVE_URL_INPUT: "https://www.alphavyuh.com",
    REQUIRE_LIVE_URL: "1",
  });
  assert.equal(code, 0);
  assert.match(stdout, /trusted production URLs/);
  assert.match(exported, /^PRODUCTION_API_URL=https:\/\/alphavyuh-production\.up\.railway\.app$/m);
  assert.match(exported, /^PLAYWRIGHT_BASE_URL=https:\/\/www\.alphavyuh\.com$/m);
}

{
  const { code, stderr } = await run({
    PRODUCTION_API_URL_INPUT: "https://evil.example.test",
  });
  assert.notEqual(code, 0);
  assert.match(stderr, /PRODUCTION_API_URL must be exactly/);
}

{
  const { code, stderr } = await run({
    PRODUCTION_API_URL_INPUT: "https://alphavyuh-production.up.railway.app.evil.test",
  });
  assert.notEqual(code, 0);
  assert.match(stderr, /PRODUCTION_API_URL must be exactly/);
}

console.log("validate-production-workflow-targets tests passed.");
