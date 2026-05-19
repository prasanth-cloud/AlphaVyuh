#!/usr/bin/env node
import { spawn } from "node:child_process";
import { once } from "node:events";
import { strict as assert } from "node:assert";

async function run(extraEnv = {}) {
  const child = spawn(process.execPath, ["scripts/check-production-smoke-env.mjs"], {
    cwd: process.cwd(),
    env: {
      PATH: process.env.PATH,
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

{
  const { code, stderr } = await run();
  assert.notEqual(code, 0, "production smoke env check should fail with no values");
  assert.match(stderr, /PRODUCTION_API_BEARER_TOKEN/);
  assert.match(stderr, /PLAYWRIGHT_QA_EMAIL/);
  assert.match(stderr, /PLAYWRIGHT_QA_PASSWORD/);
}

{
  const { code, stdout, stderr } = await run({
    PRODUCTION_API_BEARER_TOKEN: "production-smoke-token",
    PLAYWRIGHT_QA_EMAIL: "qa@example.com",
    PLAYWRIGHT_QA_PASSWORD: "secret-password",
  });
  assert.equal(code, 0, `production smoke env check should pass with all values:\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
  assert.match(stdout, /Production signed-in smoke env ok/);
}

console.log("check-production-smoke-env tests passed.");
